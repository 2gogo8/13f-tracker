import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

export const maxDuration = 60;

const API_KEY = process.env.FMP_API_KEY || '';
const BASE = 'https://financialmodelingprep.com';

let cachedData: any = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

interface AntiMarketPick {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  // Oversold data
  deviation: number;
  sma20: number;
  atr14: number;
  // Rule of 40 data
  revenueGrowth: number;
  profitMargin: number;
  rule40Score: number;
}

export async function GET() {
  const startTime = Date.now();
  
  try {
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_DURATION) {
      const response = NextResponse.json(cachedData);
      response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      trackApiCall('/api/anti-market-picks', Date.now() - startTime, false);
      return response;
    }

    // Step 1: Get oversold stocks from our existing endpoint data
    // Fetch top-picks (oversold) and rule40 in parallel
    const [oversoldRes, rule40Res] = await Promise.all([
      fetch(`${BASE}/stable/sp500-constituent?apikey=${API_KEY}`).then(r => r.json()),
      fetch(`${BASE}/stable/nasdaq-constituent?apikey=${API_KEY}`).then(r => r.json()),
    ]);

    // Merge universe
    const symbolSet = new Set<string>();
    if (Array.isArray(oversoldRes)) for (const s of oversoldRes) symbolSet.add(s.symbol);
    if (Array.isArray(rule40Res)) for (const s of rule40Res) symbolSet.add(s.symbol);
    const allSymbols = Array.from(symbolSet);

    // Step 2: Batch fetch quotes to find oversold candidates
    const batchSize = 40;
    const allQuotes: any[] = [];
    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize).join(',');
      try {
        const res = await fetch(`${BASE}/stable/batch-quote?symbols=${batch}&apikey=${API_KEY}`, {
          signal: AbortSignal.timeout(10000),
        });
        const data = await res.json();
        if (Array.isArray(data)) allQuotes.push(...data);
      } catch {}
    }

    // Step 3: For each quote, check if oversold (price < sma50 significantly)
    // Filter candidates that look oversold based on available data
    const oversoldCandidates: Map<string, any> = new Map();
    for (const q of allQuotes) {
      if (!q?.symbol || !q?.price || !q?.priceAvg50) continue;
      const deviation = ((q.price - q.priceAvg50) / q.priceAvg50) * 100;
      if (deviation < -5) { // At least 5% below 50MA
        oversoldCandidates.set(q.symbol, {
          symbol: q.symbol,
          name: q.name,
          price: q.price,
          marketCap: q.marketCap,
          deviation: Math.round(deviation * 10) / 10,
          priceAvg50: q.priceAvg50,
        });
      }
    }

    if (oversoldCandidates.size === 0) {
      cachedData = [];
      cacheTimestamp = now;
      return NextResponse.json([]);
    }

    // Step 4: For oversold candidates, check Rule of 40
    const oversoldSymbols = Array.from(oversoldCandidates.keys());
    const results: AntiMarketPick[] = [];

    // Process in batches of 5
    for (let i = 0; i < oversoldSymbols.length; i += 5) {
      const batch = oversoldSymbols.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const estRes = await fetch(
              `${BASE}/stable/analyst-estimates?symbol=${symbol}&period=annual&limit=6&apikey=${API_KEY}`,
              { signal: AbortSignal.timeout(8000) }
            );
            const estimates = await estRes.json();
            if (!Array.isArray(estimates) || estimates.length < 2) return null;

            let revCY2025 = 0, revCY2026 = 0, netIncomeCY2026 = 0;

            for (const est of estimates) {
              const d = new Date(est.date);
              const calYear = d.getMonth() <= 5 ? d.getFullYear() - 1 : d.getFullYear();

              if (calYear === 2025 && !revCY2025) revCY2025 = est.revenueAvg;
              if (calYear === 2026 && !revCY2026) {
                revCY2026 = est.revenueAvg;
                netIncomeCY2026 = est.netIncomeAvg;
              }
            }

            if (!revCY2025 || !revCY2026) return null;

            const revenueGrowth = ((revCY2026 - revCY2025) / revCY2025) * 100;
            const profitMargin = revCY2026 > 0 ? (netIncomeCY2026 / revCY2026) * 100 : 0;
            const rule40Score = revenueGrowth + profitMargin;

            if (rule40Score < 40) return null;

            const candidate = oversoldCandidates.get(symbol)!;
            return {
              symbol,
              name: candidate.name,
              price: candidate.price,
              marketCap: candidate.marketCap,
              deviation: candidate.deviation,
              sma20: candidate.priceAvg50,
              atr14: 0,
              revenueGrowth: Math.round(revenueGrowth * 10) / 10,
              profitMargin: Math.round(profitMargin * 10) / 10,
              rule40Score: Math.round(rule40Score * 10) / 10,
            } as AntiMarketPick;
          } catch {
            return null;
          }
        })
      );
      results.push(...batchResults.filter((r): r is AntiMarketPick => r !== null));
    }

    results.sort((a, b) => b.rule40Score - a.rule40Score);

    cachedData = results;
    cacheTimestamp = now;

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error in anti-market picks:', error);
    return NextResponse.json([]);
  }
}
