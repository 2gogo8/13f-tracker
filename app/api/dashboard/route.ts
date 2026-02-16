import { NextResponse } from 'next/server';

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com';

export async function GET() {
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

    return NextResponse.json(stocks);
  } catch (error) {
    console.error('Error in dashboard API:', error);
    return NextResponse.json([]);
  }
}
