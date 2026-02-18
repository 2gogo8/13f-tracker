import { NextResponse } from 'next/server';
import { trackApiCall, trackSymbolView } from '@/lib/api-stats';

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();
  const { symbol } = await params;
  
  try {
    trackSymbolView(symbol);
    
    const response = await fetch(
      `${FMP_BASE_URL}/stable/quote?symbol=${symbol}&apikey=${FMP_API_KEY}`,
      { next: { revalidate: 60 } } // Cache for 1 minute
    );

    if (!response.ok) {
      throw new Error('Failed to fetch quote');
    }

    const data = await response.json();
    const result = NextResponse.json(data);
    result.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    result.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    trackApiCall(`/api/quote/${symbol}`, Date.now() - startTime, false);
    return result;
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error);
    trackApiCall(`/api/quote/${symbol}`, Date.now() - startTime, true);
    const result = NextResponse.json(
      { error: 'Failed to fetch quote' },
      { status: 500 }
    );
    result.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    result.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    return result;
  }
}
