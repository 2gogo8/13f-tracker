import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Publish blockers
const PUBLISH_BLOCKERS = [
  '【JG 觀點待補】',
  '《JG 觀點待補》',
  'TODO',
  'reviewer note',
  'internal instruction',
  '請 JG',
  '請從上面候選方向',
  '改寫成正式 JG 判斷',
  '後台操作指令',
];

export async function POST(req: NextRequest) {
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { summary_id } = body as { summary_id: string };

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

  const source = (doc.editedArticleDraft || doc.cleanArticleDraft) as string | undefined;
  if (!source) {
    return NextResponse.json({ error: '需要先有 editedArticleDraft 或 cleanArticleDraft 才能更新已上架內容', ok: false }, { status: 400 });
  }

  const blockerFound = PUBLISH_BLOCKERS.find(p => source.includes(p));
  if (blockerFound) {
    return NextResponse.json({
      ok: false,
      error: `草稿含有後台提示，不能更新上架：「${blockerFound}」`,
    }, { status: 400 });
  }

  const now = new Date().toISOString();
  await db.collection('summaries').updateOne(
    { _id: objectId },
    {
      $set: {
        publishedArticle: source,
        updatedPublishedAt: now,
        updatedPublishedBy: authResult.email || 'admin',
        updatedAt: now,
      },
    }
  );

  return NextResponse.json({ ok: true, updatedPublishedAt: now });
}
