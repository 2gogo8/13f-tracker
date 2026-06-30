import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(req: NextRequest) {
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { summary_id, reason } = body as { summary_id: string; reason?: string };

  if (!summary_id) return NextResponse.json({ error: 'summary_id required' }, { status: 400 });

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(summary_id);
  } catch {
    return NextResponse.json({ error: 'Invalid summary_id' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  const doc = await db.collection('summaries').findOne({ _id: objectId });
  if (!doc) return NextResponse.json({ error: 'Summary not found' }, { status: 404 });

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    alphaReady: false,
    status: 'unpublished',
    unpublishedAt: now,
    unpublishedBy: authResult.email || 'admin',
    updatedAt: now,
  };
  if (reason) update.unpublishReason = reason;

  await db.collection('summaries').updateOne({ _id: objectId }, { $set: update });

  return NextResponse.json({ ok: true, unpublishedAt: now });
}
