import { NextRequest, NextResponse } from 'next/server';
import { clearCachePattern } from '@/lib/redis-cache';
import { isRedisEnabled } from '@/lib/redis';

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || 'jg2026admin';

export async function POST(req: NextRequest) {
  const { key } = await req.json().catch(() => ({})) as { key?: string };
  if (key !== ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
