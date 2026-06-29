import { NextRequest, NextResponse } from 'next/server';
import { clearCachePattern } from '@/lib/redis-cache';
import { isRedisEnabled } from '@/lib/redis';
import { checkAdminStatus } from '@/lib/admin';

export async function POST(req: NextRequest) {
  // Accept either a valid admin session OR the server-side ADMIN_KEY header
  const authHeader = req.headers.get('Authorization') || '';
  const keyFromHeader = authHeader.replace('Bearer ', '').trim();
  const serverAdminKey = process.env.ADMIN_KEY;
  const headerOk = serverAdminKey && keyFromHeader === serverAdminKey;

  if (!headerOk) {
    const auth = await checkAdminStatus();
    if (auth.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!isRedisEnabled) {
    return NextResponse.json({ cleared: 0, note: 'Redis not configured — in-memory cache cannot be cleared remotely' });
  }

  const patterns = ['anti-market:*', 'top-picks:*', 'lock:*'];
  let total = 0;
  for (const p of patterns) {
    total += await clearCachePattern(p);
  }

  return NextResponse.json({ cleared: total, patterns });
}
