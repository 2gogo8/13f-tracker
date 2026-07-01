import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Publish blockers — content with these phrases cannot be published
const PUBLISH_BLOCKERS = [
  '【JG 觀點待補】',
  '《JG 觀點待補》',
  '請從上面候選方向',
  '候選方向中選一個',
  '改寫成正式 JG 判斷',
  'reviewer note',
  'internal instruction',
  'TODO for JG',
  '請 JG',
  '後台操作指令',
  'TODO',
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
  const { summaryId } = body;

  if (!summaryId) return NextResponse.json({ error: 'summaryId required' }, { status: 400 });

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(summaryId);
  } catch {
    return NextResponse.json({ error: 'Invalid summaryId' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  const doc = await db.collection('summaries').findOne({ _id: objectId });
  if (!doc) return NextResponse.json({ error: 'Summary not found' }, { status: 404 });

  // Source: prefer editedArticleDraft > cleanArticleDraft > article (legacy fallback)
  const source = (doc.editedArticleDraft || doc.cleanArticleDraft || doc.article || doc.body) as string | undefined;

  if (!source || !source.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: '發佈需要先有草稿內容。請先生成草稿再發佈。',
      },
      { status: 400 }
    );
  }

  // Check for publish blockers
  const blockerFound = PUBLISH_BLOCKERS.find(p => source.includes(p));
  if (blockerFound) {
    return NextResponse.json(
      {
        ok: false,
        error: `草稿含有後台提示，不能發佈：「${blockerFound}」`,
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  await db.collection('summaries').updateOne(
    { _id: objectId },
    {
      $set: {
        publishedArticle: source,
        alphaReady: true,
        status: 'published',
        publishedAt: now,
        publishedBy: authResult.email || 'admin',
        publishSource: 'admin_manual_publish',
        updatedAt: now,
      },
    }
  );

  return NextResponse.json({ ok: true, publishedAt: now });
}
