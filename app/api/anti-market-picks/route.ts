import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

export const maxDuration = 60;

const API_KEY = process.env.FMP_API_KEY || '';
const BASE = 'https://financialmodelingprep.com';

let cachedData: unknown = null;
let cacheTimestamp = 0;
let cachedVersion = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 min (shorter to avoid stale empty results)
const CACHE_VERSION = 3; // bump to invalidate old cache

interface AntiMarketPick {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  deviation: number;   // σ value (price - SMA20) / ATR30
  sma20: number;
  atr30: number;
  sma130: number;
  isUptrend: boolean;   // price > SMA130
  revenueGrowth: number;
  profitMargin: number;
  rule40Score: number;
  patternScore: number; // 0-100, PLTR-like chart DNA score
  patternGrade: string; // A/B/C/D
}

// Calculate indicators from historical data (oldest-first array)
// New formula: SMA20 (monthly MA), ATR30 (30-day volatility), SMA130 (6-month trend)
function calcIndicators(prices: { close: number; high: number; low: number }[]) {
  if (prices.length < 131) return null; // need 130+ days for SMA130

  const currentPrice = prices[prices.length - 1].close;

  // SMA20 (monthly moving average)
  const recent20 = prices.slice(-20);
  const sma20 = recent20.reduce((s, d) => s + d.close, 0) / 20;

  // SMA130 (6-month trend)
  const recent130 = prices.slice(-130);
  const sma130 = recent130.reduce((s, d) => s + d.close, 0) / 130;

  // ATR30 (30-day average true range — more stable volatility measure)
  const recent31 = prices.slice(-31);
  const trValues: number[] = [];
  for (let i = 1; i < recent31.length; i++) {
    const tr = Math.max(
      recent31[i].high - recent31[i].low,
      Math.abs(recent31[i].high - recent31[i - 1].close),
      Math.abs(recent31[i].low - recent31[i - 1].close)
    );
    trValues.push(tr);
  }
  if (trValues.length === 0) return null;
  const atr30 = trValues.reduce((a, b) => a + b, 0) / trValues.length;
  if (atr30 === 0) return null;

  // σ = (price - SMA20) / ATR30
  const deviation = (currentPrice - sma20) / atr30;

  // Trend check: price > SMA130 = uptrend
  const isUptrend = currentPrice > sma130;

  return { sma20, atr30, sma130, deviation, currentPrice, isUptrend };
}

// Pattern Score: quantify "PLTR-like" chart DNA from historical prices
// Dimensions: trend consistency, pullback recovery, volatility stability, mean reversion, uptrend
function calcPatternScore(prices: { date: string; close: number; high: number; low: number }[]): { score: number; grade: string } {
  // Need at least 200 days of data
  // Use last ~500 trading days (roughly 2 years)
  const data = prices.slice(-520);
  if (data.length < 200) return { score: 0, grade: 'D' };

  // 1. TREND CONSISTENCY (max 25): % of 63-day quarters that are positive
  let posQ = 0, totalQ = 0;
  for (let i = 0; i + 62 < data.length; i += 63) {
    const ret = data[i + 62].close / data[i].close - 1;
    if (ret > 0) posQ++;
    totalQ++;
  }
  const trendScore = totalQ > 0 ? (posQ / totalQ) * 25 : 0;

  // 2. PULLBACK RECOVERY (max 25): speed of recovery from >15% drops
  let localHigh = data[0].close;
  let inPB = false, pbLow = Infinity, pbLowIdx = 0, pbHighIdx = 0;
  const pullbacks: { vRatio: number; recovDays: number }[] = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i].close > localHigh) {
      if (inPB && pbLow < localHigh) {
        const recovDays = i - pbLowIdx;
        const dropDays = pbLowIdx - pbHighIdx;
        const vRatio = dropDays > 0 ? recovDays / dropDays : 5;
        pullbacks.push({ vRatio, recovDays });
      }
      localHigh = data[i].close;
      pbHighIdx = i;
      inPB = false;
      pbLow = Infinity;
    }
    if ((data[i].close - localHigh) / localHigh <= -0.15) {
      inPB = true;
      if (data[i].close < pbLow) { pbLow = data[i].close; pbLowIdx = i; }
    }
  }
  let recoveryScore = 25;
  if (pullbacks.length > 0) {
    const avgV = pullbacks.reduce((s, p) => s + p.vRatio, 0) / pullbacks.length;
    const avgR = pullbacks.reduce((s, p) => s + p.recovDays, 0) / pullbacks.length;
    recoveryScore = Math.max(0, 25 - avgV * 5 - Math.max(0, avgR - 15) * 0.3);
  }

  // 3. VOLATILITY STABILITY (max 20): low ratio of max/min 20-day rolling vol
  const rets: number[] = [];
  for (let i = 1; i < data.length; i++) {
    rets.push((data[i].close - data[i - 1].close) / data[i - 1].close);
  }
  const vols: number[] = [];
  for (let i = 19; i < rets.length; i++) {
    const w = rets.slice(i - 19, i + 1);
    const mean = w.reduce((a, b) => a + b, 0) / 20;
    const v = w.reduce((a, b) => a + (b - mean) ** 2, 0) / 20;
    vols.push(Math.sqrt(v));
  }
  const maxV = Math.max(...vols), minV = Math.min(...vols);
  const volRatio = minV > 0 ? maxV / minV : 10;
  const volScore = Math.max(0, 20 - Math.max(0, volRatio - 3) * 3);

  // 4. MEAN REVERSION (max 20): SMA20 + ATR14 sigma recovery rate
  const indicators: { sigma: number }[] = [];
  for (let i = 20; i < data.length; i++) {
    let sum = 0;
    for (let j = i - 19; j <= i; j++) sum += data[j].close;
    const sma20 = sum / 20;
    if (i < 14) continue;
    let atrSum = 0;
    for (let j = i - 13; j <= i; j++) {
      const tr = Math.max(
        data[j].high - data[j].low,
        Math.abs(data[j].high - data[j - 1].close),
        Math.abs(data[j].low - data[j - 1].close)
      );
      atrSum += tr;
    }
    const atr14 = atrSum / 14;
    indicators.push({ sigma: atr14 > 0 ? (data[i].close - sma20) / atr14 : 0 });
  }
  let attempts = 0, success = 0, revDays: number[] = [];
  for (let i = 1; i < indicators.length; i++) {
    if (indicators[i].sigma <= -1.5 && indicators[i - 1].sigma > -1.5) {
      attempts++;
      for (let j = i + 1; j < Math.min(i + 40, indicators.length); j++) {
        if (indicators[j].sigma >= 0) { success++; revDays.push(j - i); break; }
      }
    }
  }
  const revRate = attempts > 0 ? success / attempts : 0.5;
  const avgRevD = revDays.length > 0 ? revDays.reduce((a, b) => a + b, 0) / revDays.length : 20;
  const revScore = revRate * 15 + Math.max(0, 5 - avgRevD * 0.2);

  // 5. UPTREND (max 10)
  const totalRet = data[data.length - 1].close / data[0].close - 1;
  const uptrendScore = Math.min(10, Math.max(0, totalRet * 10));

  const total = Math.round((trendScore + recoveryScore + volScore + revScore + uptrendScore) * 10) / 10;
  const grade = total >= 75 ? 'A' : total >= 60 ? 'B' : total >= 45 ? 'C' : 'D';
  return { score: total, grade };
}

