import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  const group = req.nextUrl.searchParams.get('group') || '1'; // '1' = stocks 1-5, '2' = stocks 6-10
  try {
    const client = await getClientPromise();
    const db = client.db('13f-tracker');
    const alert = await db.collection('crash_alerts').findOne({}, { sort: { triggeredAt: -1 } });
    if (!alert) return NextResponse.json({ error: 'No alert' }, { status: 404 });

    const b64 = group === '2' ? alert.composite2 : alert.composite1;
    if (!b64) return NextResponse.json({ error: 'No composite' }, { status: 404 });

    const buf = Buffer.from(b64, 'base64');
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=1800, stale-while-revalidate=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
