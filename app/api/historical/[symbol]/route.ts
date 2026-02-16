import { NextRequest, NextResponse } from 'next/server';

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
  const { symbol } = await params;

  if (!FMP_API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const cacheKey = `historical-${symbol}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return NextResponse.json(cached.data);
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

    const data: FMPHistoricalResponse = await response.json();

    if (!data.historical || !Array.isArray(data.historical)) {
      return NextResponse.json({ error: 'Invalid response format' }, { status: 500 });
    }

    // Filter to last 730 days (2 years) and sort by date ascending
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 730);

    const filtered = data.historical
      .filter(item => new Date(item.date) >= cutoffDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const result = {
      symbol: data.symbol,
      historical: filtered
    };

    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching historical data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical data' },
      { status: 500 }
    );
  }
}
