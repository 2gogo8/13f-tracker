import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

export const maxDuration = 60;

const API_KEY = process.env.FMP_API_KEY || '';
const BASE = 'https://financialmodelingprep.com';

let cachedData: unknown = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

interface AntiMarketPick {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  deviation: number;   // σ value (SMA20/ATR14)
  sma20: number;
  atr14: number;
  revenueGrowth: number;
  profitMargin: number;
  rule40Score: number;
}

// Calculate SMA20 and ATR14 from historical data (oldest-first array)
function calcIndicators(prices: { close: number; high: number; low: number }[]) {
  if (prices.length < 21) return null;
  const recent21 = prices.slice(-21);
  const recent20 = recent21.slice(-20);
  const sma20 = recent20.reduce((s, d) => s + d.close, 0) / 20;

  // ATR14 from last 15 entries
  const recent15 = prices.slice(-15);
  const trValues: number[] = [];
  for (let i = 1; i < recent15.length; i++) {
    const tr = Math.max(
      recent15[i].high - recent15[i].low,
      Math.abs(recent15[i].high - recent15[i - 1].close),
      Math.abs(recent15[i].low - recent15[i - 1].close)
    );
    trValues.push(tr);
  }
  if (trValues.length === 0) return null;
  const atr14 = trValues.reduce((a, b) => a + b, 0) / trValues.length;
  if (atr14 === 0) return null;

  const currentPrice = prices[prices.length - 1].close;
  const deviation = (currentPrice - sma20) / atr14;

  return { sma20, atr14, deviation, currentPrice };
}

