import { NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';

// Publish blockers
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

const PLACEHOLDER_PATTERNS = ['待補', 'placeholder', '範例', '測試文章'];

function strLen(v: unknown): number {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().length : 0;
}

function resolveDate(doc: Record<string, unknown>): { date: string | null; field: string | null } {
  const chain: [string, string][] = [
    ['sourceDate', 'sourceDate'],
    ['publish_date', 'publish_date'],
    ['video_published_at', 'video_published_at'],
    ['publishedAt', 'publishedAt'],
    ['createdAt', 'createdAt'],
    ['updatedAt', 'updatedAt'],
  ];

  for (const [field, label] of chain) {
    const val = doc[field];
    if (val && val !== 'n/a') {
      const str = val instanceof Date ? val.toISOString() : String(val);
      return { date: str.split('T')[0], field: label };
    }
  }
  return { date: null, field: null };
}

export async function GET() {
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  const summaries = await db.collection('summaries').find({}).toArray();

  // ── Per-article analysis ──
  const articles: Record<string, unknown>[] = [];
  const issues: { id: string; title: string; issue: string; severity: string }[] = [];

  // Category counters
  let candidateCount = 0;
  let publishableCount = 0;
  let publishedCount = 0;
  let unpublishedCount = 0;
  let legacyCount = 0;
  let invalidCount = 0;
  let placeholderCount = 0;
  let stateMismatchCount = 0;
  let dateMissingCount = 0;
  let noContentCount = 0;
  let needsReviewCount = 0;

  for (const doc of summaries) {
    const id = String(doc._id);
    const title = (doc.jgTitle || doc.video_title || doc.title || doc.articleTitle || doc.topic || '(無標題)') as string;
    const status = (doc.status as string) || 'unknown';
    const alphaReady = doc.alphaReady === true;
    const draftStatus = doc.draftStatus as string | null;

    const articleDraftLen = strLen(doc.articleDraft);
    const cleanArticleDraftLen = strLen(doc.cleanArticleDraft);
    const editedArticleDraftLen = strLen(doc.editedArticleDraft);
    const publishedArticleLen = strLen(doc.publishedArticle);
    const articleLen = strLen(doc.article);
    const bodyLen = strLen(doc.body);

    const hasNewStyleContent = editedArticleDraftLen > 0 || cleanArticleDraftLen > 0 || articleDraftLen > 0 || publishedArticleLen > 0;
    const hasLegacyContent = (articleLen > 0 || bodyLen > 0) && !hasNewStyleContent;
    const hasAnyContent = hasNewStyleContent || articleLen > 0 || bodyLen > 0;

    // Resolve display draft source
    let displayDraftSource: string | null = null;
    if (editedArticleDraftLen > 0) displayDraftSource = 'editedArticleDraft';
    else if (cleanArticleDraftLen > 0) displayDraftSource = 'cleanArticleDraft';
    else if (articleDraftLen > 0) displayDraftSource = 'articleDraft';
    else if (publishedArticleLen > 0) displayDraftSource = 'publishedArticle';
    else if (articleLen > 0) displayDraftSource = 'article';
    else if (bodyLen > 0) displayDraftSource = 'body';

    // Resolve editable source
    const editableContentSource = displayDraftSource;
    const canEdit = hasAnyContent;

    // Check publish blockers
    const allContent = [doc.editedArticleDraft, doc.cleanArticleDraft, doc.articleDraft, doc.publishedArticle, doc.article, doc.body]
      .filter(Boolean).join(' ');
    const blockers = PUBLISH_BLOCKERS.filter(p => allContent.includes(p));
    const placeholders = PLACEHOLDER_PATTERNS.filter(p => allContent.toLowerCase().includes(p.toLowerCase()));

    const publishBlockedReasons: string[] = [];
    if (blockers.length > 0) publishBlockedReasons.push(`含後台提示：${blockers[0]}`);
    if (!hasAnyContent) publishBlockedReasons.push('無可發佈正文');
    if (status === 'published') publishBlockedReasons.push('已發佈');

    const canPublish = status !== 'published' && publishBlockedReasons.length === 0 && hasAnyContent;

    // Warnings
    const warnings: string[] = [];

    // Date resolution
    const resolved = resolveDate(doc as Record<string, unknown>);
    const dateUsed = resolved.date;
    const dateFieldUsed = resolved.field;

    // State lifecycle
    let lifecycle = 'unknown';
    if (status === 'candidate' && !alphaReady && draftStatus === 'draft_ready') lifecycle = 'draft_ready';
    else if (status === 'candidate' && !alphaReady && draftStatus === 'needs_article') lifecycle = 'needs_article';
    else if (status === 'candidate' && !alphaReady) lifecycle = 'candidate';
    else if (status === 'published' && alphaReady) lifecycle = 'published';
    else if (status === 'unpublished') lifecycle = 'unpublished';
    else if (status === 'archived') lifecycle = 'archived';
    else if (status === 'rejected') lifecycle = 'rejected';
    else lifecycle = 'invalid';

    // Count categories
    if (status === 'candidate') candidateCount++;
    if (status === 'published' && alphaReady) publishedCount++;
    if (status === 'unpublished') unpublishedCount++;
    if (canPublish) publishableCount++;
    if (hasLegacyContent) legacyCount++;
    if (placeholders.length > 0) placeholderCount++;
    if (!hasAnyContent) noContentCount++;

    const isDateMissing = !doc.sourceDate || doc.sourceDate === 'n/a';
    if (isDateMissing) dateMissingCount++;

    // State mismatches
    const mismatchReasons: string[] = [];
    if (status === 'published' && !alphaReady) {
      mismatchReasons.push('status=published but alphaReady=false');
    }
    if (alphaReady && status !== 'published') {
      mismatchReasons.push('alphaReady=true but status=' + status);
    }
    if (publishedArticleLen > 0 && status !== 'published' && status !== 'unpublished') {
      mismatchReasons.push(`has publishedArticle (${publishedArticleLen} chars) but status=${status}`);
    }
    if (status === 'unknown') {
      mismatchReasons.push('status field missing (unknown)');
    }
    if (mismatchReasons.length > 0) {
      stateMismatchCount++;
      for (const reason of mismatchReasons) {
        issues.push({ id, title, issue: reason, severity: 'error' });
      }
    }

    // Needs review
    if (blockers.length > 0 && status === 'candidate' && draftStatus === 'draft_ready') needsReviewCount++;

    if (lifecycle === 'invalid') invalidCount++;

    articles.push({
      _id: id,
      title: title.substring(0, 80),
      status,
      alphaReady,
      draftStatus,
      lifecycle,
      sourceDate: doc.sourceDate || null,
      dateUsed,
      dateFieldUsed,
      publishedAt: doc.publishedAt || null,
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null,
      contentLengths: {
        articleDraft: articleDraftLen,
        cleanArticleDraft: cleanArticleDraftLen,
        editedArticleDraft: editedArticleDraftLen,
        publishedArticle: publishedArticleLen,
        article: articleLen,
        body: bodyLen,
      },
      displayDraftSource,
      editableContentSource,
      canEdit,
      canPublish,
      publishBlockedReasons,
      warnings,
      hasLegacyContent,
      hasPlaceholder: placeholders.length > 0,
      blockers,
      placeholders,
      mismatchReasons,
      isDateMissing,
    });
  }

  // ── Latest 20 dry-run ──
  const sortedForLatest = [...articles].sort((a, b) => {
    const dateA = (a.dateUsed as string) || '';
    const dateB = (b.dateUsed as string) || '';
    return dateB.localeCompare(dateA);
  });

  const latest20 = sortedForLatest.slice(0, 20).map((art, idx) => ({
    ranking: idx + 1,
    _id: art._id,
    title: art.title,
    dateUsed: art.dateUsed,
    dateFieldUsed: art.dateFieldUsed,
    contentSource: art.displayDraftSource,
    contentLength: Object.values(art.contentLengths as Record<string, number>).reduce((a, b) => Math.max(a, b), 0),
    canPublish: art.canPublish,
    publishBlockedReasons: art.publishBlockedReasons,
    isInLatest10: idx < 10 && art.canPublish,
    blockedFromLatest10Reason: !art.canPublish ? (art.publishBlockedReasons as string[]).join('; ') : null,
  }));

  const publishableForLatest = latest20.filter(a => a.canPublish);
  const canFillLatest10 = publishableForLatest.length >= 10;

  // ── Expert insights stats ──
  const eiTotal = await db.collection('expert_insights').countDocuments();
  const eiNew = await db.collection('expert_insights').countDocuments({
    $or: [{ status: 'new' }, { status: { $exists: false } }],
  });
  const eiPromoted = await db.collection('expert_insights').countDocuments({ status: 'promoted' });
  const eiArchived = await db.collection('expert_insights').countDocuments({
    status: { $in: ['archived', 'rejected'] },
  });

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),

    // Summary stats
    stats: {
      totalSummaries: summaries.length,
      candidateCount,
      publishedCount,
      unpublishedCount,
      legacyCount,
      invalidCount,
      publishableCount,
      placeholderCount,
      stateMismatchCount,
      dateMissingCount,
      noContentCount,
      needsReviewCount,
    },

    // Expert insights stats
    expertInsights: {
      total: eiTotal,
      new: eiNew,
      promoted: eiPromoted,
      archived: eiArchived,
    },

    // All articles detail
    articles,

    // Issues list
    issues,

    // Latest 20 dry-run
    latest20DryRun: {
      articles: latest20,
      publishableCount: publishableForLatest.length,
      canFillLatest10,
      shortfallReason: !canFillLatest10
        ? `只有 ${publishableForLatest.length} 篇可上架，差 ${10 - publishableForLatest.length} 篇`
        : null,
    },
  });
}
