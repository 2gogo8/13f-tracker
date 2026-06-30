import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { classifySummaryBucket } from '@/lib/insights/normalizeSummary';

/**
 * GET /api/admin/insights/candidates
 *
 * Returns 6 buckets for the /experts CMS view (new flow):
 *   rawMaterial    – low-signal raw scans, jgFitScore < 50, no triage signal
 *   topicCandidate – has title+date, or KI/transcript, or jgFitScore >= 75, or articleDecision set
 *   draftCandidate – status=candidate + alphaReady=false + clean/edited draft
 *   needsReview    – blocker phrase / explicit blocker / status contradiction / jgFitScore 50-74
 *   published      – status=published + alphaReady=true + publishedArticle
 *   invalid        – no content at all
 *
 * Each bucket sorted by sourceDate desc (newest first).
 * Max 50 items per bucket (configurable via ?limit=N).
 */
export async function GET(req: NextRequest) {
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const q = searchParams.get('q') || '';

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  // ── Build search filter ──
  const searchFilter = q
    ? {
        $or: [
          { jgTitle: { $regex: q, $options: 'i' } },
          { title: { $regex: q, $options: 'i' } },
          { topic: { $regex: q, $options: 'i' } },
          { articleTitle: { $regex: q, $options: 'i' } },
          { video_title: { $regex: q, $options: 'i' } },
        ],
      }
    : {};

  // ── Fetch all summaries ──
  const allSummaries = await db
    .collection('summaries')
    .find(searchFilter)
    .sort({ sourceDate: -1, publishedAt: -1, createdAt: -1 })
    .toArray();

  // ── Classify into new 6 buckets ──
  const buckets: Record<string, unknown[]> = {
    rawMaterial: [],
    topicCandidate: [],
    draftCandidate: [],
    needsReview: [],
    published: [],
    invalid: [],
  };

  for (const doc of allSummaries) {
    const bucket = classifySummaryBucket(doc as Record<string, unknown>);
    buckets[bucket].push(doc);
  }

  // Sort topicCandidate by jgFitScore desc, then sourceDate desc
  (buckets.topicCandidate as Array<Record<string, unknown>>).sort((a, b) => {
    const scoreA = typeof a.jgFitScore === 'number' ? a.jgFitScore : 0;
    const scoreB = typeof b.jgFitScore === 'number' ? b.jgFitScore : 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const dateA = String(a.sourceDate || a.createdAt || '');
    const dateB = String(b.sourceDate || b.createdAt || '');
    return dateB.localeCompare(dateA);
  });

  // Apply per-bucket limit
  const limitedBuckets = {
    rawMaterial: (buckets.rawMaterial as unknown[]).slice(0, limit),
    topicCandidate: (buckets.topicCandidate as unknown[]).slice(0, limit),
    draftCandidate: (buckets.draftCandidate as unknown[]).slice(0, limit),
    needsReview: (buckets.needsReview as unknown[]).slice(0, limit),
    published: (buckets.published as unknown[]).slice(0, limit),
    invalid: (buckets.invalid as unknown[]).slice(0, limit),
  };

  // ── Backward compatibility: expose expert_insights from a separate collection ──
  // Keep this for the existing "A. 新掃描內容" section
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  const expertFilter: Record<string, unknown> = {
    $or: [{ status: 'new' }, { status: { $exists: false } }],
    source_type: { $ne: 'no_match' },
    $and: [
      {
        $or: [
          { publish_date: { $gte: thirtyDaysAgoStr } },
          { createdAt: { $gte: thirtyDaysAgo } },
        ],
      },
    ],
  };
  if (q) {
    (expertFilter['$and'] as unknown[]).push({
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { topic: { $regex: q, $options: 'i' } },
      ],
    });
  }

  const expertInsights = await db
    .collection('expert_insights')
    .find(expertFilter)
    .sort({ publish_date: -1, createdAt: -1 })
    .limit(50)
    .toArray();

  const triageOrder: Record<string, number> = {
    recommended: 0,
    needs_review: 1,
    low_priority: 2,
    irrelevant: 4,
  };
  const sortedExperts = [...expertInsights].sort((a, b) => {
    const aOrder = triageOrder[a.triageStatus as string] ?? 3;
    const bOrder = triageOrder[b.triageStatus as string] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (b.priorityScore || 0) - (a.priorityScore || 0);
  });

  const irrelevantCount = sortedExperts.filter(d => d.triageStatus === 'irrelevant').length;
  const filteredExperts = sortedExperts.filter(d => d.triageStatus !== 'irrelevant');

  return NextResponse.json({
    ok: true,

    // ── New 6 buckets ──
    rawMaterial: limitedBuckets.rawMaterial,
    rawMaterialCount: (buckets.rawMaterial as unknown[]).length,

    topicCandidate: limitedBuckets.topicCandidate,
    topicCandidateCount: (buckets.topicCandidate as unknown[]).length,

    draftCandidate: limitedBuckets.draftCandidate,
    draftCandidateCount: (buckets.draftCandidate as unknown[]).length,

    needsReview: limitedBuckets.needsReview,
    needsReviewCount: (buckets.needsReview as unknown[]).length,

    published: limitedBuckets.published,
    publishedCount: (buckets.published as unknown[]).length,

    invalid: limitedBuckets.invalid,
    invalidCount: (buckets.invalid as unknown[]).length,

    // ── Expert insights (raw scan) ──
    newExpertInsights: filteredExperts,
    sectionAIrrelevantCount: irrelevantCount,

    // ── Backward compatibility aliases ──
    candidate: limitedBuckets.draftCandidate,
    candidateCount: (buckets.draftCandidate as unknown[]).length,
    candidateSummaries: buckets.draftCandidate,
    sectionB: buckets.draftCandidate,
    sectionBCount: (buckets.draftCandidate as unknown[]).length,
    sectionBEmpty: (buckets.draftCandidate as unknown[]).length === 0,
    publishedSummaries: buckets.published,
    unpublished: [],
    unpublishedCount: 0,
    unpublishedSummaries: [],
    archivedRejectedUnpublished: [],
    rawMaterialExpertCount: filteredExperts.length,
    rawMaterialIrrelevantCount: irrelevantCount,
  });
}
