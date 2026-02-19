export const maxDuration = 30;
import { NextResponse } from 'next/server';
import { trackApiCall, trackSymbolView } from '@/lib/api-stats';
import { QuarterlyTrendData } from '@/types';

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
    // Fetch last 4 quarters: Q4 2025, Q3 2025, Q2 2025, Q1 2025
    const quarters = [
      { year: 2025, quarter: 4, label: '2025 Q4' },
      { year: 2025, quarter: 3, label: '2025 Q3' },
      { year: 2025, quarter: 2, label: '2025 Q2' },
      { year: 2025, quarter: 1, label: '2025 Q1' },
    ];

    const promises = quarters.map(({ year, quarter }) =>
      fetch(
        `${FMP_BASE_URL}/stable/institutional-ownership/symbol-positions-summary?symbol=${symbol}&year=${year}&quarter=${quarter}&apikey=${FMP_API_KEY}`,
        { next: { revalidate: 3600 } }
      )
    );

    const responses = await Promise.all(promises);
    const data: QuarterlyTrendData[] = [];

    for (let i = 0; i < responses.length; i++) {
      const res = responses[i];
      if (res.ok) {
        const json = await res.json();
        const summary = Array.isArray(json) ? json[0] : json;
        
        if (summary && summary.totalInvested !== undefined) {
          data.push({
            quarter: quarters[i].label,
            totalInvested: summary.totalInvested || 0,
            investorsHolding: summary.investorsHolding || 0,
            totalShares: summary.totalShares || 0,
          });
        }
      }
    }

    // Reverse to show oldest to newest (Q1 -> Q4)
    const response = NextResponse.json(data.reverse());

    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');

    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');

    trackApiCall('/api/institutional-trend${symbol}', Date.now() - startTime, false);

    return response;
  } catch (error) {
    console.error(`Error fetching quarterly trend for ${symbol}:`, error);
    const response = NextResponse.json(
      { error: 'Failed to fetch quarterly trend' },
      { status: 500 }
    );

    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');

    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');

    trackApiCall('/api/institutional-trend${symbol}', Date.now() - startTime, false);

    return response;
  }
}
