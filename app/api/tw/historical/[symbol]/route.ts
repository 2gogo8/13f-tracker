import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

export const maxDuration = 60;

interface YahooHistoricalData {
  chart: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: number[];
          high?: number[];
          low?: number[];
          close?: number[];
          volume?: number[];
        }>;
      };
    }>;
    error?: { description: string };
  };
}

interface HistoricalPrice {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Cache for 2 hours per symbol
const cache = new Map<string, { data: HistoricalPrice[]; timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 60 * 1000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();
  const { symbol } = await params;
  
  if (!symbol) {
    trackApiCall('/api/tw/historical', Date.now() - startTime, true);
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }
  
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    const response = NextResponse.json(cached.data);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    trackApiCall('/api/tw/historical', Date.now() - startTime, false);
    return response;
  }
  
  try {
    // Yahoo Finance uses .TW suffix for Taiwan stocks
    const yahooSymbol = `${symbol}.TW`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=3mo&interval=1d`;
    
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (!res.ok) {
      throw new Error(`Yahoo Finance API error: ${res.status}`);
    }
    
    const data: YahooHistoricalData = await res.json();
    
    if (data.chart?.error) {
      throw new Error(data.chart.error.description);
    }
    
    const result = data.chart?.result?.[0];
    if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
      throw new Error('Invalid response structure');
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
      
      // Skip invalid data points
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
        date: timestamps[i] * 1000, // Convert to milliseconds
        open: typeof open === 'number' ? open : close,
        high,
        low,
        close,
        volume: typeof volume === 'number' ? volume : 0,
      });
    }
    
    // Sort by date descending (newest first)
    historicalData.sort((a, b) => b.date - a.date);
    
    cache.set(symbol, { data: historicalData, timestamp: Date.now() });
    
    const response = NextResponse.json(historicalData);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    trackApiCall('/api/tw/historical', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error(`TW historical error for ${symbol}:`, error);
    trackApiCall('/api/tw/historical', Date.now() - startTime, true);
    const response = NextResponse.json([]);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    return response;
  }
}
