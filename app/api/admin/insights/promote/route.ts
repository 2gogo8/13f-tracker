import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Forbidden – ADMIN_EMAILS not set or email not in allowlist' },
      { status: 403 }
    );
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

  const now = new Date().toISOString();

  // Build summary doc — per spec:
  // - needsDraft=true always (article not generated yet)
  // - lintStatus='fail', lintErrors=['needs_article_body'] always
  // - article/body left empty
  const summaryDoc: Record<string, unknown> = {
    // Basic metadata from source
    title: insight.title || insight.topic || insight.ticker || '',
    jgTitle: insight.jgTitle || insight.title || insight.topic || insight.ticker || '',
    topic: insight.topic || '',
    source: insight.source || '',
    sourceDate: insight.sourceDate || null,
    analysisDate: insight.analysisDate || null,
    tags: tags || insight.tags || [],
    articleType: articleType || insight.articleType || '',
    ticker: insight.ticker || '',
    expertName: insight.expert_name || insight.expertName || '',
    sourceUrl: insight.source_url || insight.sourceUrl || '',

    // Raw data copied from expert_insight
    rawExpertInsight: insight,
    keyInsights: insight.key_insights || insight.keyInsights || [],
    transcriptSample: insight.transcript_sample || insight.transcriptSample || '',
    originalExpertInsightId: objectId,

    // Article fields left EMPTY — to be filled by human editor
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
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection('summaries').insertOne(summaryDoc);

  // Update expert_insight: mark promoted
  await db.collection('expert_insights').updateOne(
    { _id: objectId },
    {
      $set: {
        status: 'promoted',
        promotedSummaryId: result.insertedId,
        promotedAt: now,
        reviewedAt: now,
        updatedAt: now,
      },
    }
  );

  return NextResponse.json({
    ok: true,
    summaryId: result.insertedId,
    needsDraft: true,
    lintStatus: 'fail',
    lintErrors: ['needs_article_body'],
  });
}