export async function GET() {
  const startTime = Date.now();

  try {
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_DURATION && cachedVersion === CACHE_VERSION) {
      const response = NextResponse.json(cachedData);
      response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
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
            if (q.priceAvg50 && ((q.price - q.priceAvg50) / q.priceAvg50) * 100 < -1) {
              roughCandidates.push(q.symbol);
            }
          }
        }
      } catch { /* skip batch */ }
    }

    if (roughCandidates.length === 0) {
      // Don't cache empty results for long
      const response = NextResponse.json([]);
      response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
      trackApiCall('/api/anti-market-picks', Date.now() - startTime, false);
      return response;
    }

    // Step 3: Fetch historical data for rough candidates → calculate real SMA20/ATR14 σ
    const oversoldStocks: Map<string, { deviation: number; sma20: number; atr30: number; sma130: number; isUptrend: boolean; patternScore: number; patternGrade: string }> = new Map();

    for (let i = 0; i < roughCandidates.length; i += 10) {
      const batch = roughCandidates.slice(i, i + 10);
      await Promise.all(
        batch.map(async (symbol) => {
          try {
            const res = await fetch(
              `${BASE}/stable/historical-price-eod/full?symbol=${symbol}&apikey=${API_KEY}`,
              { signal: AbortSignal.timeout(8000) }
            );
            const raw = await res.json();
            const items = Array.isArray(raw) ? raw : (raw?.historical ?? []);
            if (items.length < 21) return;

            // Sort oldest-first
            items.sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
            const result = calcIndicators(items);
            // Criteria: uptrend (price > SMA130) + any negative deviation from SMA20
            if (result && result.isUptrend && result.deviation < -0.5) {
              const pattern = calcPatternScore(items);
              oversoldStocks.set(symbol, {
                deviation: Math.round(result.deviation * 10) / 10,
                sma20: Math.round(result.sma20 * 100) / 100,
                atr30: Math.round(result.atr30 * 100) / 100,
                sma130: Math.round(result.sma130 * 100) / 100,
                isUptrend: result.isUptrend,
                patternScore: pattern.score,
                patternGrade: pattern.grade,
              });
            }
          } catch { /* skip */ }
        })
      );
    }

    if (oversoldStocks.size === 0) {
      // Don't cache empty results for long
      const response = NextResponse.json([]);
      response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
      trackApiCall('/api/anti-market-picks', Date.now() - startTime, false);
      return response;
    }

    // Step 4: For oversold candidates (σ < -1), check Rule of 40
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
              atr30: oversold.atr30,
              sma130: oversold.sma130,
              isUptrend: oversold.isUptrend,
              revenueGrowth: Math.round(revenueGrowth * 10) / 10,
              profitMargin: Math.round(profitMargin * 10) / 10,
              rule40Score: Math.round(rule40Score * 10) / 10,
              patternScore: oversold.patternScore,
              patternGrade: oversold.patternGrade,
            } as AntiMarketPick;
          } catch { return null; }
        })
      );
      results.push(...batchResults.filter((r): r is AntiMarketPick => r !== null));
    }

    results.sort((a, b) => b.rule40Score - a.rule40Score);
    cachedData = results;
    cacheTimestamp = now;
    cachedVersion = CACHE_VERSION;

    const response = NextResponse.json(results);
    response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
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
