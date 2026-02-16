import { NextResponse } from 'next/server';

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com';

export async function GET() {
  try {
    const response = await fetch(
      `${FMP_BASE_URL}/stable/sp500-constituent?apikey=${FMP_API_KEY}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour
    );

    if (!response.ok) {
      throw new Error('Failed to fetch S&P 500 data');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching S&P 500:', error);
    return NextResponse.json(
      { error: 'Failed to fetch S&P 500 data' },
      { status: 500 }
    );
  }
}
