import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

export const maxDuration = 60;

const API_KEY = process.env.FMP_API_KEY || '';
const BASE = 'https://financialmodelingprep.com';

// Broad candidate list: high-growth tech/SaaS/AI stocks in S&P500 + NASDAQ-100
const CANDIDATES = [
  'NVDA', 'AVGO', 'PLTR', 'SMCI', 'ARM', 'MRVL', 'CRWD', 'ANET',
  'APP', 'SNOW', 'DDOG', 'NET', 'PANW', 'ZS', 'MNDY', 'UBER',
  'COIN', 'SHOP', 'SQ', 'ABNB', 'DASH', 'RBLX', 'META', 'GOOGL',
  'MSFT', 'AAPL', 'AMZN', 'TSLA', 'CRM', 'NOW', 'ADBE', 'INTU',
  'NFLX', 'AMD', 'QCOM', 'MU', 'LRCX', 'KLAC', 'CDNS', 'SNPS',
  'FTNT', 'WDAY', 'TEAM', 'HUBS', 'VEEV', 'BILL', 'TTD', 'DKNG',
  'MELI', 'SE', 'GRAB', 'SPOT', 'ROKU', 'PINS', 'TWLO', 'OKTA',
  'ZM', 'DOCU', 'PATH', 'AI', 'SOUN', 'IONQ', 'CEG', 'VST',
];

let cachedData: any = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

interface Rule40Stock {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  revenueGrowth: number;  // YoY revenue growth %
  profitMargin: number;   // net income / revenue %
  rule40Score: number;    // growth + margin
  revPrior: number;       // prior year revenue ($B)
  revCurrent: number;     // current year revenue ($B)
  netIncome: number;      // current year net income ($B)
  numAnalysts: number;
}

export async function GET() {
  const startTime = Date.now();
  
  try {
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_DURATION) {
      const response = NextResponse.json(cachedData);
      response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
      trackApiCall('/api/rule40', Date.now() - startTime, false);
      return response;
    }

    const results: Rule40Stock[] = [];

    // Process in batches of 5
    for (let i = 0; i < CANDIDATES.length; i += 5) {
      const batch = CANDIDATES.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const [estRes, quoteRes] = await Promise.all([
              fetch(`${BASE}/stable/analyst-estimates?symbol=${symbol}&period=annual&limit=6&apikey=${API_KEY}`, {
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

            // Find CY2025 (prior year) and CY2026 (current year) estimates
            let revCY2025 = 0;
            let revCY2026 = 0;
            let netIncomeCY2026 = 0;
            let numAnalysts = 0;

            for (const est of estimates) {
              const estDate = new Date(est.date);
              const estYear = estDate.getFullYear();
              const estMonth = estDate.getMonth(); // 0-indexed

              // Map fiscal year end to calendar year
              const calYear = estMonth <= 5 ? estYear - 1 : estYear;

              if (calYear === 2025 && !revCY2025) {
                revCY2025 = est.revenueAvg;
              }
              if (calYear === 2026 && !revCY2026) {
                revCY2026 = est.revenueAvg;
                netIncomeCY2026 = est.netIncomeAvg;
                numAnalysts = est.numAnalystsRevenue || 0;
              }
            }

            if (!revCY2025 || !revCY2026) return null;

            const revenueGrowth = ((revCY2026 - revCY2025) / revCY2025) * 100;
            const profitMargin = revCY2026 > 0 ? (netIncomeCY2026 / revCY2026) * 100 : 0;
            const rule40Score = revenueGrowth + profitMargin;

            if (rule40Score < 40) return null;

            return {
              symbol,
              name: quote?.name || symbol,
              price: quote?.price || 0,
              marketCap: quote?.marketCap || 0,
              revenueGrowth: Math.round(revenueGrowth * 10) / 10,
              profitMargin: Math.round(profitMargin * 10) / 10,
              rule40Score: Math.round(rule40Score * 10) / 10,
              revPrior: Math.round(revCY2025 / 1e9 * 10) / 10,
              revCurrent: Math.round(revCY2026 / 1e9 * 10) / 10,
              netIncome: Math.round(netIncomeCY2026 / 1e9 * 10) / 10,
              numAnalysts,
            } as Rule40Stock;
          } catch {
            return null;
          }
        })
      );

      results.push(...batchResults.filter((r): r is Rule40Stock => r !== null));
    }

    // Sort by Rule40 score descending
    results.sort((a, b) => b.rule40Score - a.rule40Score);

    cachedData = results;
    cacheTimestamp = now;

    const response = NextResponse.json(results);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    trackApiCall('/api/rule40', Date.now() - startTime, false);
    return response;
  } catch (error) {
    console.error('Error in Rule40 scanner:', error);
    trackApiCall('/api/rule40', Date.now() - startTime, true);
    const response = NextResponse.json([]);
    response.headers.set('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=7200');
    return response;
  }
}
