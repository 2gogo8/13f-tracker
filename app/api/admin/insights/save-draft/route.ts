import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Phrases that indicate unpublishable draft (UI warning, not hard block)
const DRAFT_WARNING_PHRASES = [
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
  const { summary_id, editedArticleDraft } = body as { summary_id: string; editedArticleDraft: string };

  if (!summary_id) return NextResponse.json({ error: 'summary_id required' }, { status: 400 });
  if (!editedArticleDraft || !editedArticleDraft.trim()) {
    return NextResponse.json({ error: '內容不能為空' }, { status: 400 });
  }

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

  // Check for unpublishable phrases (warn but allow save)
  const hasWarningPhrases = DRAFT_WARNING_PHRASES.some(p => editedArticleDraft.includes(p));

  const now = new Date().toISOString();
  await db.collection('summaries').updateOne(
    { _id: objectId },
    {
      $set: {
        editedArticleDraft,
        editedAt: now,
        editedBy: authResult.email || 'admin',
        updatedAt: now,
        // alphaReady stays false - editing does not publish
      },
    }
  );

  return NextResponse.json({
    ok: true,
    warning: hasWarningPhrases ? '此草稿仍含後台提示，不能發佈' : null,
    editedAt: now,
  });
}
