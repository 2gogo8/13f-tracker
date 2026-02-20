import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

export const maxDuration = 30;

const API_KEY = process.env.FMP_API_KEY || '';
const BASE = 'https://financialmodelingprep.com';

// Hot stocks to show consensus for
const HOT_SYMBOLS = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'PLTR', 'AMD', 'NFLX'];

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1hr

export async function GET() {
  const startTime = Date.now();

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    const res = NextResponse.json(cache.data);
    res.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=3600');
    res.headers.set('CDN-Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=3600');
    trackApiCall('/api/analyst-overview', Date.now() - startTime, false);
    return res;
  }

  try {
    // Fetch consensus + quotes in parallel
    const [quotesRes, ...consensusResults] = await Promise.all([
      fetch(`${BASE}/stable/batch-quote?symbols=${HOT_SYMBOLS.join(',')}&apikey=${API_KEY}`, {
        signal: AbortSignal.timeout(8000),
      }),
      ...HOT_SYMBOLS.map(sym =>
        fetch(`${BASE}/stable/price-target-consensus?symbol=${sym}&apikey=${API_KEY}`, {
          signal: AbortSignal.timeout(8000),
        }).then(r => r.json()).catch(() => [])
      ),
    ]);

    const quotes = await quotesRes.json();
    const quoteMap = new Map<string, { price: number; name: string }>();
    if (Array.isArray(quotes)) {
      for (const q of quotes) {
        if (q?.symbol) quoteMap.set(q.symbol, { price: q.price || 0, name: q.name || q.symbol });
      }
    }

    const results = HOT_SYMBOLS.map((sym, i) => {
      const c = Array.isArray(consensusResults[i]) ? consensusResults[i][0] : consensusResults[i];
      const q = quoteMap.get(sym);
      const price = q?.price || 0;
      const target = c?.targetConsensus || null;
      const upside = price > 0 && target ? ((target - price) / price * 100) : null;

      return {
        symbol: sym,
        name: q?.name || sym,
        price,
        targetConsensus: target,
        targetHigh: c?.targetHigh || null,
        targetLow: c?.targetLow || null,
        upside: upside !== null ? Math.round(upside * 10) / 10 : null,
      };
    }).filter(r => r.targetConsensus !== null);

    // Sort by upside descending
    results.sort((a, b) => (b.upside || 0) - (a.upside || 0));

    cache = { data: results, ts: Date.now() };

    const res = NextResponse.json(results);
    res.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=3600');
    res.headers.set('CDN-Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=3600');
    trackApiCall('/api/analyst-overview', Date.now() - startTime, false);
    return res;
  } catch (error) {
    console.error('Analyst overview error:', error);
    trackApiCall('/api/analyst-overview', Date.now() - startTime, true);
    return NextResponse.json([]);
  }
}
