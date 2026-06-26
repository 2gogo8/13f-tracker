import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Forbidden – ADMIN_EMAILS not set or email not in allowlist' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const type = searchParams.get('type') || 'summary'; // 'summary' | 'expert_insight'

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  const colName = type === 'expert_insight' ? 'expert_insights' : 'summaries';
  const doc = await db.collection(colName).findOne({ _id: objectId });

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true, doc });
}
