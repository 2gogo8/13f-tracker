import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export const maxDuration = 30;

export interface PullbackStock {
  symbol: string;
  name: string;
  currentDrawdownPct: number;
  segmentHigh: number;
  segmentHighDate: string;
  segmentLow: number;
  segmentLowDate: string;
  maxDrawdownPct: number;
  reboundPctFromLow: number;
  close: number;
}

export interface ScanResult {
  date: string;
  totalScanned: number;
  buckets: {
    b15_20: PullbackStock[];
    b20_25: PullbackStock[];
    b25_30: PullbackStock[];
    b30_35: PullbackStock[];
    b35_40: PullbackStock[];
  };
}

// In-memory cache (per-process, resets on cold start)
let cache: { data: ScanResult; timestamp: number } | null = null;
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(req: NextRequest) {
  if (cache && Date.now() - cache.timestamp < CACHE_MS) {
    return NextResponse.json(cache.data);
  }

  const client = await getClientPromise();
  const db = client.db('tw_stock');

  // Get latest date for TW strict scenario
  const latestDoc = await db.collection('ridingwave_daily_scan_results').findOne(
    { market: 'TW', scan_scenario: 'strict' },
    { sort: { date: -1 } }
  );

  if (!latestDoc) {
    return NextResponse.json({ error: 'No data' }, { status: 404 });
  }

  const latestDate: string = latestDoc.date;

  // Count total scanned on this date
  const totalScanned = await db.collection('ridingwave_daily_scan_results').countDocuments({
    market: 'TW',
    scan_scenario: 'strict',
    date: latestDate,
  });

  // Fetch stocks in 15-40% drawdown range
  const rawStocks = await db
    .collection('ridingwave_daily_scan_results')
    .find({
      market: 'TW',
      scan_scenario: 'strict',
      date: latestDate,
      'data.vs_high_pct': { $lte: -15, $gte: -40 },
    })
    .project({
      stock_id: 1,
      name: 1,
      'data.vs_high_pct': 1,
      'data.wave_high': 1,
      'data.wave_high_date': 1,
      'data.wave_low': 1,
      'data.wave_low_date': 1,
      'data.drop_pct': 1,
      'data.rebound_pct': 1,
      'data.close': 1,
    })
    .toArray();

  const buckets: ScanResult['buckets'] = {
    b15_20: [],
    b20_25: [],
    b25_30: [],
    b30_35: [],
    b35_40: [],
  };

  for (const s of rawStocks) {
    const dd = Math.abs(s.data.vs_high_pct as number);
    const item: PullbackStock = {
      symbol: s.stock_id as string,
      name: s.name as string,
      currentDrawdownPct: Math.round(dd * 100) / 100,
      segmentHigh: s.data.wave_high as number,
      segmentHighDate: s.data.wave_high_date as string,
      segmentLow: s.data.wave_low as number,
      segmentLowDate: s.data.wave_low_date as string,
      maxDrawdownPct: Math.round((s.data.drop_pct as number) * 100) / 100,
      reboundPctFromLow: Math.round((s.data.rebound_pct as number) * 100) / 100,
      close: s.data.close as number,
    };

    if (dd >= 15 && dd < 20) buckets.b15_20.push(item);
    else if (dd >= 20 && dd < 25) buckets.b20_25.push(item);
    else if (dd >= 25 && dd < 30) buckets.b25_30.push(item);
    else if (dd >= 30 && dd < 35) buckets.b30_35.push(item);
    else if (dd >= 35 && dd < 40) buckets.b35_40.push(item);
  }

  // Sort each bucket by drawdown ascending
  for (const key of Object.keys(buckets) as (keyof typeof buckets)[]) {
    buckets[key].sort((a, b) => a.currentDrawdownPct - b.currentDrawdownPct);
  }

  const result: ScanResult = {
    date: latestDate,
    totalScanned,
    buckets,
  };

  cache = { data: result, timestamp: Date.now() };

  return NextResponse.json(result);
}
