import { NextResponse } from 'next/server';
import { trackApiCall, trackSymbolView } from '@/lib/api-stats';

export const maxDuration = 30;

const API_KEY = process.env.FMP_API_KEY || '';
const BASE = 'https://financialmodelingprep.com';

interface ChartEvent {
  date: string;
  type: 'earnings' | 'upgrade' | 'downgrade' | 'dividend' | 'news';
  title: string;
}

let cache = new Map<string, { data: ChartEvent[]; ts: number }>();
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();

  const { symbol } = await params;
    trackSymbolView(symbol);
  const upper = symbol.toUpperCase();

  const cached = cache.get(upper);
  if (cached && Date.now() - cached.ts < CACHE_DURATION) {
    const response = NextResponse.json(cached.data);

    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');

    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');

    trackApiCall('/api/chart-events${symbol}', Date.now() - startTime, false);

    return response;
  }

  try {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const fromDate = twoYearsAgo.toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];

    // Fetch earnings dates + grades in parallel
    const [earningsRes, gradesRes, dividendsRes] = await Promise.all([
      fetch(`${BASE}/stable/earnings?symbol=${upper}&apikey=${API_KEY}`, {
        signal: AbortSignal.timeout(8000),
      }).catch(() => null),
      fetch(`${BASE}/stable/grades?symbol=${upper}&limit=20&apikey=${API_KEY}`, {
        signal: AbortSignal.timeout(8000),
      }).catch(() => null),
      fetch(`${BASE}/stable/dividends?symbol=${upper}&apikey=${API_KEY}`, {
        signal: AbortSignal.timeout(8000),
      }).catch(() => null),
    ]);

    const events: ChartEvent[] = [];

    // Parse earnings
    if (earningsRes?.ok) {
      const earnings = await earningsRes.json();
      if (Array.isArray(earnings)) {
        for (const e of earnings) {
          if (!e.date || e.date < fromDate) continue;
          const beat = e.revenue && e.revenueEstimated
            ? (e.revenue > e.revenueEstimated ? '優於預期' : '低於預期')
            : '';
          const epsStr = e.eps != null ? `EPS $${e.eps}` : '';
          events.push({
            date: e.date,
            type: 'earnings',
            title: `財報發布${beat ? '・' + beat : ''}${epsStr ? '・' + epsStr : ''}`,
          });
        }
      }
    }

    // Parse analyst grades
    if (gradesRes?.ok) {
      const grades = await gradesRes.json();
      if (Array.isArray(grades)) {
        for (const g of grades) {
          if (!g.date || g.date < fromDate) continue;
          const isUpgrade = g.newGrade && g.previousGrade &&
            ['Buy', 'Outperform', 'Overweight', 'Strong Buy'].some(s => g.newGrade.includes(s));
          const isDowngrade = g.newGrade && g.previousGrade &&
            ['Sell', 'Underperform', 'Underweight', 'Reduce'].some(s => g.newGrade.includes(s));
          
          events.push({
            date: g.date,
            type: isUpgrade ? 'upgrade' : isDowngrade ? 'downgrade' : 'news',
            title: `${g.gradingCompany || '分析師'}：${g.previousGrade || '?'} → ${g.newGrade || '?'}`,
          });
        }
      }
    }

    // Parse dividends
    if (dividendsRes?.ok) {
      const dividends = await dividendsRes.json();
      if (Array.isArray(dividends)) {
        for (const d of dividends) {
          if (!d.date || d.date < fromDate) continue;
          events.push({
            date: d.date,
            type: 'dividend',
            title: `除息 $${d.dividend?.toFixed(2) || '?'}/股`,
          });
        }
      }
    }

    // Sort by date, deduplicate same-day same-type
    events.sort((a, b) => a.date.localeCompare(b.date));

    // Limit to avoid clutter: max 2 events per date
    const limited: ChartEvent[] = [];
    const dateCount = new Map<string, number>();
    for (const evt of events) {
      const count = dateCount.get(evt.date) || 0;
      if (count >= 2) continue;
      dateCount.set(evt.date, count + 1);
      limited.push(evt);
    }

    cache.set(upper, { data: limited, ts: Date.now() });

    const response = NextResponse.json(limited);


    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');


    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');


    trackApiCall('/api/chart-events${symbol}', Date.now() - startTime, false);


    return response;
  } catch (error) {
    console.error('Error fetching chart events:', error);
    const response = NextResponse.json([]);

    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');

    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');

    trackApiCall('/api/chart-events${symbol}', Date.now() - startTime, false);

    return response;
  }
}
