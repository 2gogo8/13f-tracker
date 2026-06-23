import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const type = req.nextUrl.searchParams.get('type') || 'market'; // market | watchlist
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const client = await getClientPromise();
    const db = client.db('13f-tracker');
    const alert = await db.collection('crash_alerts').findOne({}, { sort: { triggeredAt: -1 } });
    if (!alert) return NextResponse.json({ error: 'No alert' }, { status: 404 });

    const list = type === 'watchlist' ? (alert.watchlistStocks || []) : (alert.marketLosers || []);
    const stock = list.find((s: {symbol:string;chartB64?:string}) => s.symbol === symbol);
    if (!stock?.chartB64) return NextResponse.json({ error: 'No chart' }, { status: 404 });

    const buf = Buffer.from(stock.chartB64, 'base64');
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