export async function GET() {
  const startTime = Date.now();

  try {
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_DURATION) {
      const response = NextResponse.json(cachedData);
      response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      trackApiCall('/api/anti-market-picks', Date.now() - startTime, false);
      return response;
    }

    // Step 1: Get stock universe
    const [sp500Res, nasdaqRes] = await Promise.all([
      fetch(`${BASE}/stable/sp500-constituent?apikey=${API_KEY}`).then(r => r.json()),
      fetch(`${BASE}/stable/nasdaq-constituent?apikey=${API_KEY}`).then(r => r.json()),
    ]);

    const symbolSet = new Set<string>();
    if (Array.isArray(sp500Res)) for (const s of sp500Res) symbolSet.add(s.symbol);
    if (Array.isArray(nasdaqRes)) for (const s of nasdaqRes) symbolSet.add(s.symbol);
    const allSymbols = Array.from(symbolSet);

    // Step 2: Batch fetch quotes — rough pre-filter with SMA50 (> -3% below)
    const batchSize = 40;
    const allQuotes: Map<string, { symbol: string; name: string; price: number; marketCap: number }> = new Map();
    const roughCandidates: string[] = [];

    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize).join(',');
      try {
        const res = await fetch(`${BASE}/stable/batch-quote?symbols=${batch}&apikey=${API_KEY}`, {
          signal: AbortSignal.timeout(10000),
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const q of data) {
            if (!q?.symbol || !q?.price) continue;
            allQuotes.set(q.symbol, { symbol: q.symbol, name: q.name, price: q.price, marketCap: q.marketCap });
            // Rough pre-filter: at least 3% below SMA50 → worth checking SMA20
            if (q.priceAvg50 && ((q.price - q.priceAvg50) / q.priceAvg50) * 100 < -3) {
              roughCandidates.push(q.symbol);
            }
          }
        }
      } catch { /* skip batch */ }
    }

    if (roughCandidates.length === 0) {
      cachedData = [];
      cacheTimestamp = now;
      const response = NextResponse.json([]);
      response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      trackApiCall('/api/anti-market-picks', Date.now() - startTime, false);
      return response;
    }

    // Step 3: Fetch historical data for rough candidates → calculate real SMA20/ATR14 σ
    const oversoldStocks: Map<string, { deviation: number; sma20: number; atr14: number }> = new Map();

    for (let i = 0; i < roughCandidates.length; i += 10) {
      const batch = roughCandidates.slice(i, i + 10);
      await Promise.all(
        batch.map(async (symbol) => {
          try {
            const res = await fetch(
              `${BASE}/stable/historical-price-eod/light?symbol=${symbol}&from=${getDateStr(-60)}&to=${getDateStr(0)}&apikey=${API_KEY}`,
              { signal: AbortSignal.timeout(8000) }
            );
            const raw = await res.json();
            const items = Array.isArray(raw) ? raw : (raw?.historical ?? []);
            if (items.length < 21) return;

            // Sort oldest-first
            items.sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
            const result = calcIndicators(items);
            if (result && result.deviation < -2) {
              oversoldStocks.set(symbol, {
                deviation: Math.round(result.deviation * 10) / 10,
                sma20: Math.round(result.sma20 * 100) / 100,
                atr14: Math.round(result.atr14 * 100) / 100,
              });
            }
          } catch { /* skip */ }
        })
      );
    }

    if (oversoldStocks.size === 0) {
      cachedData = [];
      cacheTimestamp = now;
      const response = NextResponse.json([]);
      response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      trackApiCall('/api/anti-market-picks', Date.now() - startTime, false);
      return response;
    }

    // Step 4: For oversold candidates (σ < -2), check Rule of 40
    const oversoldSymbols = Array.from(oversoldStocks.keys());
    const results: AntiMarketPick[] = [];

    for (let i = 0; i < oversoldSymbols.length; i += 5) {
      const batch = oversoldSymbols.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const estRes = await fetch(
              `${BASE}/stable/analyst-estimates?symbol=${symbol}&period=annual&limit=6&apikey=${API_KEY}`,
              { signal: AbortSignal.timeout(8000) }
            );
            const estimates = await estRes.json();
            if (!Array.isArray(estimates) || estimates.length < 2) return null;

            let revCY2025 = 0, revCY2026 = 0, netIncomeCY2026 = 0;
            for (const est of estimates) {
              const d = new Date(est.date);
              const calYear = d.getMonth() <= 5 ? d.getFullYear() - 1 : d.getFullYear();
              if (calYear === 2025 && !revCY2025) revCY2025 = est.revenueAvg;
              if (calYear === 2026 && !revCY2026) {
                revCY2026 = est.revenueAvg;
                netIncomeCY2026 = est.netIncomeAvg;
              }
            }
            if (!revCY2025 || !revCY2026) return null;

            const revenueGrowth = ((revCY2026 - revCY2025) / revCY2025) * 100;
            const profitMargin = revCY2026 > 0 ? (netIncomeCY2026 / revCY2026) * 100 : 0;
            const rule40Score = revenueGrowth + profitMargin;
            if (rule40Score < 40) return null;

            const quote = allQuotes.get(symbol);
            const oversold = oversoldStocks.get(symbol)!;
            return {
              symbol,
              name: quote?.name || symbol,
              price: quote?.price || 0,
              marketCap: quote?.marketCap || 0,
              deviation: oversold.deviation,
              sma20: oversold.sma20,
              atr14: oversold.atr14,
              revenueGrowth: Math.round(revenueGrowth * 10) / 10,
              profitMargin: Math.round(profitMargin * 10) / 10,
              rule40Score: Math.round(rule40Score * 10) / 10,
            } as AntiMarketPick;
          } catch { return null; }
        })
      );
      results.push(...batchResults.filter((r): r is AntiMarketPick => r !== null));
    }

    results.sort((a, b) => b.rule40Score - a.rule40Score);
    cachedData = results;
    cacheTimestamp = now;

    const response = NextResponse.json(results);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    trackApiCall('/api/anti-market-picks', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error('Error in anti-market picks:', error);
    trackApiCall('/api/anti-market-picks', Date.now() - startTime, true);
    return NextResponse.json([]);
  }
}

function getDateStr(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}
