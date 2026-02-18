import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com';

export async function GET() {
  const startTime = Date.now();
  
  try {
    // Fetch both S&P 500 and NASDAQ-100 in parallel
    const [sp500Res, nasdaqRes] = await Promise.all([
      fetch(`${FMP_BASE_URL}/stable/sp500-constituent?apikey=${FMP_API_KEY}`, {
        next: { revalidate: 3600 },
      }),
      fetch(`${FMP_BASE_URL}/stable/nasdaq-constituent?apikey=${FMP_API_KEY}`, {
        next: { revalidate: 3600 },
      }),
    ]);

    if (!sp500Res.ok || !nasdaqRes.ok) {
      throw new Error('Failed to fetch constituent data');
    }

    const [sp500Data, nasdaqData] = await Promise.all([
      sp500Res.json(),
      nasdaqRes.json(),
    ]);

    // Merge and deduplicate by symbol
    const symbolMap = new Map<string, any>();

    // Add S&P 500 first
    for (const stock of sp500Data) {
      symbolMap.set(stock.symbol, { ...stock, index: 'S&P 500' });
    }

    // Add NASDAQ-100, mark dual-listed ones
    for (const stock of nasdaqData) {
      if (symbolMap.has(stock.symbol)) {
        symbolMap.get(stock.symbol).index = 'S&P 500 / NASDAQ-100';
      } else {
        symbolMap.set(stock.symbol, { ...stock, index: 'NASDAQ-100' });
      }
    }

    const merged = Array.from(symbolMap.values());
    const response = NextResponse.json(merged);
    response.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    trackApiCall('/api/sp500', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error('Error fetching stock universe:', error);
    trackApiCall('/api/sp500', Date.now() - startTime, true);
    const response = NextResponse.json(
      { error: 'Failed to fetch stock data' },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    return response;
  }
}
