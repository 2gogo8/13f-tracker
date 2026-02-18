import { NextResponse } from 'next/server';
import { trackApiCall, trackSymbolView } from '@/lib/api-stats';

export const maxDuration = 60;

interface YahooQuoteData {
  chart: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        regularMarketVolume?: number;
        marketCap?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: number[];
          volume?: number[];
        }>;
      };
    }>;
    error?: { description: string };
  };
}

interface TwQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
}

// Cache for 5 minutes per symbol
const cache = new Map<string, { data: TwQuote; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();
  const { symbol } = await params;
  
  if (!symbol) {
    trackApiCall('/api/tw/quote', Date.now() - startTime, true);
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }
  
  // Track symbol view
  trackSymbolView(symbol);
  
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    const response = NextResponse.json(cached.data);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    trackApiCall('/api/tw/quote', Date.now() - startTime, false);
    return response;
  }
  
  try {
    // Yahoo Finance uses .TW suffix for Taiwan stocks
    const yahooSymbol = `${symbol}.TW`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=1d&interval=1d`;
    
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (!res.ok) {
      throw new Error(`Yahoo Finance API error: ${res.status}`);
    }
    
    const data: YahooQuoteData = await res.json();
    
    if (data.chart?.error) {
      throw new Error(data.chart.error.description);
    }
    
    const result = data.chart?.result?.[0];
    if (!result) {
      throw new Error('Invalid response structure');
    }
    
    const meta = result.meta;
    const price = meta?.regularMarketPrice ?? 0;
    const previousClose = meta?.previousClose ?? price;
    const change = price - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;
    
    const quote: TwQuote = {
      symbol,
      price,
      change,
      changePercent,
      volume: meta?.regularMarketVolume ?? 0,
      marketCap: meta?.marketCap,
    };
    
    cache.set(symbol, { data: quote, timestamp: Date.now() });
    
    const response = NextResponse.json(quote);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    trackApiCall('/api/tw/quote', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error(`TW quote error for ${symbol}:`, error);
    trackApiCall('/api/tw/quote', Date.now() - startTime, true);
    
    // Return minimal quote on error
    const fallbackQuote: TwQuote = {
      symbol,
      price: 0,
      change: 0,
      changePercent: 0,
      volume: 0,
    };
    
    const response = NextResponse.json(fallbackQuote);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    return response;
  }
}
