import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';
import { withScanLock, checkRateLimit } from '@/lib/scan-lock';

export const maxDuration = 60;

const API_KEY = process.env.FMP_API_KEY || '';
const BASE = 'https://financialmodelingprep.com';

// Cache per fromDate
const cacheMap = new Map<string, { data: unknown; timestamp: number; version: number }>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 min
const CACHE_VERSION = 13; // dynamic fromDate support

const DEFAULT_START_DATE = '2026-01-20';

interface AntiMarketPick {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  dropPct: number;        // continuous decline %
  peakPrice: number;
  peakDate: string;
  slopeScore: number;     // 0-100: how similar slope is to IXIC (100=identical)
  slopeStock: number;     // stock's 7-day slope
  slopeIxic: number;      // IXIC's 7-day slope
  revenueGrowth: number;
  profitMargin: number;
  rule40Score: number;
}

// Linear regression slope as % per day (normalized by first price)
function linearSlope(prices: number[]): number | null {
  const n = prices.length;
  if (n < 3) return null;
  const base = prices[0];
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    const y = (prices[i] / base - 1) * 100;
    sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i;
  }
  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
}

// Check continuous decline: from peak, drop is 0-35%, bounces < 40% of drop
function checkContinuousDecline(prices: { date: string; high: number; low: number; close: number }[]): {
  drop: number; peakPrice: number; peakDate: string; currentPrice: number;
} | null {
  if (prices.length < 5) return null;

  // Find peak from START_DATE onwards
  let peakPrice = 0, peakIdx = 0;
  for (let j = 0; j < prices.length; j++) {
    if (prices[j].high > peakPrice) {
      peakPrice = prices[j].high;
      peakIdx = j;
    }
  }

  const currentPrice = prices[prices.length - 1].close;
  const totalDrop = (peakPrice - currentPrice) / peakPrice * 100;

  // Must be declining 0-35%
  if (totalDrop < 0 || totalDrop > 35) return null;

  // Check continuous: any bounce from trough must be < 40% of drop-so-far
  let lowestSincePeak = peakPrice;
  for (let j = peakIdx + 1; j < prices.length; j++) {
    if (prices[j].close < lowestSincePeak) {
      lowestSincePeak = prices[j].close;
    }

    // Use CLOSE price for bounce check (not intraday high)
    const dropSoFar = peakPrice - lowestSincePeak;
    if (dropSoFar > 0 && prices[j].close > lowestSincePeak) {
      const bounce = prices[j].close - lowestSincePeak;
      if (bounce / dropSoFar > 0.4) {
        return null; // bounce too big, not continuous
      }
    }
  }

  return {
    drop: Math.round(totalDrop * 10) / 10,
    peakPrice: Math.round(peakPrice * 100) / 100,
    peakDate: prices[peakIdx].date,
    currentPrice,
  };
}

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get('fromDate') || DEFAULT_START_DATE;
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    // Rate limit: max 5 unique dates per 10 minutes (per serverless instance)
    if (fromDate !== DEFAULT_START_DATE && !checkRateLimit('anti-market-dates', 5, 10 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many scan requests. Try again later.' }, { status: 429 });
    }

    const now = Date.now();
    const cached = cacheMap.get(fromDate);
    if (cached && now - cached.timestamp < CACHE_DURATION && cached.version === CACHE_VERSION) {
      const response = NextResponse.json(cached.data);
      response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
      trackApiCall('/api/anti-market-picks', Date.now() - startTime, false);
      return response;
    }

    // Use scan lock to prevent thundering herd
    const result = await withScanLock(`anti-market-${fromDate}`, async () => {
      // Double-check cache inside lock (another request may have populated it)
      const cached2 = cacheMap.get(fromDate);
      if (cached2 && Date.now() - cached2.timestamp < CACHE_DURATION && cached2.version === CACHE_VERSION) {
        return cached2.data;
      }
      return doScan(fromDate);
    });

    const response = NextResponse.json(result);
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

async function doScan(fromDate: string) {
    // Step 1: Get IXIC 7-day slope
    let ixicSlope: number | null = null;
    try {
      const ixicRes = await fetch(
        `${BASE}/stable/historical-price-eod/full?symbol=^IXIC&from=${getDateStr(-14)}&apikey=${API_KEY}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const ixicData = await ixicRes.json();
      if (Array.isArray(ixicData) && ixicData.length >= 5) {
        const sorted = ixicData.sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date)).slice(-7);
        ixicSlope = linearSlope(sorted.map((d: { close: number }) => d.close));
      }
    } catch {}

    if (ixicSlope === null) {
      return [];
    }

    // Step 2: Get stock universe
    const [sp500Res, nasdaqRes] = await Promise.all([
      fetch(`${BASE}/stable/sp500-constituent?apikey=${API_KEY}`).then(r => r.json()),
      fetch(`${BASE}/stable/nasdaq-constituent?apikey=${API_KEY}`).then(r => r.json()),
    ]);

    const symbolSet = new Set<string>();
    const nameMap = new Map<string, string>();
    if (Array.isArray(sp500Res)) for (const s of sp500Res) { symbolSet.add(s.symbol); nameMap.set(s.symbol, s.name); }
    if (Array.isArray(nasdaqRes)) for (const s of nasdaqRes) { symbolSet.add(s.symbol); nameMap.set(s.symbol, s.name); }
    const allSymbols = Array.from(symbolSet);

    // Step 3: Batch quotes for price/marketCap
    const quoteMap = new Map<string, { price: number; marketCap: number; name: string }>();
    const batchSize = 50;
    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize).join(',');
      try {
        const res = await fetch(`${BASE}/stable/batch-quote?symbols=${batch}&apikey=${API_KEY}`, {
          signal: AbortSignal.timeout(10000),
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const q of data) {
            if (q?.symbol && q?.price) {
              quoteMap.set(q.symbol, { price: q.price, marketCap: q.marketCap || 0, name: q.name || nameMap.get(q.symbol) || q.symbol });
            }
          }
        }
      } catch {}
    }

    // Step 4: Fetch historical from START_DATE for ALL stocks, check continuous decline + slope
    interface Candidate {
      symbol: string;
      dropPct: number;
      peakPrice: number;
      peakDate: string;
      slopeStock: number;
      slopeScore: number;
    }
    const candidates: Candidate[] = [];

    for (let i = 0; i < allSymbols.length; i += 10) {
      const batch = allSymbols.slice(i, i + 10);
      await Promise.all(
        batch.map(async (symbol) => {
          try {
            const res = await fetch(
              `${BASE}/stable/historical-price-eod/full?symbol=${symbol}&from=${fromDate}&apikey=${API_KEY}`,
              { signal: AbortSignal.timeout(8000) }
            );
            const raw = await res.json();
            const items = Array.isArray(raw) ? raw : [];
            if (items.length < 5) return;

            const prices = items.sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));

            // Check continuous decline 0-35%
            const decline = checkContinuousDecline(prices);
            if (!decline) return;

            // Check 7-day slope similarity to IXIC
            const last7 = prices.slice(-7);
            const stockSlope = linearSlope(last7.map((d: { close: number }) => d.close));
            if (stockSlope === null) return;

            // Slope similarity: ratio of difference to IXIC slope
            const slopeDiff = Math.abs(stockSlope - ixicSlope!);
            const slopeRatio = Math.abs(ixicSlope!) > 0.01 ? slopeDiff / Math.abs(ixicSlope!) : slopeDiff;
            if (slopeRatio > 0.5 && slopeDiff > 0.3) return; // too different from IXIC

            // Convert slope similarity to 0-100 score (100 = identical)
            const slopeScore = Math.round(Math.max(0, 100 - slopeRatio * 100));

            candidates.push({
              symbol,
              dropPct: decline.drop,
              peakPrice: decline.peakPrice,
              peakDate: decline.peakDate,
              slopeStock: Math.round(stockSlope * 10000) / 10000,
              slopeScore,
            });
          } catch {}
        })
      );
    }

    // Step 5: Check R40 for candidates
    const results: AntiMarketPick[] = [];

    for (let i = 0; i < candidates.length; i += 5) {
      const batch = candidates.slice(i, i + 5);
      await Promise.all(
        batch.map(async (cand) => {
          try {
            const estRes = await fetch(
              `${BASE}/stable/analyst-estimates?symbol=${cand.symbol}&period=annual&limit=6&apikey=${API_KEY}`,
              { signal: AbortSignal.timeout(8000) }
            );
            const estimates = await estRes.json();
            if (!Array.isArray(estimates) || estimates.length < 2) return;

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
            if (!revCY2025 || !revCY2026) return;

            const revenueGrowth = ((revCY2026 - revCY2025) / revCY2025) * 100;
            const profitMargin = revCY2026 > 0 ? (netIncomeCY2026 / revCY2026) * 100 : 0;
            const rule40Score = revenueGrowth + profitMargin;
            if (rule40Score < 40) return;

            const quote = quoteMap.get(cand.symbol);

            results.push({
              symbol: cand.symbol,
              name: quote?.name || nameMap.get(cand.symbol) || cand.symbol,
              price: quote?.price || 0,
              marketCap: quote?.marketCap || 0,
              dropPct: cand.dropPct,
              peakPrice: cand.peakPrice,
              peakDate: cand.peakDate,
              slopeScore: cand.slopeScore,
              slopeStock: cand.slopeStock,
              slopeIxic: Math.round(ixicSlope! * 10000) / 10000,
              revenueGrowth: Math.round(revenueGrowth * 10) / 10,
              profitMargin: Math.round(profitMargin * 10) / 10,
              rule40Score: Math.round(rule40Score * 10) / 10,
            });
          } catch {}
        })
      );
    }

    results.sort((a, b) => b.dropPct - a.dropPct); // most declined first
    cacheMap.set(fromDate, { data: results, timestamp: Date.now(), version: CACHE_VERSION });
    // Keep cache map small — max 5 dates
    if (cacheMap.size > 5) {
      const oldest = [...cacheMap.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) cacheMap.delete(oldest[0]);
    }

    return results;
}

function getDateStr(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}
