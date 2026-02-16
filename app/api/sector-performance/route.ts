import { NextResponse } from 'next/server';

const API_KEY = process.env.FMP_API_KEY || '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';

// Sector mapping to Chinese names
const sectorMapping: Record<string, string> = {
  'Technology': '科技',
  'Healthcare': '醫療保健',
  'Financial Services': '金融',
  'Consumer Cyclical': '非必需消費品',
  'Communication Services': '通訊服務',
  'Industrials': '工業',
  'Consumer Defensive': '必需消費品',
  'Energy': '能源',
  'Utilities': '公用事業',
  'Real Estate': '房地產',
  'Basic Materials': '基礎材料',
};

// Fallback: one representative stock per sector
const sectorRepresentatives: Record<string, string> = {
  '科技': 'AAPL',
  '金融': 'JPM',
  '能源': 'XOM',
  '醫療保健': 'UNH',
  '必需消費品': 'PG',
  '非必需消費品': 'AMZN',
  '公用事業': 'NEE',
  '房地產': 'PLD',
  '基礎材料': 'LIN',
  '工業': 'UNP',
  '通訊服務': 'GOOG',
};

export async function GET() {
  try {
    // Try the official sector-performance endpoint first
    const sectorResponse = await fetch(
      `https://financialmodelingprep.com/stable/sector-performance?apikey=${API_KEY}`
    );
    const sectorData = await sectorResponse.json();

    // If we have data from the official endpoint, use it
    if (Array.isArray(sectorData) && sectorData.length > 0) {
      const formattedData = sectorData.map((item: { sector: string; changesPercentage: string }) => ({
        sector: sectorMapping[item.sector] || item.sector,
        changesPercentage: parseFloat(item.changesPercentage),
      }));

      return NextResponse.json(formattedData);
    }

    // Fallback: fetch representative stocks for each sector
    const symbols = Object.values(sectorRepresentatives).join(',');
    const quotesResponse = await fetch(
      `https://financialmodelingprep.com/stable/quote?symbol=${symbols}&apikey=${API_KEY}`
    );
    const quotesData = await quotesResponse.json();

    if (!Array.isArray(quotesData) || quotesData.length === 0) {
      // If quotes also fail, return empty array
      return NextResponse.json([]);
    }

    // Map quotes back to sectors
    const symbolToSector = Object.entries(sectorRepresentatives).reduce(
      (acc, [sector, symbol]) => {
        acc[symbol] = sector;
        return acc;
      },
      {} as Record<string, string>
    );

    const sectorPerformance = quotesData.map((quote: { symbol: string; changesPercentage: number }) => ({
      sector: symbolToSector[quote.symbol] || '其他',
      changesPercentage: quote.changesPercentage || 0,
    }));

    return NextResponse.json(sectorPerformance);
  } catch (error) {
    console.error('Error fetching sector performance:', error);
    return NextResponse.json([]);
  }
}
