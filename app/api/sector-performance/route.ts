import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

export const maxDuration = 30;

const API_KEY = process.env.FMP_API_KEY || '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';

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

// In-memory cache: always keep last known good data
let cachedData: { sectors: { sector: string; changesPercentage: number }[]; timestamp: number; isLive: boolean } | null = null;
const CACHE_LIVE_MS = 5 * 60 * 1000; // 5 min during market hours

function isUSMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const hour = et.getHours();
  const min = et.getMinutes();
  const timeMin = hour * 60 + min;
  return timeMin >= 9 * 60 + 30 && timeMin <= 16 * 60;
}

async function fetchFreshData(): Promise<{ sector: string; changesPercentage: number }[] | null> {
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/sector-performance?apikey=${API_KEY}`
    );
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return data.map((item: { sector: string; changesPercentage: string }) => ({
        sector: sectorMapping[item.sector] || item.sector,
        changesPercentage: parseFloat(item.changesPercentage),
      }));
    }
  } catch (e) {
    console.error('Sector performance primary fetch failed:', e);
  }

  // Fallback: representative stocks
  try {
    const symbols = Object.values(sectorRepresentatives).join(',');
    const res = await fetch(
      `https://financialmodelingprep.com/stable/quote?symbol=${symbols}&apikey=${API_KEY}`
    );
    const quotes = await res.json();
    if (Array.isArray(quotes) && quotes.length > 0) {
      const symbolToSector = Object.entries(sectorRepresentatives).reduce(
        (acc, [sector, symbol]) => { acc[symbol] = sector; return acc; },
        {} as Record<string, string>
      );
      return quotes.map((q: { symbol: string; changesPercentage: number }) => ({
        sector: symbolToSector[q.symbol] || '其他',
        changesPercentage: q.changesPercentage || 0,
      }));
    }
  } catch (e) {
    console.error('Sector performance fallback fetch failed:', e);
  }

  return null;
}

export async function GET() {
  const startTime = Date.now();
  
  try {
    const marketOpen = isUSMarketOpen();
    const now = Date.now();

    // If cache is fresh enough, return it
    if (cachedData && (now - cachedData.timestamp < CACHE_LIVE_MS)) {
      const response = NextResponse.json({
        sectors: cachedData.sectors,
        isLive: cachedData.isLive,
        cachedAt: cachedData.timestamp,
      });
      response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
      trackApiCall('/api/sector-performance', Date.now() - startTime, false);
      return response;
    }

    // Try to fetch fresh data
    const freshData = await fetchFreshData();

    if (freshData && freshData.length > 0) {
      // Check if data is all zeros (market closed returns 0s)
      const allZero = freshData.every(s => Math.abs(s.changesPercentage) < 0.001);

      if (allZero && cachedData && cachedData.sectors.length > 0) {
        // Market returned zeros — use last known good data
        cachedData = { ...cachedData, timestamp: now, isLive: false };
      } else {
        cachedData = { sectors: freshData, timestamp: now, isLive: !allZero };
      }
    } else if (!cachedData) {
      // No fresh data and no cache — return empty
      const response = NextResponse.json({ sectors: [], isLive: false, cachedAt: now });
      response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
      trackApiCall('/api/sector-performance', Date.now() - startTime, false);
      return response;
    } else {
      // Fetch failed but we have cache — keep serving it
      cachedData = { ...cachedData, timestamp: now, isLive: false };
    }

    const response = NextResponse.json({
      sectors: cachedData.sectors,
      isLive: cachedData.isLive,
      cachedAt: cachedData.timestamp,
    });
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    trackApiCall('/api/sector-performance', Date.now() - startTime, false);
    return response;
  } catch (error) {
    trackApiCall('/api/sector-performance', Date.now() - startTime, true);
    throw error;
  }
}
