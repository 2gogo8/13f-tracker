import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

const DB = '13f-tracker';
const MANUAL_COL = 'jg_picks_manual';
const CACHE_COL = 'jg_picks_cache';

// PATCH /api/admin/jg-picks/[id] — deactivate (active=false)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await checkAdminStatus();
  if (auth.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const active: boolean = body.active !== false; // default deactivate

  const client = await getClientPromise();
  const db = client.db(DB);

  // Find the pick to get its symbol
  const pick = await db.collection(MANUAL_COL).findOne({ _id: new ObjectId(id) });
  if (!pick) {
    return NextResponse.json({ error: 'Pick not found' }, { status: 404 });
  }

  // Update jg_picks_manual
  await db.collection(MANUAL_COL).updateOne(
    { _id: new ObjectId(id) },
    { $set: { active, updatedAt: new Date().toISOString() } }
  );

  // If deactivated, remove from jg_picks_cache so /insights stops showing it
  // If reactivated, the cache entry stays (will be refreshed by daily job)
  if (!active) {
    // Only remove if this manual pick was the source (don't remove JSON-source entries)
    await db.collection(CACHE_COL).deleteOne({
      symbol: pick.symbol,
      source: 'manual',
    });
  }

  return NextResponse.json({ ok: true, id, active });
}
