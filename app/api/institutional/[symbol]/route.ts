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
    trackSymbolView(symbol);

  try {
    // Fetch both holder details and summary in parallel
    const [holdersRes, summaryRes] = await Promise.all([
      fetch(
        `${FMP_BASE_URL}/stable/institutional-ownership/extract-analytics/holder?symbol=${symbol}&year=2025&quarter=4&page=0&limit=20&apikey=${FMP_API_KEY}`,
        { next: { revalidate: 3600 } }
      ),
      fetch(
        `${FMP_BASE_URL}/stable/institutional-ownership/symbol-positions-summary?symbol=${symbol}&year=2025&quarter=4&apikey=${FMP_API_KEY}`,
        { next: { revalidate: 3600 } }
      ),
    ]);

    let holders = [];
    let summary = null;

    if (holdersRes.ok) {
      holders = await holdersRes.json();
    }
    
    if (summaryRes.ok) {
      const summaryData = await summaryRes.json();
      summary = Array.isArray(summaryData) ? summaryData[0] : summaryData;
    }

    // If Q4 2025 is empty, try Q3 2025
    if ((!holders || holders.length === 0)) {
      const fallbackRes = await fetch(
        `${FMP_BASE_URL}/stable/institutional-ownership/extract-analytics/holder?symbol=${symbol}&year=2025&quarter=3&page=0&limit=20&apikey=${FMP_API_KEY}`,
        { next: { revalidate: 3600 } }
      );
      if (fallbackRes.ok) {
        holders = await fallbackRes.json();
      }
    }

    if (!summary) {
      const fallbackSummary = await fetch(
        `${FMP_BASE_URL}/stable/institutional-ownership/symbol-positions-summary?symbol=${symbol}&year=2025&quarter=3&apikey=${FMP_API_KEY}`,
        { next: { revalidate: 3600 } }
      );
      if (fallbackSummary.ok) {
        const sd = await fallbackSummary.json();
        summary = Array.isArray(sd) ? sd[0] : sd;
      }
    }

    const response = NextResponse.json({ holders, summary });


    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');


    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');


    trackApiCall('/api/institutional${symbol}', Date.now() - startTime, false);


    return response;
  } catch (error) {
    console.error(`Error fetching institutional holders for ${symbol}:`, error);
    const response = NextResponse.json(
      { error: 'Failed to fetch institutional holders' },
      { status: 500 }
    );

    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');

    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');

    trackApiCall('/api/institutional${symbol}', Date.now() - startTime, false);

    return response;
  }
}
