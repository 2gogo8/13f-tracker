import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';
import { checkRateLimit } from '@/lib/scan-lock';
import { withCache } from '@/lib/redis-cache';
import { readFileSync } from 'fs';
import { join } from 'path';

export const maxDuration = 60;

const API_KEY = process.env.FMP_API_KEY || '';
const BASE = 'https://financialmodelingprep.com';

// Redis-backed cache (falls back to in-memory when UPSTASH not configured)
const CACHE_TTL = 1800; // 30 min in seconds
const CACHE_VERSION = 16; // bumped for Redis migration

const DEFAULT_START_DATE = '2026-01-20';

interface Thresholds {
  declineMin: number;
  declineMax: number;
  r40Min: number;
  sma130Required: boolean;
}

interface AntiMarketPick {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  dropPct: number;
  peakPrice: number;
  peakDate: string;
  sma130: number;
  revenueGrowth: number;
  profitMargin: number;
  rule40Score: number;
}

export interface AntiMarketCheck {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  dropPct: number | null;
  peakPrice: number | null;
  peakDate: string | null;
  declinePass: boolean;
  sma130: number | null;
  sma130Pct: number | null;
  sma130Pass: boolean;
  revenueGrowth: number | null;
  profitMargin: number | null;
  rule40Score: number | null;
  r40Pass: boolean;
  allPass: boolean;
}

