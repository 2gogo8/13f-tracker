import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export const maxDuration = 30;

interface PricePoint {
  date: string;
  close: number;
}

interface PullbackSegment {
  segmentHigh: number;
  segmentHighDate: string;
  segmentLow: number;
  segmentLowDate: string;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  reboundPctFromLow: number;
  daysInPullback: number;
}

// JG 回檔狀態機算法
function computePullback(
  closes: PricePoint[],
  reboundResetPct: number = 40
): PullbackSegment {
  if (closes.length === 0) throw new Error('No data');

  let segHigh = closes[0].close;
  let segHighDate = closes[0].date;
  let segLow = closes[0].close;
  let segLowDate = closes[0].date;
  let maxDD = 0;

  for (const { date, close } of closes) {
    if (close > segHigh) {
      // New high — start new segment
      segHigh = close;
      segHighDate = date;
      segLow = close;
      segLowDate = date;
      maxDD = 0;
    } else {
      const dd = ((segHigh - close) / segHigh) * 100;
      if (dd > maxDD) maxDD = dd;

      if (close < segLow) {
        segLow = close;
        segLowDate = date;
      }

      // Check rebound reset condition
      const rebound = close - segLow;
      const prevDrop = segHigh - segLow;
      const minDropPct = (prevDrop / segHigh) * 100;
      if (prevDrop > 0 && minDropPct >= 8 && (rebound / prevDrop) * 100 >= reboundResetPct) {
        segHigh = close;
        segHighDate = date;
        segLow = close;
        segLowDate = date;
        maxDD = 0;
      }
    }
  }

  const latest = closes[closes.length - 1];
  const currentDD = ((segHigh - latest.close) / segHigh) * 100;
  const rebound = latest.close - segLow;
  const prevDrop = segHigh - segLow;
  const reboundPct = prevDrop > 0 ? (rebound / prevDrop) * 100 : 0;

  const highIdx = closes.findIndex((c) => c.date === segHighDate);
  const daysInPullback = closes.length - 1 - highIdx;

  return {
    segmentHigh: segHigh,
    segmentHighDate: segHighDate,
    segmentLow: segLow,
    segmentLowDate: segLowDate,
    maxDrawdownPct: Math.round(maxDD * 100) / 100,
    currentDrawdownPct: Math.round(currentDD * 100) / 100,
    reboundPctFromLow: Math.round(reboundPct * 100) / 100,
    daysInPullback,
  };
}

// Cache per symbol
const detailCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  }

  const cached = detailCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_MS) {
    return NextResponse.json(cached.data);
  }

  const client = await getClientPromise();
  const db = client.db('tw_stock');

  // Get last 250 trading days for this symbol
  const priceRecords = await db
    .collection('TW_daily_price_all')
    .find({ stock_id: symbol })
    .sort({ date: -1 })
    .limit(250)
    .project({ date: 1, close: 1, stock_name: 1 })
    .toArray();

  if (priceRecords.length === 0) {
    return NextResponse.json({ error: 'Symbol not found' }, { status: 404 });
  }

  // Sort ascending by date (was descending from DB)
  priceRecords.sort((a, b) => (a.date as string).localeCompare(b.date as string));

  const closes: PricePoint[] = priceRecords.map((r) => ({
    date: r.date as string,
    close: r.close as number,
  }));

  const stockName = priceRecords[0]?.stock_name as string || symbol;
  const pullback = computePullback(closes, 40);

  const result = {
    symbol,
    name: stockName,
    prices: closes,
    pullback,
  };

  detailCache.set(symbol, { data: result, timestamp: Date.now() });

  return NextResponse.json(result);
}
