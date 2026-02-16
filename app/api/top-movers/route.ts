import { NextResponse } from 'next/server';

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com';

// Curated list of ~30 popular S&P 500 stocks
const POPULAR_STOCKS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B',
  'JPM', 'V', 'UNH', 'MA', 'HD', 'PG', 'JNJ', 'XOM', 'AVGO', 'LLY',
  'COST', 'ABBV', 'MRK', 'WMT', 'PEP', 'KO', 'ADBE', 'CRM', 'NFLX',
  'AMD', 'ORCL', 'INTC'
];

export interface TopMoverStock {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  totalInvested: number;
  totalInvestedChange: number;
  investorsHolding: number;
  investorsHoldingChange: number;
  increasedPositions: number;
  reducedPositions: number;
  newPositions: number;
  closedPositions: number;
}

export async function GET() {
  try {
    const stocks: TopMoverStock[] = [];

    // Fetch institutional data for each popular stock
    for (const symbol of POPULAR_STOCKS) {
      try {
        // Fetch quote data
        const quoteRes = await fetch(
          `${FMP_BASE_URL}/stable/quote?symbol=${symbol}&apikey=${FMP_API_KEY}`,
          { next: { revalidate: 300 } } // Cache for 5 minutes
        );

        // Try Q4 2025 first, fallback to Q3 if needed
        let institutionalRes = await fetch(
          `${FMP_BASE_URL}/stable/institutional-ownership/symbol-positions-summary?symbol=${symbol}&year=2025&quarter=4&apikey=${FMP_API_KEY}`,
          { next: { revalidate: 7200 } } // Cache for 2 hours
        );

        let institutionalData = await institutionalRes.json();

        // If Q4 data is empty or error, try Q3
        if (!institutionalData || institutionalData.length === 0 || institutionalData.error) {
          institutionalRes = await fetch(
            `${FMP_BASE_URL}/stable/institutional-ownership/symbol-positions-summary?symbol=${symbol}&year=2025&quarter=3&apikey=${FMP_API_KEY}`,
            { next: { revalidate: 7200 } }
          );
          institutionalData = await institutionalRes.json();
        }

        const quoteData = await quoteRes.json();
        const quote = quoteData[0];
        const institutional = institutionalData[0];

        if (quote && institutional) {
          stocks.push({
            symbol,
            name: quote.name || symbol,
            price: quote.price || 0,
            changesPercentage: quote.changesPercentage || 0,
            totalInvested: institutional.totalInvested || 0,
            totalInvestedChange: institutional.totalInvestedChange || 0,
            investorsHolding: institutional.investorsHolding || 0,
            investorsHoldingChange: institutional.investorsHoldingChange || 0,
            increasedPositions: institutional.increasedPositions || 0,
            reducedPositions: institutional.reducedPositions || 0,
            newPositions: institutional.newPositions || 0,
            closedPositions: institutional.closedPositions || 0,
          });
        }
      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error);
      }

      // Small delay to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Sort by totalInvestedChange to get top accumulation and reduction
    const sortedByChange = [...stocks].sort((a, b) => b.totalInvestedChange - a.totalInvestedChange);

    const topAccumulation = sortedByChange.slice(0, 10);
    const topReduction = [...stocks]
      .sort((a, b) => a.totalInvestedChange - b.totalInvestedChange)
      .slice(0, 10);

    return NextResponse.json({
      topAccumulation,
      topReduction,
      allStocks: stocks,
    });
  } catch (error) {
    console.error('Error in top-movers API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch top movers data' },
      { status: 500 }
    );
  }
}
