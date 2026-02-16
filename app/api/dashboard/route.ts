import { NextResponse } from 'next/server';

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com';

export interface DashboardStock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changesPercentage: number;
}

export async function GET() {
  try {
    // Fetch S&P 500 list
    const sp500Response = await fetch(
      `${FMP_BASE_URL}/stable/sp500-constituent?apikey=${FMP_API_KEY}`,
      { next: { revalidate: 7200 } } // Cache for 2 hours
    );

    if (!sp500Response.ok) {
      throw new Error('Failed to fetch S&P 500 data');
    }

    const sp500Data = await sp500Response.json();

    // Fetch quotes in batches to avoid overwhelming the API
    const batchSize = 50;
    const allStocks: DashboardStock[] = [];

    for (let i = 0; i < sp500Data.length; i += batchSize) {
      const batch = sp500Data.slice(i, i + batchSize);
      
      // Fetch quotes for this batch in parallel
      const quotePromises = batch.map(async (stock: any) => {
        try {
          const quoteRes = await fetch(
            `${FMP_BASE_URL}/stable/quote?symbol=${stock.symbol}&apikey=${FMP_API_KEY}`,
            { next: { revalidate: 300 } } // Cache quotes for 5 minutes
          );

          if (!quoteRes.ok) {
            throw new Error(`Failed to fetch quote for ${stock.symbol}`);
          }

          const quoteData = await quoteRes.json();
          const quote = quoteData[0];

          return {
            symbol: stock.symbol,
            name: stock.name,
            sector: stock.sector,
            price: quote?.price || 0,
            change: quote?.change || 0,
            changesPercentage: quote?.changesPercentage || 0,
          };
        } catch (error) {
          console.error(`Error fetching quote for ${stock.symbol}:`, error);
          return {
            symbol: stock.symbol,
            name: stock.name,
            sector: stock.sector,
            price: 0,
            change: 0,
            changesPercentage: 0,
          };
        }
      });

      const batchResults = await Promise.all(quotePromises);
      allStocks.push(...batchResults);

      // Small delay between batches to be respectful to the API
      if (i + batchSize < sp500Data.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return NextResponse.json(allStocks);
  } catch (error) {
    console.error('Error in dashboard API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
