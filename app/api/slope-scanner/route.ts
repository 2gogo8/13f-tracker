import { NextRequest, NextResponse } from 'next/server';
import supplyChainDB from '@/data/supply-chain';

// Build TW suppliers map: US symbol -> TW codes
const TW_SUPPLY_MAP: Record<string, string[]> = {};
for (const [usSymbol, suppliers] of Object.entries(supplyChainDB)) {
  const twList = (suppliers as Array<{market:string;ticker?:string;name:string}>)
    .filter(s => s.market === 'TW' && s.ticker)
    .map(s => s.ticker!.replace('.TW','').replace('.TWO',''));
  if (twList.length > 0) TW_SUPPLY_MAP[usSymbol] = twList;
}
import fs from 'fs';
import path from 'path';

export const maxDuration = 30;

interface PriceRecord {
  date: string;
  close: number;
}

interface PriceCacheData {
  updated_at: string;
  symbols: string[];
  prices: Record<string, PriceRecord[]>;
}

interface SlopeCacheData {
  updated_at: string;
  bench_slope: number;
  bench_post: number;
  date1: string;
  date2: string;
  results: Array<{
    symbol: string;
    slope: number;
    post_return: number;
  }>;
}

interface ShortInterestData {
  updated_at: string;
  data: Record<string, { shortPct: number; shortRatio: number }>;
}

interface SlopeResult {
  symbol: string;
  slope: number;
  post_return: number;
  group: string;
  short_pct: number;
  short_ratio: number;
  sector: string;
  industry: string;
  triple_filter: boolean;
  tw_suppliers?: string[]; // Taiwan supply chain tickers
}

function findClosestPrice(prices: PriceRecord[], targetDate: string): number | null {
  // prices are typically sorted descending by date; find closest before or on targetDate
  let closest: PriceRecord | null = null;
  let closestDiff = Infinity;

  for (const p of prices) {
    if (p.date <= targetDate) {
      const diff = new Date(targetDate).getTime() - new Date(p.date).getTime();
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = p;
      }
    }
  }
  // Allow up to 10 days gap
  if (closest && closestDiff <= 10 * 24 * 60 * 60 * 1000) {
    return closest.close;
  }
  return null;
}

function assignGroup(slope: number, benchSlope: number): string {
  if (slope >= benchSlope * 10) return '⚡爆賺';
  if (slope > 50) return 'A超強';
  if (slope > 20) return 'B中強';
  if (slope > benchSlope) return 'C死區';
  if (slope >= 0) return 'D持平';
  return 'E極弱';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date1, date2, benchmark = 'QQQ' } = body as {
      date1?: string;
      date2?: string;
      benchmark?: string;
    };

    const dataDir = path.join(process.cwd(), 'data');

    // Load short interest
    const siPath = path.join(dataDir, 'short_interest.json');
    let shortInterest: ShortInterestData = { updated_at: '', data: {} };
    if (fs.existsSync(siPath)) {
      shortInterest = JSON.parse(fs.readFileSync(siPath, 'utf-8'));
    }

    // Mode 1: Dynamic calculation with price_cache.json
    const priceCachePath = path.join(dataDir, 'price_cache.json');
    if (fs.existsSync(priceCachePath) && date1 && date2) {
      const priceCache: PriceCacheData = JSON.parse(
        fs.readFileSync(priceCachePath, 'utf-8')
      );

      // Calculate benchmark slope
      const benchPrices = priceCache.prices[benchmark];
      if (!benchPrices) {
        return NextResponse.json(
          { error: 'benchmark_not_found', message: `找不到 ${benchmark} 的價格數據` },
          { status: 400 }
        );
      }
      const benchP1 = findClosestPrice(benchPrices, date1);
      const benchP2 = findClosestPrice(benchPrices, date2);
      const benchLatest = benchPrices.reduce((a, b) =>
        a.date > b.date ? a : b
      ).close;

      if (!benchP1 || !benchP2) {
        return NextResponse.json(
          { error: 'date_range_error', message: '找不到指定日期的基準價格' },
          { status: 400 }
        );
      }

      const benchSlope = ((benchP2 - benchP1) / benchP1) * 100;
      const benchPost = ((benchLatest - benchP2) / benchP2) * 100;

      const results: SlopeResult[] = [];
      for (const sym of priceCache.symbols) {
        if (sym === benchmark) continue;
        const prices = priceCache.prices[sym];
        if (!prices || prices.length === 0) continue;

        const p1 = findClosestPrice(prices, date1);
        const p2 = findClosestPrice(prices, date2);
        if (!p1 || !p2) continue;

        const latestPrice = prices.reduce((a, b) =>
          a.date > b.date ? a : b
        ).close;
        const slope = ((p2 - p1) / p1) * 100;
        const postReturn = ((latestPrice - p2) / p2) * 100;
        const si = shortInterest.data[sym];
        const shortPct = si?.shortPct ?? 0;
        const shortRatio = si?.shortRatio ?? 0;
        const group = assignGroup(slope, benchSlope);

        results.push({
          symbol: sym,
          slope: Math.round(slope * 100) / 100,
          post_return: Math.round(postReturn * 100) / 100,
          group,
          short_pct: shortPct,
          short_ratio: shortRatio,
          sector: '',
          industry: '',
          triple_filter: slope > 50 && shortPct >= 5 && shortPct <= 15,
        });
      }

      results.sort((a, b) => b.slope - a.slope);

      return NextResponse.json({
        bench_slope: Math.round(benchSlope * 100) / 100,
        bench_post: Math.round(benchPost * 100) / 100,
        explosive_threshold: Math.round(benchSlope * 10 * 100) / 100,
        data_updated_at: priceCache.updated_at,
        mode: 'dynamic',
        results,
      });
    }

    // Mode 2: Static slope_cache.json
    const slopeCachePath = path.join(dataDir, 'slope_cache.json');
    if (fs.existsSync(slopeCachePath)) {
      const slopeCache: SlopeCacheData = JSON.parse(
        fs.readFileSync(slopeCachePath, 'utf-8')
      );

      const benchSlope = slopeCache.bench_slope;
      const results: SlopeResult[] = slopeCache.results.map((r) => {
        const si = shortInterest.data[r.symbol];
        const shortPct = si?.shortPct ?? 0;
        const shortRatio = si?.shortRatio ?? 0;
        const group = assignGroup(r.slope, benchSlope);

        return {
          symbol: r.symbol,
          slope: Math.round(r.slope * 100) / 100,
          post_return: Math.round(r.post_return * 100) / 100,
          group,
          short_pct: shortPct,
          short_ratio: shortRatio,
          sector: '',
          industry: '',
          triple_filter: r.slope > 50 && shortPct >= 5 && shortPct <= 15,
          tw_suppliers: TW_SUPPLY_MAP[r.symbol] || [],
        };
      });

      results.sort((a, b) => b.slope - a.slope);

      return NextResponse.json({
        bench_slope: Math.round(benchSlope * 100) / 100,
        bench_post: Math.round(slopeCache.bench_post * 100) / 100,
        explosive_threshold: Math.round(benchSlope * 10 * 100) / 100,
        data_updated_at: slopeCache.updated_at,
        cached_date1: slopeCache.date1,
        cached_date2: slopeCache.date2,
        mode: 'cached',
        results,
      });
    }

    // No data available
    return NextResponse.json(
      { error: 'data_not_ready', message: '請先執行 update_slope_cache.py' },
      { status: 503 }
    );
  } catch (error) {
    console.error('Slope scanner error:', error);
    return NextResponse.json(
      { error: 'server_error', message: String(error) },
      { status: 500 }
    );
  }
}
