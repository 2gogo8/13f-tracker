import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';
import { twStocks } from '@/data/tw-stocks';

export const maxDuration = 60;

interface TwAntiMarketPick {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  dropPct: number;
  peakPrice: number;
  peakDate: string;
  sma130: number;
}

interface YahooPrice {
  date: string;
  high: number;
  low: number;
  close: number;
}

const cacheMap = new Map<string, { data: TwAntiMarketPick[]; timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2hr
const DEFAULT_START_DATE = '2026-01-20';

function checkContinuousDecline(prices: YahooPrice[]): {
  drop: number; peakPrice: number; peakDate: string;
} | null {
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

  if (totalDrop < 0 || totalDrop > 35) return null;

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
  };
}

async function fetchYahooHistorical(symbol: string, fromStr: string): Promise<YahooPrice[]> {
  // Fetch ~9 months for SMA130
  const fromDateObj = new Date(fromStr);
  const extendedFrom = new Date(fromDateObj);
  extendedFrom.setDate(extendedFrom.getDate() - 200);

  const period1 = Math.floor(extendedFrom.getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);

  const yahooSymbol = `${symbol}.TW`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${period1}&period2=${period2}&interval=1d`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);

  const data: any = await res.json();
  const result = data.chart?.result?.[0];
  if (!result?.timestamp || !result?.indicators?.quote?.[0]) throw new Error('Invalid');

  const ts = result.timestamp;
  const q = result.indicators.quote[0];
  const prices: YahooPrice[] = [];

  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    if (typeof close !== 'number' || typeof high !== 'number' || typeof low !== 'number' || close === null) continue;

    const d = new Date(ts[i] * 1000);
    const dateStr = d.toISOString().split('T')[0];
    prices.push({ date: dateStr, high, low, close });
  }

  // Sort ascending (oldest first)
  prices.sort((a, b) => a.date.localeCompare(b.date));
  return prices;
}

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get('fromDate') || DEFAULT_START_DATE;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    const cached = cacheMap.get(fromDate);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      const response = NextResponse.json(cached.data);
      response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      trackApiCall('/api/tw/oversold', Date.now() - startTime, false);
      return response;
    }

    const results: TwAntiMarketPick[] = [];
    const batchSize = 5;

    for (let i = 0; i < twStocks.length; i += batchSize) {
      const batch = twStocks.slice(i, i + batchSize);

      const settled = await Promise.allSettled(
        batch.map(async (stock) => {
          try {
            const allPrices = await fetchYahooHistorical(stock.symbol, fromDate);
            if (allPrices.length < 130) return null;

            // SMA130
            const closes = allPrices.map(d => d.close);
            const sma130 = closes.slice(-130).reduce((a, b) => a + b, 0) / 130;

            const currentPrice = closes[closes.length - 1];
            if (currentPrice < sma130) return null; // must be above SMA130

            // Filter to fromDate onwards for decline check
            const pricesFromDate = allPrices.filter(d => d.date >= fromDate);
            if (pricesFromDate.length < 5) return null;

            const decline = checkContinuousDecline(pricesFromDate);
            if (!decline) return null;

            return {
              symbol: stock.symbol,
              name: stock.name,
              sector: stock.sector,
              price: Math.round(currentPrice * 100) / 100,
              dropPct: decline.drop,
              peakPrice: decline.peakPrice,
              peakDate: decline.peakDate,
              sma130: Math.round(sma130 * 100) / 100,
            } as TwAntiMarketPick;
          } catch {
            return null;
          }
        })
      );

      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) results.push(r.value);
      }

      if (i + batchSize < twStocks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    results.sort((a, b) => b.dropPct - a.dropPct); // most declined first

    cacheMap.set(fromDate, { data: results, timestamp: Date.now() });
    if (cacheMap.size > 5) {
      const oldest = [...cacheMap.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) cacheMap.delete(oldest[0]);
    }

    const response = NextResponse.json(results);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    trackApiCall('/api/tw/oversold', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error('TW oversold scanner error:', error);
    trackApiCall('/api/tw/oversold', Date.now() - startTime, true);
    return NextResponse.json([]);
  }
}
