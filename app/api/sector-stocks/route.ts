import { NextRequest, NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

export const maxDuration = 60;

const API_KEY = process.env.FMP_API_KEY || '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const BASE = 'https://financialmodelingprep.com';

// Map Chinese sector names to English GICS sectors
const SECTOR_MAP: Record<string, string[]> = {
  '科技': ['Technology'],
  '金融': ['Financial Services', 'Financial'],
  '能源': ['Energy'],
  '醫療': ['Healthcare'],
  '必需': ['Consumer Defensive'],
  '消費': ['Consumer Cyclical'],
  '公用': ['Utilities'],
  '地產': ['Real Estate'],
  '原料': ['Basic Materials'],
  '工業': ['Industrials'],
  '通訊': ['Communication Services'],
};

interface StockResult {
  symbol: string;
  name: string;
  price: number;
  change: number;
  deviation: number | null;
  patternScore: number | null;
  patternGrade: string | null;
  sma20: number | null;
}

function calcPatternScore(prices: { close: number; high: number; low: number }[]): { score: number; grade: string } {
  if (prices.length < 252) return { score: 0, grade: 'D' };
  const data = prices.slice(-520);
  let score = 0;

  // 1. TREND CONSISTENCY (max 25)
  const windows = [20, 60, 120];
  let trendPts = 0;
  for (const w of windows) {
    if (data.length < w * 2) continue;
    let aboveCount = 0;
    for (let i = w; i < data.length; i++) {
      const ma = data.slice(i - w, i).reduce((s, d) => s + d.close, 0) / w;
      if (data[i].close > ma) aboveCount++;
    }
    const ratio = aboveCount / (data.length - w);
    trendPts += ratio > 0.6 ? 8.33 : ratio > 0.5 ? 5 : 2;
  }
  score += Math.min(25, trendPts);

  // 2. PULLBACK RECOVERY (max 25)
  const indicators: { sigma: number }[] = [];
  for (let i = 20; i < data.length; i++) {
    const sma20 = data.slice(i - 20, i).reduce((s, d) => s + d.close, 0) / 20;
    if (i < 14) { indicators.push({ sigma: 0 }); continue; }
    let trSum = 0;
    for (let j = i - 14; j < i; j++) {
      const h = data[j].high, l = data[j].low, pc = data[j - 1]?.close || data[j].close;
      trSum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    const atr14 = trSum / 14;
    indicators.push({ sigma: atr14 > 0 ? (data[i].close - sma20) / atr14 : 0 });
  }
  let pullbacks = 0, recoveries = 0, revDays: number[] = [];
  for (let i = 1; i < indicators.length; i++) {
    if (indicators[i].sigma <= -1.5 && indicators[i - 1].sigma > -1.5) {
      pullbacks++;
      for (let j = i + 1; j < Math.min(i + 60, indicators.length); j++) {
        if (indicators[j].sigma >= 0) { recoveries++; revDays.push(j - i); break; }
      }
    }
  }
  const revRate = pullbacks > 0 ? recoveries / pullbacks : 0;
  score += revRate * 25;

  // 3. VOLATILITY STABILITY (max 20)
  const atrPcts: number[] = [];
  for (let i = 34; i < data.length; i += 20) {
    let trSum = 0;
    for (let j = i - 14; j < i; j++) {
      const h = data[j].high, l = data[j].low, pc = data[j - 1]?.close || data[j].close;
      trSum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    atrPcts.push((trSum / 14) / data[i].close * 100);
  }
  if (atrPcts.length > 1) {
    const mean = atrPcts.reduce((s, v) => s + v, 0) / atrPcts.length;
    const std = Math.sqrt(atrPcts.reduce((s, v) => s + (v - mean) ** 2, 0) / atrPcts.length);
    const cv = std / mean;
    score += cv < 0.3 ? 20 : cv < 0.5 ? 15 : cv < 0.7 ? 10 : 5;
  }

  // 4. MEAN REVERSION QUALITY (max 20)
  const avgRevDays = revDays.length > 0 ? revDays.reduce((s, v) => s + v, 0) / revDays.length : 30;
  score += avgRevDays < 10 ? 20 : avgRevDays < 15 ? 15 : avgRevDays < 25 ? 10 : 5;

  // 5. UPTREND STRENGTH (max 10)
  if (data.length >= 252) {
    const yearReturn = (data[data.length - 1].close - data[data.length - 252].close) / data[data.length - 252].close;
    score += yearReturn > 0.3 ? 10 : yearReturn > 0.15 ? 7 : yearReturn > 0 ? 4 : 0;
  }

  score = Math.round(score * 10) / 10;
  const grade = score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 45 ? 'C' : 'D';
  return { score, grade };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const sectorName = request.nextUrl.searchParams.get('sector') || '';
  
  if (!sectorName) {
    return NextResponse.json({ error: 'Missing sector parameter' }, { status: 400 });
  }

  try {
    // Get all constituents
    const [sp500Res, nasdaqRes] = await Promise.all([
      fetch(`${BASE}/stable/sp500-constituent?apikey=${API_KEY}`),
      fetch(`${BASE}/stable/nasdaq-constituent?apikey=${API_KEY}`),
    ]);
    const sp500 = await sp500Res.json();
    const nasdaq = await nasdaqRes.json();

    // Merge & deduplicate
    const allMap = new Map<string, { symbol: string; name: string; sector: string }>();
    for (const s of [...(Array.isArray(sp500) ? sp500 : []), ...(Array.isArray(nasdaq) ? nasdaq : [])]) {
      if (!allMap.has(s.symbol)) {
        allMap.set(s.symbol, { symbol: s.symbol, name: s.name || s.symbol, sector: s.sector || '' });
      }
    }

    // Filter by sector
    const englishSectors = SECTOR_MAP[sectorName] || [sectorName];
    const sectorStocks = Array.from(allMap.values()).filter(s => 
      englishSectors.some(es => s.sector.toLowerCase().includes(es.toLowerCase()))
    );

    if (sectorStocks.length === 0) {
      return NextResponse.json([]);
    }

    // Batch quote for prices
    const symbols = sectorStocks.map(s => s.symbol);
    const batchSize = 50;
    const quoteMap = new Map<string, { price: number; change: number; priceAvg50: number }>();
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize).join(',');
      try {
        const res = await fetch(`${BASE}/stable/batch-quote?symbols=${batch}&apikey=${API_KEY}`);
        const quotes = await res.json();
        if (Array.isArray(quotes)) {
          for (const q of quotes) {
            quoteMap.set(q.symbol, { price: q.price, change: q.changesPercentage || 0, priceAvg50: q.priceAvg50 || 0 });
          }
        }
      } catch {}
    }

    // For stocks below SMA50, fetch historical to compute SMA20/ATR + pattern
    const candidates = sectorStocks.filter(s => {
      const q = quoteMap.get(s.symbol);
      return q && q.price > 0;
    });

    const results: StockResult[] = [];
    const histPromises = candidates.map(async (stock) => {
      const q = quoteMap.get(stock.symbol)!;
      let deviation: number | null = null;
      let patternScore: number | null = null;
      let patternGrade: string | null = null;
      let sma20: number | null = null;

      try {
        const hRes = await fetch(`${BASE}/stable/historical-price-eod/full?symbol=${stock.symbol}&apikey=${API_KEY}`);
        const hist = await hRes.json();
        if (Array.isArray(hist) && hist.length >= 131) {
          const prices = hist.sort((a: { date: string }, b: { date: string }) => new Date(a.date).getTime() - new Date(b.date).getTime());
          const recent = prices.slice(-131);
          
          const sma20Val = recent.slice(-20).reduce((s: number, d: { close: number }) => s + d.close, 0) / 20;
          sma20 = +sma20Val.toFixed(2);
          
          let trSum = 0;
          for (let i = recent.length - 30; i < recent.length; i++) {
            const h = recent[i].high, l = recent[i].low, pc = recent[i - 1]?.close || recent[i].close;
            trSum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
          }
          const atr30 = trSum / 30;
          const currentPrice = recent[recent.length - 1].close;
          deviation = atr30 > 0 ? +((currentPrice - sma20Val) / atr30).toFixed(2) : null;

          // Pattern score
          const ps = calcPatternScore(prices.slice(-520));
          patternScore = ps.score;
          patternGrade = ps.grade;
        }
      } catch {}

      results.push({
        symbol: stock.symbol,
        name: stock.name,
        price: q.price,
        change: q.change,
        deviation,
        patternScore,
        patternGrade,
        sma20,
      });
    });

    // Process in batches of 10 to avoid rate limits
    for (let i = 0; i < histPromises.length; i += 10) {
      await Promise.all(histPromises.slice(i, i + 10));
    }

    // Sort by deviation (most oversold first), nulls last
    results.sort((a, b) => {
      if (a.deviation === null && b.deviation === null) return 0;
      if (a.deviation === null) return 1;
      if (b.deviation === null) return -1;
      return a.deviation - b.deviation;
    });

    const response = NextResponse.json(results);
    response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
    trackApiCall('/api/sector-stocks', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error('sector-stocks error:', error);
    return NextResponse.json({ error: 'Failed to fetch sector stocks' }, { status: 500 });
  }
}
