import { NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export async function GET() {
  try {
    const client = await getClientPromise();
    const db = client.db('13f-tracker');
    // Get latest crash alert
    const alert = await db.collection('crash_alerts')
      .findOne({}, { sort: { triggeredAt: -1 } });
    if (!alert) {
      return NextResponse.json({ alert: null });
    }
    // Remove large chart data for list view — return metadata only
    const meta = {
      date: alert.date,
      triggeredAt: alert.triggeredAt,
      ixicChange: alert.ixicChange,
      composite1: alert.composite1 || null,
      composite2: alert.composite2 || null,
      marketLosers: (alert.marketLosers || []).map((s: {symbol:string;name:string;change:number;price:number;chartB64?:string}) => ({
        symbol: s.symbol, name: s.name, change: s.change, price: s.price,
        hasChart: !!s.chartB64,
      })),
      watchlistStocks: (alert.watchlistStocks || []).map((s: {symbol:string;name:string;change:number;chartB64?:string}) => ({
        symbol: s.symbol, name: s.name, change: s.change,
        hasChart: !!s.chartB64,
      })),
    };
    const res = NextResponse.json({ alert: meta });
    res.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=60');
    return res;
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
