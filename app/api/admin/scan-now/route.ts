import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { checkAdminStatus } from '@/lib/admin';

export async function POST(req: NextRequest) {
  const auth = await checkAdminStatus();
  if (auth.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const client = await getClientPromise();
  await client.db('13f-tracker').collection('scan_queue').insertOne({
    requestedAt: new Date().toISOString(),
    requestedBy: 'web',
    status: 'pending',
  });

  return NextResponse.json({ ok: true, message: '已送出掃描請求，約 15 分鐘內執行' });
}

// GET: check queue status
export async function GET(req: NextRequest) {
  const auth = await checkAdminStatus();
  if (auth.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const client = await getClientPromise();
  const latest = await client.db('13f-tracker').collection('scan_queue')
    .findOne({}, { sort: { requestedAt: -1 } });

  return NextResponse.json({ ok: true, latest });
}
