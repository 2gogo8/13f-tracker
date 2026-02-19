import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

const FMP_KEY = process.env.FMP_API_KEY || '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';

export const maxDuration = 30;

// In-memory cache
let cachedResult: { data: Record<string, unknown>; timestamp: number } | null = null;
const CACHE_MS = 5 * 60 * 1000; // 5 min

export async function GET() {
  const startTime = Date.now();
  
  try {
    const now = Date.now();
    if (cachedResult && (now - cachedResult.timestamp < CACHE_MS)) {
      const response = NextResponse.json(cachedResult.data);
      response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
      trackApiCall('/api/market-sentiment', Date.now() - startTime, false);
      return response;
    }
    const signals: { name: string; score: number; label: string }[] = [];

    // Signal 1: Market breadth from sector performance
    try {
      const sectorRes = await fetch(
        `https://financialmodelingprep.com/stable/sector-performance?apikey=${FMP_KEY}`
      );
      const sectors = await sectorRes.json();
      if (Array.isArray(sectors) && sectors.length > 0) {
        const changes = sectors.map((s: { changesPercentage: string }) =>
          parseFloat(s.changesPercentage)
        ).filter((v: number) => !isNaN(v));
        const positive = changes.filter((c: number) => c > 0).length;
        const avg = changes.reduce((a: number, b: number) => a + b, 0) / changes.length;
        const breadthScore = (positive / changes.length) * 100;
        const momentumScore = Math.max(0, Math.min(100, 50 + (avg / 3) * 50));
        signals.push({ name: '板塊廣度', score: Math.round(breadthScore), label: `${positive}/${changes.length} 板塊上漲` });
        signals.push({ name: '板塊動能', score: Math.round(momentumScore), label: `平均 ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%` });
      }
    } catch { /* skip */ }

    // Signal 2: Market gainers vs losers
    try {
      const [gainersRes, losersRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/stable/biggest-gainers?apikey=${FMP_KEY}`, { signal: AbortSignal.timeout(8000) }),
        fetch(`https://financialmodelingprep.com/stable/biggest-losers?apikey=${FMP_KEY}`, { signal: AbortSignal.timeout(8000) }),
      ]);
      const gainers = await gainersRes.json();
      const losers = await losersRes.json();
      if (Array.isArray(gainers) && Array.isArray(losers)) {
        const gAvg = gainers.slice(0, 10).reduce((a: number, g: { changesPercentage?: number }) => a + (g.changesPercentage ?? 0), 0) / Math.max(1, gainers.slice(0, 10).length);
        const lAvg = Math.abs(losers.slice(0, 10).reduce((a: number, l: { changesPercentage?: number }) => a + (l.changesPercentage ?? 0), 0) / Math.max(1, losers.slice(0, 10).length));
        const ratio = gAvg / Math.max(0.01, gAvg + lAvg);
        const score = Math.round(ratio * 100);
        signals.push({ name: '漲跌力道', score, label: `漲 ${gAvg.toFixed(1)}% vs 跌 ${lAvg.toFixed(1)}%` });
      }
    } catch { /* skip */ }

    // Signal 3: Most active stocks sentiment
    try {
      const activeRes = await fetch(
        `https://financialmodelingprep.com/stable/most-actives?apikey=${FMP_KEY}`
      );
      const actives = await activeRes.json();
      if (Array.isArray(actives) && actives.length > 0) {
        const top20 = actives.slice(0, 20);
        const positive = top20.filter((s: { changesPercentage?: number }) => (s.changesPercentage ?? 0) > 0).length;
        const score = Math.round((positive / top20.length) * 100);
        signals.push({ name: '熱門股情緒', score, label: `${positive}/${top20.length} 檔上漲` });
      }
    } catch { /* skip */ }

    const overall = signals.length > 0
      ? Math.round(signals.reduce((a, s) => a + s.score, 0) / signals.length)
      : 50;

    // Check if data looks like market-closed zeros
    const allZero = signals.length > 0 && signals.every(s => s.score === 0 || s.score === 50);
    const hasRealData = signals.length > 0 && !allZero;

    let overallLabel: string;
    if (overall >= 80) overallLabel = '極度貪婪';
    else if (overall >= 65) overallLabel = '貪婪';
    else if (overall >= 45) overallLabel = '中性';
    else if (overall >= 25) overallLabel = '恐懼';
    else overallLabel = '極度恐懼';

    const result = {
      overall,
      label: overallLabel,
      signals,
      isLive: hasRealData,
      updatedAt: new Date().toISOString(),
    };

    // Only update cache if we got real data, or if no cache exists
    if (hasRealData || !cachedResult) {
      cachedResult = { data: result, timestamp: now };
    } else {
      // Return cached data but update timestamp so we don't hammer API
      cachedResult = { ...cachedResult, timestamp: now };
      const response = NextResponse.json({ ...cachedResult.data, isLive: false });
      response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
      trackApiCall('/api/market-sentiment', Date.now() - startTime, false);
      return response;
    }

    const response = NextResponse.json(result);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    trackApiCall('/api/market-sentiment', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error('Market sentiment error:', error);
    trackApiCall('/api/market-sentiment', Date.now() - startTime, true);
    if (cachedResult) {
      const response = NextResponse.json({ ...cachedResult.data, isLive: false });
      response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
      return response;
    }
    const response = NextResponse.json({ overall: 50, label: '中性', signals: [], isLive: false, updatedAt: new Date().toISOString() });
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    return response;
  }
}
