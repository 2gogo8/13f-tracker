import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

export const maxDuration = 30;

const API_KEY = process.env.FMP_API_KEY || '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const BASE = 'https://financialmodelingprep.com';

// Sector ETFs as proxies
const SECTOR_ETFS: { symbol: string; sector: string }[] = [
  { symbol: 'XLK', sector: '科技' },
  { symbol: 'XLF', sector: '金融' },
  { symbol: 'XLE', sector: '能源' },
  { symbol: 'XLV', sector: '醫療' },
  { symbol: 'XLP', sector: '必需' },
  { symbol: 'XLY', sector: '消費' },
  { symbol: 'XLU', sector: '公用' },
  { symbol: 'XLRE', sector: '地產' },
  { symbol: 'XLB', sector: '原料' },
  { symbol: 'XLI', sector: '工業' },
  { symbol: 'XLC', sector: '通訊' },
];

let cachedData: { sectors: { sector: string; etf: string; change10d: number; prices: number[] }[]; timestamp: number } | null = null;
const CACHE_MS = 30 * 60 * 1000; // 30 min (historical doesn't change fast)

function getDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

export async function GET() {
  const startTime = Date.now();

  try {
    const now = Date.now();
    if (cachedData && now - cachedData.timestamp < CACHE_MS) {
      const response = NextResponse.json(cachedData.sectors);
      response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
      trackApiCall('/api/sector-performance-10d', Date.now() - startTime, false);
      return response;
    }

    const from = getDateStr(20); // fetch 20 calendar days to get ~10 trading days
    const to = getDateStr(0);
    const symbols = SECTOR_ETFS.map(e => e.symbol).join(',');

    // Batch fetch all ETF histories
    const results = await Promise.all(
      SECTOR_ETFS.map(async ({ symbol, sector }) => {
        try {
          const res = await fetch(
            `${BASE}/stable/historical-price-eod/full?symbol=${symbol}&from=${from}&to=${to}&apikey=${API_KEY}`,
            { signal: AbortSignal.timeout(8000) }
          );
          const data = await res.json();
          const items = Array.isArray(data) ? data : [];
          if (items.length < 2) return null;
          
          // Sort oldest first
          items.sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
          
          const oldest = items[0].close;
          const newest = items[items.length - 1].close;
          const change10d = ((newest - oldest) / oldest) * 100;
          
          // Last 10 closing prices for sparkline
          const prices = items.slice(-10).map((d: { close: number }) => d.close);

          return { sector, etf: symbol, change10d: Math.round(change10d * 100) / 100, prices };
        } catch {
          return null;
        }
      })
    );

    const sectors = results.filter((r): r is NonNullable<typeof r> => r !== null);
    sectors.sort((a, b) => b.change10d - a.change10d);

    cachedData = { sectors, timestamp: now };

    const response = NextResponse.json(sectors);
    response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
    trackApiCall('/api/sector-performance-10d', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error('Sector 10d error:', error);
    trackApiCall('/api/sector-performance-10d', Date.now() - startTime, true);
    return NextResponse.json([]);
  }
}
