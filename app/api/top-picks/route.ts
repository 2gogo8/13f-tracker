import { NextResponse } from 'next/server';

const FMP_KEY = process.env.FMP_API_KEY || '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';

export const maxDuration = 30;

interface TopPick {
  symbol: string;
  price: number;
  sma50: number;
  deviation: number;
  signal: string;
  name: string;
  marketCap: number;
  changesPercentage: number;
  yearHigh: number;
  yearLow: number;
  priceAvg200: number;
  previousClose: number;
}

let cache: { data: TopPick[]; timestamp: number } | null = null;
const CACHE_DURATION = 2 * 60 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION) {
    return NextResponse.json(cache.data);
  }

  try {
    // Step 1: Get S&P 500 symbols
    const sp500Res = await fetch(
      `https://financialmodelingprep.com/stable/sp500-constituent?apikey=${FMP_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const sp500 = await sp500Res.json();
    if (!Array.isArray(sp500)) return NextResponse.json([]);

    const allSymbols = sp500.map((s: { symbol: string }) => s.symbol);

    // Step 2: Batch fetch quotes (40 per call, ~13 calls for 500 stocks)
    const batchSize = 40;
    const allQuotes: Record<string, unknown>[] = [];

    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize).join(',');
      try {
        const res = await fetch(
          `https://financialmodelingprep.com/stable/batch-quote?symbols=${batch}&apikey=${FMP_KEY}`,
          { signal: AbortSignal.timeout(5000) }
        );
        const data = await res.json();
        if (Array.isArray(data)) allQuotes.push(...data);
      } catch {
        // skip failed batch
      }
    }

    // Step 3: Compute oversold signals
    const picks: TopPick[] = [];

    for (const q of allQuotes) {
      const quote = q as {
        symbol?: string; name?: string; price?: number;
        priceAvg50?: number; priceAvg200?: number;
        yearHigh?: number; yearLow?: number;
        marketCap?: number; changesPercentage?: number;
        previousClose?: number;
      };

      if (!quote.price || !quote.priceAvg50 || !quote.yearHigh || !quote.yearLow) continue;

      const range52w = quote.yearHigh - quote.yearLow;
      const estimatedATR = range52w / 30;
      if (estimatedATR <= 0) continue;

      const deviation = (quote.price - quote.priceAvg50) / estimatedATR;
      if (deviation >= -2) continue;

      picks.push({
        symbol: quote.symbol || '',
        price: quote.price,
        sma50: quote.priceAvg50,
        deviation,
        signal: deviation < -3 ? 'deep-value' : 'oversold',
        name: quote.name || quote.symbol || '',
        marketCap: quote.marketCap || 0,
        changesPercentage: quote.changesPercentage || 0,
        yearHigh: quote.yearHigh,
        yearLow: quote.yearLow,
        priceAvg200: quote.priceAvg200 || quote.price,
        previousClose: quote.previousClose || quote.price,
      });
    }

    picks.sort((a, b) => a.deviation - b.deviation);

    cache = { data: picks, timestamp: Date.now() };
    return NextResponse.json(picks);
  } catch (error) {
    console.error('Top picks error:', error);
    return NextResponse.json([]);
  }
}
