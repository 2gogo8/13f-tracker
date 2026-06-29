import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Banned broadcast / podcast phrases
const BROADCAST_BANNED = ['大家好', '歡迎回到', '記得按讚', '訂閱', '開啟小鈴鐺'];

// JG 待補內容 / 後台操作指令（publish blocker）
const JG_PENDING_BLOCKERS = [
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
];

function lintSummary(doc: Record<string, unknown>): string[] {
  const errors: string[] = [];

  // 1. needsDraft check done before calling this function
  // 2. article / body
  if (!doc.article && !doc.body) errors.push('needs_article_body');
  // 3. title / jgTitle
  if (!doc.title && !doc.jgTitle) errors.push('title_missing');
  // 4. sourceDate
  if (!doc.sourceDate) errors.push('sourceDate_missing');
  // 5. analysisDate
  if (!doc.analysisDate) errors.push('analysisDate_missing');
  // 6. articleType
  if (!doc.articleType) errors.push('articleType_missing');
  // 7. tags
  if (!doc.tags || (Array.isArray(doc.tags) && (doc.tags as unknown[]).length === 0)) errors.push('tags_missing');
  // 8. 禁用口播詞
  const articleText = ((doc.article || doc.body || '') as string);
  for (const phrase of BROADCAST_BANNED) {
    if (articleText.includes(phrase)) errors.push(`banned_phrase:${phrase}`);
  }
  // 8b. JG 待補內容 / 後台操作指令 — publish blocker
  for (const blocker of JG_PENDING_BLOCKERS) {
    if (articleText.includes(blocker)) {
      errors.push('jg_pending_content:文章仍包含 JG 待補內容或後台操作指令，不能上架');
      break;
    }
  }
  // 9. source_thin
  if (doc.source_thin === true) errors.push('source_thin');
  // 10. topic / source
  if (!doc.topic) errors.push('topic_missing');
  if (!doc.source) errors.push('source_missing');

  return errors;
}

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

  // Rule 1: needsDraft=true → block immediately
  if (doc.needsDraft === true) {
    const lintErrors = ['needs_article_body'];
    await db.collection('summaries').updateOne(
      { _id: objectId },
      { $set: { lintStatus: 'fail', lintErrors, updatedAt: new Date().toISOString() } }
    );
    return NextResponse.json(
      { ok: false, lintStatus: 'fail', lintErrors, message: '尚未成稿，不能上架' },
      { status: 400 }
    );
  }

  // Run full lint
  const lintErrors = lintSummary(doc as Record<string, unknown>);
  const lintStatus: 'pass' | 'fail' = lintErrors.length === 0 ? 'pass' : 'fail';

  // Always persist lint result
  await db.collection('summaries').updateOne(
    { _id: objectId },
    { $set: { lintStatus, lintErrors, updatedAt: new Date().toISOString() } }
  );

  if (lintStatus === 'fail') {
    return NextResponse.json(
      { ok: false, lintStatus, lintErrors, message: 'Lint 不通過，無法上架' },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  await db.collection('summaries').updateOne(
    { _id: objectId },
    {
      $set: {
        alphaReady: true,
        status: 'published',
        publishedAt: now,
        updatedAt: now,
        lintStatus,
        lintErrors,
      },
    }
  );

  return NextResponse.json({ ok: true, lintStatus, lintErrors, publishedAt: now });
}
