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
const CACHE_DURATION = 2 * 60 * 60 * 1000;

// Top 30 large-cap stocks to scan (keeps API fast)
const LARGE_CAP_SYMBOLS = [
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','JPM','V',
  'UNH','MA','HD','PG','JNJ','XOM','AVGO','LLY','COST','ABBV',
  'MRK','WMT','ADBE','CRM','NFLX','AMD','ORCL','INTC','BA','DIS','PYPL',
];

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION) {
    return NextResponse.json(cache.data);
  }

  try {
    const picks: TopPick[] = [];

    // Process all at once (only 30 stocks)
    for (let i = 0; i < LARGE_CAP_SYMBOLS.length; i += 30) {
      const batch = LARGE_CAP_SYMBOLS.slice(i, i + 30);
      const results = await Promise.allSettled(
        batch.map(async (symbol) => {
          // Fetch historical + quote in parallel
          const [histRes, quoteRes] = await Promise.all([
            fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_KEY}`, { signal: AbortSignal.timeout(8000) }),
            fetch(`https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${FMP_KEY}`, { signal: AbortSignal.timeout(8000) }),
          ]);

          const histRaw = await histRes.json();
          const quoteRaw = await quoteRes.json();
          
          const hist = Array.isArray(histRaw) ? histRaw : histRaw?.historical || [];
          const quote = Array.isArray(quoteRaw) ? quoteRaw[0] : null;

          if (!quote || quote.marketCap < MIN_MARKET_CAP || hist.length < 21) return null;

          const price = hist[0]?.close ?? 0;
          if (price === 0) return null;

          const sma20 = hist.slice(0, 20).reduce((s: number, d: { close?: number }) => s + (d.close ?? 0), 0) / 20;

          const sorted = hist.slice(0, 21).reverse();
          const trValues: number[] = [];
          for (let j = 1; j < sorted.length && trValues.length < 14; j++) {
            const tr = Math.max(
              (sorted[j].high ?? 0) - (sorted[j].low ?? 0),
              Math.abs((sorted[j].high ?? 0) - (sorted[j - 1].close ?? 0)),
              Math.abs((sorted[j].low ?? 0) - (sorted[j - 1].close ?? 0))
            );
            trValues.push(tr);
          }
          if (trValues.length === 0) return null;
          const atr14 = trValues.reduce((a: number, b: number) => a + b, 0) / trValues.length;
          if (atr14 === 0) return null;

          const deviation = (price - sma20) / atr14;
          if (deviation >= -2) return null; // Not oversold

          return {
            symbol,
            price,
            sma20,
            atr14,
            deviation,
            signal: deviation < -3 ? 'deep-value' : 'oversold',
            name: quote.name || symbol,
            marketCap: quote.marketCap,
          } as TopPick;
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          picks.push(r.value);
        }
      }
    }

    picks.sort((a, b) => a.deviation - b.deviation);
    const top5 = picks.slice(0, 5);

    cache = { data: top5, timestamp: Date.now() };
    return NextResponse.json(top5);
  } catch (error) {
    console.error('Top picks error:', error);
    return NextResponse.json([]);
  }
}
