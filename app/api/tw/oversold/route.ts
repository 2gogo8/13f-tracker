import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';
import { twStocks } from '@/data/tw-stocks';

export const maxDuration = 60;

interface OversoldStock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  sma20: number;
  atr14: number;
  deviation: number;
  signal: 'oversold';
}

interface HistoricalPrice {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Cache for 2 hours
let cache: { data: OversoldStock[]; timestamp: number } | null = null;
const CACHE_DURATION = 2 * 60 * 60 * 1000;

async function fetchHistoricalData(symbol: string): Promise<HistoricalPrice[]> {
  const yahooSymbol = `${symbol}.TW`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=3mo&interval=1d`;
  
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
  });
  
  if (!res.ok) {
    throw new Error(`Yahoo API error: ${res.status}`);
  }
  
  const data: any = await res.json();
  
  if (data.chart?.error) {
    throw new Error(data.chart.error.description);
  }
  
  const result = data.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
    throw new Error('Invalid response');
  }
  
  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  
  const historicalData: HistoricalPrice[] = [];
  
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    
    if (
      typeof close !== 'number' || 
      typeof high !== 'number' || 
      typeof low !== 'number' ||
      close === null ||
      high === null ||
      low === null
    ) {
      continue;
    }
    
    historicalData.push({
      date: timestamps[i] * 1000,
      open: typeof open === 'number' ? open : close,
      high,
      low,
      close,
      volume: typeof volume === 'number' ? volume : 0,
    });
  }
  
  // Sort by date descending (newest first)
  historicalData.sort((a, b) => b.date - a.date);
  
  return historicalData;
}

export async function GET() {
  const startTime = Date.now();
  
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION) {
    const response = NextResponse.json(cache.data);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    trackApiCall('/api/tw/oversold', Date.now() - startTime, false);
    return response;
  }

  try {
    const oversoldStocks: OversoldStock[] = [];
    const batchSize = 5;

    // Process stocks in batches to avoid overwhelming Yahoo API
    for (let i = 0; i < twStocks.length; i += batchSize) {
      const batch = twStocks.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async (stock) => {
          try {
            const data = await fetchHistoricalData(stock.symbol);
            
            if (data.length < 21) return null;

            // Current price
            const price = data[0].close;
            if (price === 0) return null;

            // Calculate SMA20
            const sma20 = data.slice(0, 20).reduce((sum, d) => sum + d.close, 0) / 20;

            // Calculate ATR14 - need chronological order
            const sorted = data.slice(0, 21).reverse(); // oldest to newest
            const trValues: number[] = [];
            
            for (let j = 1; j < sorted.length && trValues.length < 14; j++) {
              const high = sorted[j].high;
              const low = sorted[j].low;
              const prevClose = sorted[j - 1].close;
              const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
              );
              trValues.push(tr);
            }
            
            if (trValues.length === 0) return null;
            
            const atr14 = trValues.reduce((a, b) => a + b, 0) / trValues.length;
            if (atr14 === 0) return null;

            // Calculate deviation
            const deviation = (price - sma20) / atr14;

            // Return if oversold (deviation < -1)
            if (deviation < -1) {
              // Get price change info (compare to previous day)
              const prevPrice = data[1]?.close || price;
              const change = price - prevPrice;
              const changePercent = (change / prevPrice) * 100;
              
              return {
                symbol: stock.symbol,
                name: stock.name,
                sector: stock.sector,
                price,
                change,
                changePercent,
                sma20,
                atr14,
                deviation,
                signal: 'oversold',
              } as OversoldStock;
            }
            
            return null;
          } catch (error) {
            console.error(`Error processing ${stock.symbol}:`, error);
            return null;
          }
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          oversoldStocks.push(r.value);
        }
      }
      
      // Small delay between batches to be nice to Yahoo API
      if (i + batchSize < twStocks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Sort by deviation (most oversold first)
    oversoldStocks.sort((a, b) => a.deviation - b.deviation);

    cache = { data: oversoldStocks, timestamp: Date.now() };
    
    const response = NextResponse.json(oversoldStocks);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    trackApiCall('/api/tw/oversold', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error('TW oversold scanner error:', error);
    trackApiCall('/api/tw/oversold', Date.now() - startTime, true);
    const response = NextResponse.json([]);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    return response;
  }
}