// Check continuous decline: from peak, drop is within [declineMin, declineMax]%, bounces < 40% of drop
function checkContinuousDecline(
  prices: { date: string; high: number; low: number; close: number }[],
  declineMin: number,
  declineMax: number
): { drop: number; peakPrice: number; peakDate: string; currentPrice: number } | null {
  if (prices.length < 5) return null;

  let peakPrice = 0, peakIdx = 0;
  for (let j = 0; j < prices.length; j++) {
    if (prices[j].high > peakPrice) {
      peakPrice = prices[j].high;
      peakIdx = j;
    }
  }

  const currentPrice = prices[prices.length - 1].close;
  const totalDrop = (peakPrice - currentPrice) / peakPrice * 100;

  if (totalDrop < declineMin || totalDrop > declineMax) return null;

  // Check continuous: any bounce from trough must be < 40% of drop-so-far
  let lowestSincePeak = peakPrice;
  for (let j = peakIdx + 1; j < prices.length; j++) {
    if (prices[j].close < lowestSincePeak) {
      lowestSincePeak = prices[j].close;
    }
    const dropSoFar = peakPrice - lowestSincePeak;
    if (dropSoFar > 0 && prices[j].close > lowestSincePeak) {
      const bounce = prices[j].close - lowestSincePeak;
      if (bounce / dropSoFar > 0.4) return null;
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
    const symbolsParam = searchParams.get('symbols'); // check mode when provided

    // Threshold params (with defaults)
    const declineMin = Math.max(0, parseFloat(searchParams.get('declineMin') || '0') || 0);
    const declineMax = Math.min(99, parseFloat(searchParams.get('declineMax') || '35') || 35);
    const r40Min = parseFloat(searchParams.get('r40Min') || '40') || 40;
    const sma130Required = searchParams.get('sma130Required') !== 'false';

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    const thresholds: Thresholds = { declineMin, declineMax, r40Min, sma130Required };

    // ── Check mode: verify provided symbols ─────────────────────────────────
    // ── Watchlist mode: read from data/anti-market-watchlist.json ──────────
    const mode = searchParams.get('mode');
    if (mode === 'watchlist') {
      try {
        const filePath = join(process.cwd(), 'data', 'anti-market-watchlist.json');
        const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
        const symbols: string[] = Array.isArray(raw.symbols) ? raw.symbols.filter((s: unknown) => typeof s === 'string') : [];
        if (symbols.length === 0) {
          return NextResponse.json({ watchlist: [], symbols: [], updatedAt: raw.updatedAt || '', empty: true });
        }
        const result = await doCheck(symbols, thresholds, fromDate);
        trackApiCall('/api/anti-market-picks', Date.now() - startTime, false);
        return NextResponse.json({ watchlist: result, symbols, updatedAt: raw.updatedAt || '' });
      } catch (e) {
        console.error('Watchlist read error:', e);
        return NextResponse.json({ watchlist: [], symbols: [], updatedAt: '', empty: true });
      }
    }

    if (symbolsParam) {
      const symbols = symbolsParam
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(s => /^[A-Z]{1,6}$/.test(s))
        .slice(0, 100);
      if (symbols.length === 0) return NextResponse.json([]);

      const result = await doCheck(symbols, thresholds, fromDate);
      trackApiCall('/api/anti-market-picks', Date.now() - startTime, false);
      return NextResponse.json(result);
    }

    // ── Auto scan mode ───────────────────────────────────────────────────────
    if (fromDate !== DEFAULT_START_DATE && !checkRateLimit('anti-market-dates', 5, 10 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many scan requests. Try again later.' }, { status: 429 });
    }

    const cacheKey = `anti-market:v${CACHE_VERSION}:${fromDate}-${declineMin}-${declineMax}-${r40Min}-${sma130Required}`;
    const result = await withCache(cacheKey, CACHE_TTL, () => doScan(fromDate, thresholds));

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

// ── Auto Scan ────────────────────────────────────────────────────────────────

async function doScan(fromDate: string, thresholds: Thresholds) {
  const [sp500Res, nasdaqRes] = await Promise.all([
    fetch(`${BASE}/stable/sp500-constituent?apikey=${API_KEY}`).then(r => r.json()),
    fetch(`${BASE}/stable/nasdaq-constituent?apikey=${API_KEY}`).then(r => r.json()),
  ]);

  const symbolSet = new Set<string>();
  const nameMap = new Map<string, string>();
  if (Array.isArray(sp500Res)) for (const s of sp500Res) { symbolSet.add(s.symbol); nameMap.set(s.symbol, s.name); }
  if (Array.isArray(nasdaqRes)) for (const s of nasdaqRes) { symbolSet.add(s.symbol); nameMap.set(s.symbol, s.name); }
  const allSymbols = Array.from(symbolSet);

  const quoteMap = new Map<string, { price: number; marketCap: number; name: string }>();
  for (let i = 0; i < allSymbols.length; i += 50) {
    const batch = allSymbols.slice(i, i + 50).join(',');
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

  const fromDateObj = new Date(fromDate);
  const extendedFrom = new Date(fromDateObj);
  extendedFrom.setDate(extendedFrom.getDate() - 200);
  const extendedFromStr = extendedFrom.toISOString().split('T')[0];

  interface Candidate {
    symbol: string;
    dropPct: number;
    peakPrice: number;
    peakDate: string;
    sma130: number;
  }
  const candidates: Candidate[] = [];

  for (let i = 0; i < allSymbols.length; i += 10) {
    const batch = allSymbols.slice(i, i + 10);
    await Promise.all(
      batch.map(async (symbol) => {
        try {
          const res = await fetch(
            `${BASE}/stable/historical-price-eod/full?symbol=${symbol}&from=${extendedFromStr}&apikey=${API_KEY}`,
            { signal: AbortSignal.timeout(8000) }
          );
          const raw = await res.json();
          const items = Array.isArray(raw) ? raw : [];
          if (items.length < 30) return;

          const allPrices = items.sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
          const closes = allPrices.map((d: { close: number }) => d.close);
          if (closes.length < 130) return;

          const sma130 = closes.slice(-130).reduce((a: number, b: number) => a + b, 0) / 130;
          const currentPrice = closes[closes.length - 1];

          if (thresholds.sma130Required && currentPrice < sma130) return;

          const pricesFromDate = allPrices.filter((d: { date: string }) => d.date >= fromDate);
          if (pricesFromDate.length < 5) return;

          const decline = checkContinuousDecline(pricesFromDate, thresholds.declineMin, thresholds.declineMax);
          if (!decline) return;

          candidates.push({
            symbol,
            dropPct: decline.drop,
            peakPrice: decline.peakPrice,
            peakDate: decline.peakDate,
            sma130: Math.round(sma130 * 100) / 100,
          });
        } catch {}
      })
    );
  }

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
          if (rule40Score < thresholds.r40Min) return;

          const quote = quoteMap.get(cand.symbol);
          results.push({
            symbol: cand.symbol,
            name: quote?.name || nameMap.get(cand.symbol) || cand.symbol,
            price: quote?.price || 0,
            marketCap: quote?.marketCap || 0,
            dropPct: cand.dropPct,
            peakPrice: cand.peakPrice,
            peakDate: cand.peakDate,
            sma130: cand.sma130,
            revenueGrowth: Math.round(revenueGrowth * 10) / 10,
            profitMargin: Math.round(profitMargin * 10) / 10,
            rule40Score: Math.round(rule40Score * 10) / 10,
          });
        } catch {}
      })
    );
  }

  results.sort((a, b) => b.rule40Score - a.rule40Score);
  return results;
}

// ── Check Mode: verify given symbols ────────────────────────────────────────

