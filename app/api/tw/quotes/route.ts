import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';
import { twStocks } from '@/data/tw-stocks';

export const maxDuration = 60;

interface TWSEQuote {
  Code: string;
  Name: string;
  ClosingPrice: string;
  Change: string;
  ChangePercent: string;
  PERatio?: string;
}

interface TWQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  peRatio?: number;
}

// Cache for 5 minutes
let cache: { data: TWQuote[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000;

export async function GET() {
  const startTime = Date.now();
  
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION) {
    const response = NextResponse.json(cache.data);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    trackApiCall('/api/tw/quotes', Date.now() - startTime, false);
    return response;
  }

  try {
    const symbolSet = new Set(twStocks.map(s => s.symbol));
    
    // Fetch price data from TWSE
    const priceRes = await fetch(
      'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL',
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!priceRes.ok) {
      throw new Error(`TWSE API error: ${priceRes.status}`);
    }
    
    const priceData: TWSEQuote[] = await priceRes.json();
    
    // Try to fetch P/E ratios (optional, may fail)
    let peData: TWSEQuote[] = [];
    try {
      const peRes = await fetch(
        'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL',
        { signal: AbortSignal.timeout(8000) }
      );
      if (peRes.ok) {
        peData = await peRes.json();
      }
    } catch (e) {
      console.warn('Failed to fetch P/E data:', e);
    }
    
    // Create P/E lookup map
    const peMap = new Map<string, number>();
    if (Array.isArray(peData)) {
      peData.forEach((item: TWSEQuote) => {
        if (item.Code && item.PERatio) {
          const pe = parseFloat(item.PERatio);
          if (!isNaN(pe) && pe > 0) {
            peMap.set(item.Code, pe);
          }
        }
      });
    }
    
    // Filter and transform data
    const quotes: TWQuote[] = [];
    
    if (Array.isArray(priceData)) {
      priceData.forEach((item: TWSEQuote) => {
        if (!item.Code || !symbolSet.has(item.Code)) return;
        
        const stock = twStocks.find(s => s.symbol === item.Code);
        if (!stock) return;
        
        const price = parseFloat(item.ClosingPrice);
        const change = parseFloat(item.Change);
        const changePercent = parseFloat(item.ChangePercent);
        
        if (isNaN(price) || price === 0) return;
        
        quotes.push({
          symbol: item.Code,
          name: stock.name,
          price,
          change: isNaN(change) ? 0 : change,
          changePercent: isNaN(changePercent) ? 0 : changePercent,
          peRatio: peMap.get(item.Code),
        });
      });
    }
    
    cache = { data: quotes, timestamp: Date.now() };
    
    const response = NextResponse.json(quotes);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    trackApiCall('/api/tw/quotes', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error('TW quotes error:', error);
    trackApiCall('/api/tw/quotes', Date.now() - startTime, true);
    const response = NextResponse.json([]);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    return response;
  }
}
