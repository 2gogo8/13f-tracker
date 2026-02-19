export const maxDuration = 30;
import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com';

export async function GET() {
  const startTime = Date.now();
  
  try {
    // Only fetch S&P 500 list — quotes are fetched client-side
    const sp500Response = await fetch(
      `${FMP_BASE_URL}/stable/sp500-constituent?apikey=${FMP_API_KEY}`,
      { next: { revalidate: 7200 } }
    );

    if (!sp500Response.ok) {
      throw new Error('Failed to fetch S&P 500 data');
    }

    const sp500Data = await sp500Response.json();

    // Return basic stock info without quotes
    const stocks = (Array.isArray(sp500Data) ? sp500Data : []).map((stock: any) => ({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector || '',
      price: 0,
      change: 0,
      changesPercentage: 0,
    }));

    const response = NextResponse.json(stocks);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    trackApiCall('/api/dashboard', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error('Error in dashboard API:', error);
    trackApiCall('/api/dashboard', Date.now() - startTime, true);
    const response = NextResponse.json([]);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    return response;
  }
}
