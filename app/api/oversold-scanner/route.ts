import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

const FMP_KEY = process.env.FMP_API_KEY || '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';

export const maxDuration = 60;

interface OversoldStock {
  symbol: string;
  price: number;
  sma20: number;
  atr14: number;
  deviation: number; // (price - sma20) / atr14
  signal: 'deep-value' | 'oversold';
}

// Cache for 2 hours
let cache: { data: OversoldStock[]; timestamp: number } | null = null;
const CACHE_DURATION = 2 * 60 * 60 * 1000;

export async function GET() {
  const startTime = Date.now();
  
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION) {
    const response = NextResponse.json(cache.data);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    trackApiCall('/api/oversold-scanner', Date.now() - startTime, false);
    return response;
  }

  try {
    // Get SP500 list
    const sp500Res = await fetch(
      `https://financialmodelingprep.com/stable/sp500-constituent?apikey=${FMP_KEY}`
    );
    const sp500 = await sp500Res.json();
    if (!Array.isArray(sp500)) {
      const response = NextResponse.json([]);
      response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      trackApiCall('/api/oversold-scanner', Date.now() - startTime, false);
      return response;
    }

    const symbols = sp500.map((s: { symbol: string }) => s.symbol);

    // Batch fetch historical data for all symbols (we need 21+ days)
    // Process in batches of 10 to avoid rate limits
    const oversoldStocks: OversoldStock[] = [];
    const batchSize = 10;

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (symbol: string) => {
          const res = await fetch(
            `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_KEY}`,
            { signal: AbortSignal.timeout(8000) }
          );
          const raw = await res.json();
          const data = Array.isArray(raw) ? raw : raw?.historical || [];
          
          if (data.length < 21) return null;

          // Data is newest-first
          const price = data[0]?.close ?? 0;
          if (price === 0) return null;

          // SMA20
          const sma20 = data.slice(0, 20).reduce((sum: number, d: { close?: number }) => sum + (d.close ?? 0), 0) / 20;

          // ATR14 — need chronological order for True Range
          const sorted = data.slice(0, 21).reverse(); // oldest to newest, 21 days
          const trValues: number[] = [];
          for (let j = 1; j < sorted.length && trValues.length < 14; j++) {
            const high = sorted[j].high ?? 0;
            const low = sorted[j].low ?? 0;
            const prevClose = sorted[j - 1].close ?? 0;
            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trValues.push(tr);
          }
          if (trValues.length === 0) return null;
          const atr14 = trValues.reduce((a: number, b: number) => a + b, 0) / trValues.length;
          if (atr14 === 0) return null;

          const deviation = (price - sma20) / atr14;

          if (deviation < -2) {
            return {
              symbol,
              price,
              sma20,
              atr14,
              deviation,
              signal: deviation < -3 ? 'deep-value' : 'oversold',
            } as OversoldStock;
          }
          return null;
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          oversoldStocks.push(r.value);
        }
      }
    }

    // Sort by deviation (most oversold first)
    oversoldStocks.sort((a, b) => a.deviation - b.deviation);

    cache = { data: oversoldStocks, timestamp: Date.now() };
    const response = NextResponse.json(oversoldStocks);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    trackApiCall('/api/oversold-scanner', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error('Oversold scanner error:', error);
    trackApiCall('/api/oversold-scanner', Date.now() - startTime, true);
    const response = NextResponse.json([]);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    return response;
  }
}
