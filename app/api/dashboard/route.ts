export const maxDuration = 30;
import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';
import fs from 'fs';
import path from 'path';

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

    // Load EOD prices from price_cache.json (updated daily by scripts/update_slope_cache.py)
    type PriceEntry = { close: number; changesPercentage: number };
    const priceMap: Record<string, PriceEntry> = {};
    try {
      const cachePath = path.join(process.cwd(), 'data', 'price_cache.json');
      const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as {
        prices: Record<string, Array<{ date: string; close: number }>>;
      };
      for (const [sym, records] of Object.entries(cacheData.prices)) {
        if (records && records.length >= 2) {
          const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
          const latest = sorted[0];
          const prev = sorted[1];
          priceMap[sym] = {
            close: latest.close,
            changesPercentage:
              prev.close > 0
                ? Math.round(((latest.close - prev.close) / prev.close) * 10000) / 100
                : 0,
          };
        }
      }
    } catch {
      // price_cache not available — prices remain 0
    }

    const stocks = (Array.isArray(sp500Data) ? sp500Data : []).map((stock: any) => ({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector || '',
      price: priceMap[stock.symbol]?.close ?? 0,
      change: 0,
      changesPercentage: priceMap[stock.symbol]?.changesPercentage ?? 0,
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
