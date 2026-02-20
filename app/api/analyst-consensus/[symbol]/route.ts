import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

export const maxDuration = 30;

const API_KEY = process.env.FMP_API_KEY || '';
const BASE = 'https://financialmodelingprep.com';

// In-memory cache per symbol, 30 min
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();
  const { symbol } = await params;
  const sym = symbol.toUpperCase();

  const cached = cache.get(sym);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    const res = NextResponse.json(cached.data);
    res.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
    res.headers.set('CDN-Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
    trackApiCall(`/api/analyst-consensus/${sym}`, Date.now() - startTime, false);
    return res;
  }

  try {
    const [consensusRes, summaryRes] = await Promise.all([
      fetch(`${BASE}/stable/price-target-consensus?symbol=${sym}&apikey=${API_KEY}`, {
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${BASE}/stable/price-target-summary?symbol=${sym}&apikey=${API_KEY}`, {
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    const consensus = await consensusRes.json();
    const summary = await summaryRes.json();

    const c = Array.isArray(consensus) ? consensus[0] : consensus;
    const s = Array.isArray(summary) ? summary[0] : summary;

    const result = {
      symbol: sym,
      // Price targets
      targetHigh: c?.targetHigh || null,
      targetLow: c?.targetLow || null,
      targetConsensus: c?.targetConsensus || null,
      targetMedian: c?.targetMedian || null,
      // Analyst counts
      lastMonthCount: s?.lastMonthCount || 0,
      lastMonthAvg: s?.lastMonthAvgPriceTarget || null,
      lastQuarterCount: s?.lastQuarterCount || 0,
      lastQuarterAvg: s?.lastQuarterAvgPriceTarget || null,
      lastYearCount: s?.lastYearCount || 0,
      lastYearAvg: s?.lastYearAvgPriceTarget || null,
      allTimeCount: s?.allTimeCount || 0,
      publishers: s?.publishers ? JSON.parse(s.publishers) : [],
    };

    cache.set(sym, { data: result, ts: Date.now() });
    if (cache.size > 100) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) cache.delete(oldest[0]);
    }

    const res = NextResponse.json(result);
    res.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
    res.headers.set('CDN-Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
    trackApiCall(`/api/analyst-consensus/${sym}`, Date.now() - startTime, false);
    return res;
  } catch (error) {
    console.error(`Analyst consensus error for ${sym}:`, error);
    trackApiCall(`/api/analyst-consensus/${sym}`, Date.now() - startTime, true);
    return NextResponse.json({ symbol: sym, error: 'Failed to fetch' }, { status: 500 });
  }
}
