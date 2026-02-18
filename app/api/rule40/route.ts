import { NextResponse } from 'next/server';

export const maxDuration = 60;

const API_KEY = process.env.FMP_API_KEY || '';
const BASE = 'https://financialmodelingprep.com';

// Candidates to scan for Rule40 (high-growth AI/tech universe)
const CANDIDATES = [
  'NVDA', 'AVGO', 'PLTR', 'SMCI', 'ARM', 'MRVL', 'CRWD', 'ANET',
  'APP', 'SNOW', 'DDOG', 'NET', 'PANW', 'ZS', 'MNDY', 'UBER',
  'COIN', 'SHOP', 'SQ', 'ABNB', 'DASH', 'RBLX', 'U', 'IONQ',
  'RGTI', 'QUBT', 'SOUN', 'AI', 'BBAI', 'PATH',
];

let cachedData: any = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours (estimates don't change often)

interface Rule40Stock {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  revCY2026: number;
  revCY2027: number;
  yoyGrowth: number;
  numAnalysts: number;
}

export async function GET() {
  try {
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_DURATION) {
      return NextResponse.json(cachedData);
    }

    const results: Rule40Stock[] = [];

    // Process in batches of 5 to avoid overwhelming
    for (let i = 0; i < CANDIDATES.length; i += 5) {
      const batch = CANDIDATES.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const [estRes, quoteRes] = await Promise.all([
              fetch(`${BASE}/stable/analyst-estimates?symbol=${symbol}&period=annual&limit=5&apikey=${API_KEY}`, {
                signal: AbortSignal.timeout(8000),
              }),
              fetch(`${BASE}/stable/quote?symbol=${symbol}&apikey=${API_KEY}`, {
                signal: AbortSignal.timeout(5000),
              }),
            ]);

            const estimates = await estRes.json();
            const quotes = await quoteRes.json();

            if (!Array.isArray(estimates) || estimates.length < 2) return null;

            const quote = Array.isArray(quotes) ? quotes[0] : null;

            // Find CY2026 and CY2027 estimates
            // We need to match by calendar year, accounting for different fiscal year ends
            let revCY2026 = 0;
            let revCY2027 = 0;
            let numAnalysts = 0;

            for (const est of estimates) {
              const estDate = new Date(est.date);
              const estYear = estDate.getFullYear();
              const estMonth = estDate.getMonth(); // 0-indexed

              // Map fiscal year end to calendar year:
              // If fiscal year ends Jan-Jun, it mostly covers the prior calendar year
              // If fiscal year ends Jul-Dec, it mostly covers the same calendar year
              const calYear = estMonth <= 5 ? estYear - 1 : estYear;

              if (calYear === 2026 && !revCY2026) {
                revCY2026 = est.revenueAvg;
                numAnalysts = est.numAnalystsRevenue || 0;
              }
              if (calYear === 2027 && !revCY2027) {
                revCY2027 = est.revenueAvg;
              }
            }

            if (!revCY2026 || !revCY2027) return null;

            const yoyGrowth = ((revCY2027 - revCY2026) / revCY2026) * 100;

            if (yoyGrowth < 40) return null;

            return {
              symbol,
              name: quote?.name || symbol,
              price: quote?.price || 0,
              marketCap: quote?.marketCap || 0,
              revCY2026: Math.round(revCY2026 / 1e9 * 10) / 10,
              revCY2027: Math.round(revCY2027 / 1e9 * 10) / 10,
              yoyGrowth: Math.round(yoyGrowth * 10) / 10,
              numAnalysts,
            } as Rule40Stock;
          } catch {
            return null;
          }
        })
      );

      results.push(...batchResults.filter((r): r is Rule40Stock => r !== null));
    }

    // Sort by YoY growth descending
    results.sort((a, b) => b.yoyGrowth - a.yoyGrowth);

    cachedData = results;
    cacheTimestamp = now;

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error in Rule40 scanner:', error);
    return NextResponse.json([]);
  }
}
