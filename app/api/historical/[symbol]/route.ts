import { NextRequest, NextResponse } from 'next/server';
import { trackApiCall, trackSymbolView } from '@/lib/api-stats';

const FMP_API_KEY = process.env.FMP_API_KEY;
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

interface FMPHistoricalResponse {
  symbol: string;
  historical: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

const cache = new Map<string, { data: any; timestamp: number }>();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();
  const { symbol } = await params;
  trackSymbolView(symbol);

  if (!FMP_API_KEY) {
    trackApiCall(`/api/historical/${symbol}`, Date.now() - startTime, true);
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const cacheKey = `historical-${symbol}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    const res = NextResponse.json(cached.data);
    res.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    res.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    trackApiCall(`/api/historical/${symbol}`, Date.now() - startTime, false);
    return res;
  }

  try {
    // Calculate date range for 2 years
    const today = new Date();
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(today.getFullYear() - 2);

    const fromDate = twoYearsAgo.toISOString().split('T')[0];
    const toDate = today.toISOString().split('T')[0];

    // Try the full endpoint first
    let url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_API_KEY}`;
    let response = await fetch(url);
    
    if (!response.ok) {
      // Fallback to light endpoint with date range
      url = `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${symbol}&from=${fromDate}&to=${toDate}&apikey=${FMP_API_KEY}`;
      response = await fetch(url);
    }

    if (!response.ok) {
      throw new Error(`FMP API error: ${response.status}`);
    }

    const raw = await response.json();

    // FMP /stable/ returns a flat array, not { symbol, historical: [...] }
    const items: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> =
      Array.isArray(raw) ? raw : (raw.historical ?? []);

    if (!items.length) {
      const res = NextResponse.json({ symbol, historical: [] });
      res.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      res.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      trackApiCall(`/api/historical/${symbol}`, Date.now() - startTime, false);
      return res;
    }

    // Filter to last 730 days (2 years) and sort by date ascending
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 730);

    const filtered = items
      .filter(item => new Date(item.date) >= cutoffDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const result = {
      symbol,
      historical: filtered
    };

    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    const res = NextResponse.json(result);
    res.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    res.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    trackApiCall(`/api/historical/${symbol}`, Date.now() - startTime, false);
    return res;
  } catch (error) {
    console.error('Error fetching historical data:', error);
    trackApiCall(`/api/historical/${symbol}`, Date.now() - startTime, true);
    const res = NextResponse.json(
      { error: 'Failed to fetch historical data' },
      { status: 500 }
    );
    res.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    res.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    return res;
  }
}
