import { NextResponse } from 'next/server';

const FMP_KEY = process.env.FMP_API_KEY || '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const MIN_MARKET_CAP = 10_000_000_000; // $10B

export const maxDuration = 60;

interface TopPick {
  symbol: string;
  price: number;
  sma20: number;
  atr14: number;
  deviation: number;
  signal: string;
  name: string;
  marketCap: number;
}

let cache: { data: TopPick[]; timestamp: number } | null = null;
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2hr

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION) {
    return NextResponse.json(cache.data);
  }

  try {
    // Step 1: Get oversold stocks from our own API logic
    const oversoldRes = await fetch(
      `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000'}/api/oversold-scanner`,
      { signal: AbortSignal.timeout(50000) }
    );
    const oversold = await oversoldRes.json();
    if (!Array.isArray(oversold) || oversold.length === 0) {
      return NextResponse.json([]);
    }

    // Step 2: Take top 20 most oversold, fetch their quotes for market cap + name
    const top20 = oversold.slice(0, 20);
    const results: TopPick[] = [];

    // Fetch quotes in parallel (small batch)
    const quoteResults = await Promise.allSettled(
      top20.map(async (stock: { symbol: string; price: number; sma20: number; atr14: number; deviation: number; signal: string }) => {
        const res = await fetch(
          `https://financialmodelingprep.com/stable/quote?symbol=${stock.symbol}&apikey=${FMP_KEY}`,
          { signal: AbortSignal.timeout(8000) }
        );
        const data = await res.json();
        const q = Array.isArray(data) ? data[0] : null;
        if (q && q.marketCap >= MIN_MARKET_CAP) {
          return {
            ...stock,
            name: q.name || stock.symbol,
            marketCap: q.marketCap,
          } as TopPick;
        }
        return null;
      })
    );

    for (const r of quoteResults) {
      if (r.status === 'fulfilled' && r.value) {
        results.push(r.value);
      }
    }

    results.sort((a, b) => a.deviation - b.deviation);
    const top5 = results.slice(0, 5);

    cache = { data: top5, timestamp: Date.now() };
    return NextResponse.json(top5);
  } catch (error) {
    console.error('Top picks error:', error);
    return NextResponse.json([]);
  }
}