async function doCheck(symbols: string[], thresholds: Thresholds, fromDate: string): Promise<AntiMarketCheck[]> {
  // 1. Batch quotes
  const quoteMap = new Map<string, { price: number; marketCap: number; name: string }>();
  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50).join(',');
    try {
      const res = await fetch(`${BASE}/stable/batch-quote?symbols=${batch}&apikey=${API_KEY}`, {
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const q of data) {
          if (q?.symbol) {
            quoteMap.set(q.symbol, { price: q.price || 0, marketCap: q.marketCap || 0, name: q.name || q.symbol });
          }
        }
      }
    } catch {}
  }

  // 2. Price history for each symbol
  const fromDateObj = new Date(fromDate);
  const extendedFrom = new Date(fromDateObj);
  extendedFrom.setDate(extendedFrom.getDate() - 200);
  const extendedFromStr = extendedFrom.toISOString().split('T')[0];

  interface PriceResult {
    sma130: number;
    sma130Pct: number;
    sma130Pass: boolean;
    dropPct: number | null;
    peakPrice: number | null;
    peakDate: string | null;
    declinePass: boolean;
  }

  const priceMap = new Map<string, PriceResult | null>();

  for (let i = 0; i < symbols.length; i += 10) {
    const batch = symbols.slice(i, i + 10);
    await Promise.all(batch.map(async (symbol) => {
      try {
        const res = await fetch(
          `${BASE}/stable/historical-price-eod/full?symbol=${symbol}&from=${extendedFromStr}&apikey=${API_KEY}`,
          { signal: AbortSignal.timeout(8000) }
        );
        const raw = await res.json();
        const items = Array.isArray(raw) ? raw : [];
        if (items.length < 30) { priceMap.set(symbol, null); return; }

        const allPrices = items.sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
        const closes = allPrices.map((d: { close: number }) => d.close);
        if (closes.length < 130) { priceMap.set(symbol, null); return; }

        const sma130 = closes.slice(-130).reduce((a: number, b: number) => a + b, 0) / 130;
        const currentPrice = closes[closes.length - 1];
        const sma130Pct = Math.round((currentPrice / sma130 - 1) * 1000) / 10;
        const sma130Pass = !thresholds.sma130Required || currentPrice >= sma130;

        const pricesFromDate = allPrices.filter((d: { date: string }) => d.date >= fromDate);

        let dropPct: number | null = null;
        let peakPrice: number | null = null;
        let peakDate: string | null = null;
        let declinePass = false;

        if (pricesFromDate.length >= 3) {
          // Find peak for reporting (regardless of threshold)
          let maxPeak = 0, maxPeakIdx = 0;
          for (let j = 0; j < pricesFromDate.length; j++) {
            if (pricesFromDate[j].high > maxPeak) {
              maxPeak = pricesFromDate[j].high;
              maxPeakIdx = j;
            }
          }
          const rawDrop = (maxPeak - currentPrice) / maxPeak * 100;
          dropPct = Math.round(rawDrop * 10) / 10;
          peakPrice = Math.round(maxPeak * 100) / 100;
          peakDate = pricesFromDate[maxPeakIdx]?.date ?? null;

          // Check continuous decline condition
          const contCheck = checkContinuousDecline(pricesFromDate, thresholds.declineMin, thresholds.declineMax);
          declinePass = contCheck !== null;
        }

        priceMap.set(symbol, {
          sma130: Math.round(sma130 * 100) / 100,
          sma130Pct,
          sma130Pass,
          dropPct,
          peakPrice,
          peakDate,
          declinePass,
        });
      } catch {
        priceMap.set(symbol, null);
      }
    }));
  }

  // 3. R40 for each symbol
  interface R40Result {
    revenueGrowth: number;
    profitMargin: number;
    rule40Score: number;
    r40Pass: boolean;
  }
  const r40Map = new Map<string, R40Result | null>();

  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    await Promise.all(batch.map(async (symbol) => {
      try {
        const res = await fetch(
          `${BASE}/stable/analyst-estimates?symbol=${symbol}&period=annual&limit=6&apikey=${API_KEY}`,
          { signal: AbortSignal.timeout(8000) }
        );
        const estimates = await res.json();
        if (!Array.isArray(estimates) || estimates.length < 2) { r40Map.set(symbol, null); return; }

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
        if (!revCY2025 || !revCY2026) { r40Map.set(symbol, null); return; }

        const revenueGrowth = ((revCY2026 - revCY2025) / revCY2025) * 100;
        const profitMargin = revCY2026 > 0 ? (netIncomeCY2026 / revCY2026) * 100 : 0;
        const rule40Score = revenueGrowth + profitMargin;

        r40Map.set(symbol, {
          revenueGrowth: Math.round(revenueGrowth * 10) / 10,
          profitMargin: Math.round(profitMargin * 10) / 10,
          rule40Score: Math.round(rule40Score * 10) / 10,
          r40Pass: rule40Score >= thresholds.r40Min,
        });
      } catch {
        r40Map.set(symbol, null);
      }
    }));
  }

  // 4. Combine results
  return symbols.map((symbol) => {
    const quote = quoteMap.get(symbol);
    const price = priceMap.get(symbol);
    const r40 = r40Map.get(symbol);

    const declinePass = price?.declinePass ?? false;
    const sma130Pass = price?.sma130Pass ?? false;
    const r40Pass = r40?.r40Pass ?? false;

    return {
      symbol,
      name: quote?.name || symbol,
      price: quote?.price || 0,
      marketCap: quote?.marketCap || 0,
      dropPct: price?.dropPct ?? null,
      peakPrice: price?.peakPrice ?? null,
      peakDate: price?.peakDate ?? null,
      declinePass,
      sma130: price?.sma130 ?? null,
      sma130Pct: price?.sma130Pct ?? null,
      sma130Pass,
      revenueGrowth: r40?.revenueGrowth ?? null,
      profitMargin: r40?.profitMargin ?? null,
      rule40Score: r40?.rule40Score ?? null,
      r40Pass,
      allPass: declinePass && sma130Pass && r40Pass,
    };
  });
}
