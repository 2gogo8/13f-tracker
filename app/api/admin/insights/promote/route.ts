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
  const { expertInsightId, displaySection, articleType, tags } = body;

  if (!expertInsightId) return NextResponse.json({ error: 'expertInsightId required' }, { status: 400 });

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(expertInsightId);
  } catch {
    return NextResponse.json({ error: 'Invalid expertInsightId' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  const insight = await db.collection('expert_insights').findOne({ _id: objectId });
  if (!insight) return NextResponse.json({ error: 'expert_insight not found' }, { status: 404 });

  // ── Prevent duplicate promote ──
  const existing = await db.collection('summaries').findOne({
    $or: [
      { sourceExpertInsightId: String(objectId) },
      { originalExpertInsightId: objectId },
      ...(insight.youtube_id ? [{ youtube_id: insight.youtube_id }] : []),
    ],
    status: 'candidate',
  });
  if (existing) {
    return NextResponse.json(
      { error: '此影片已在候選文章中', existingSummaryId: String(existing._id) },
      { status: 409 }
    );
  }

  // ── Article worthiness gate ──
  const articleDecision = insight.articleDecision as string | undefined
  if (articleDecision === 'material_only') {
    return NextResponse.json(
      { error: '此素材已判斷為「只放素材庫」，不可轉成候選文章', articleDecision: 'material_only' },
      { status: 400 }
    )
  }
  if (articleDecision === 'reject') {
    return NextResponse.json(
      { error: '此素材已判斷為「不建議處理」，不可轉成候選文章', articleDecision: 'reject' },
      { status: 400 }
    )
  }
  // 若尚未跑 gate，允許轉候選（gate 未跑不等於 reject）

  // ── sourceDate fallback chain ──
  // Priority: publishedAt > publish_date > video_published_at > sourceDate (existing)
  // Never fallback to createdAt — that's insertion time, not video publish date
  let sourceDate: string | null = null;

  if (insight.publishedAt) {
    if (insight.publishedAt instanceof Date) {
      sourceDate = insight.publishedAt.toISOString().split('T')[0];
    } else if (typeof insight.publishedAt === 'string') {
      sourceDate = insight.publishedAt.split('T')[0];
    }
  }
  if (!sourceDate && typeof insight.publish_date === 'string' && insight.publish_date) {
    sourceDate = insight.publish_date.split('T')[0];
  }
  if (!sourceDate && typeof insight.video_published_at === 'string' && insight.video_published_at) {
    sourceDate = insight.video_published_at.split('T')[0];
  }
  if (!sourceDate && typeof insight.sourceDate === 'string' && insight.sourceDate && insight.sourceDate !== 'n/a') {
    sourceDate = insight.sourceDate.split('T')[0];
  }

  const sourceDateFallback = !sourceDate;
  const sourceDateFallbackReason = sourceDateFallback ? 'no_video_publish_date' : null;

  // If sourceDate is completely missing, reject
  if (!sourceDate) {
    return NextResponse.json(
      { error: '此素材缺少影片上架日期，不能轉成最新候選', sourceDateMissing: true },
      { status: 400 }
    );
  }

  const now = new Date();
  const nowISO = now.toISOString();

  const summaryDoc: Record<string, unknown> = {
    // Basic metadata
    title: insight.video_title || insight.title || insight.topic || insight.ticker || '',
    jgTitle: insight.jgTitle || insight.video_title || insight.title || insight.topic || insight.ticker || '',
    topic: insight.topic || '',
    source: insight.channel || insight.source || 'expert_interview',
    sourceDate,
    sourceDateFallback,
    sourceDateFallbackReason,
    analysisDate: insight.analysisDate || null,
    tags: tags || insight.tags || [],
    articleType: articleType || insight.articleType || '',
    ticker: insight.ticker || '',
    expertName: insight.expert_name || insight.expertName || '',
    sourceUrl: insight.source_url || insight.sourceUrl || '',

    // Source tracking
    sourceType: insight.source_type || insight.syncedFrom || 'expert_insight',
    sourceExpertInsightId: String(objectId),
    originalExpertInsightId: objectId,
    youtube_id: insight.youtube_id || null,
    video_title: insight.video_title || insight.title || '',
    channel: insight.channel || '',

    // Ranking/triage fields from expert_insight
    triageStatus: insight.triageStatus || null,
    priorityScore: insight.priorityScore || null,
    investmentRelevanceScore: insight.investmentRelevanceScore || null,
    keywordMatchScore: insight.keywordMatchScore || null,
    matchedTickers: insight.matchedTickers || [],
    matchedThemes: insight.matchedThemes || [],

    // Content fields
    keyInsights: insight.key_insights || insight.keyInsights || [],
    key_insights: insight.key_insights || [],
    transcriptSample: insight.transcript_sample || insight.transcriptSample || '',
    transcript_sample: insight.transcript_sample || '',
    enrichmentStatus: insight.enrichmentStatus || 'needs_transcript_or_insights',

    // Source material — copy from expert_insights so rawContent survives promote
    rawContentOriginal: (insight.rawContentOriginal as string) || null,
    rawContentZh: (insight.rawContentZh as string) || null,
    rawContentStatus: (insight.rawContentStatus as string) || ((insight.rawContentOriginal || insight.rawText) ? 'complete' : 'pending'),

    // Raw data
    rawExpertInsight: insight,

    // Article fields left EMPTY — to be filled by editor or AI draft
    article: '',
    body: '',

    // CMS fixed status fields
    status: 'candidate',
    alphaReady: false,
    needsDraft: true,
    draftStatus: 'needs_article',
    articleVersion: 'v2_alpha',
    lintStatus: 'fail',
    lintErrors: ['needs_article_body'],

    // Display fields
    displaySection: displaySection || '',
    sortOrder: 0,
    isPinned: false,

    // Timestamps
    promotedAt: now,
    createdAt: nowISO,
    updatedAt: nowISO,
  };

  const result = await db.collection('summaries').insertOne(summaryDoc);

  // Update expert_insight: mark promoted
  await db.collection('expert_insights').updateOne(
    { _id: objectId },
    {
      $set: {
        status: 'promoted',
        promotedSummaryId: String(result.insertedId),
        promotedAt: nowISO,
        reviewedAt: nowISO,
        updatedAt: nowISO,
      },
    }
  );

  return NextResponse.json({
    ok: true,
    summaryId: result.insertedId,
    sourceDate,
    sourceDateFallback,
    needsDraft: true,
    lintStatus: 'fail',
    lintErrors: ['needs_article_body'],
  });
}
