import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { classifySummaryBucket } from '@/lib/insights/normalizeSummary';

/**
 * GET /api/admin/insights/candidates
 *
 * Returns 6 buckets for the /experts CMS view:
 *   rawMaterial  – legacy/unknown summaries + expert_insights raw material
 *   candidate    – status=candidate, has draft content, no blocker
 *   needsReview  – blocker phrase / explicit blocker / status contradiction
 *   published    – status=published + alphaReady=true + publishedArticle
 *   unpublished  – status=unpublished
 *   invalid      – no content at all
 *
 * Each bucket is sorted by sourceDate desc (rawMaterial) or publishedAt/createdAt desc.
 * Max 20 items per bucket (configurable via ?limit=N).
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
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
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
        ],
      }
    : {};

  // ── Fetch all summaries (lightweight projection for classification) ──
  const allSummaries = await db
    .collection('summaries')
    .find(searchFilter)
    .sort({ sourceDate: -1, publishedAt: -1, createdAt: -1 })
    .toArray();

  // ── Classify into 6 buckets ──
  const buckets: Record<string, unknown[]> = {
    rawMaterial: [],
    candidate: [],
    needsReview: [],
    published: [],
    unpublished: [],
    invalid: [],
  };

  for (const doc of allSummaries) {
    const bucket = classifySummaryBucket(doc as Record<string, unknown>);
    buckets[bucket].push(doc);
  }

  // ── Append expert_insights to rawMaterial ──
  // Include non-irrelevant expert_insights as raw material candidates
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

  // Triage order for expert_insights
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

  // Mark expert_insights with _source tag, prepend to rawMaterial
  const taggedExperts = filteredExperts.map(d => ({ ...d, _source: 'expert_insight' }));
  const taggedSummaryRaw = (buckets.rawMaterial as unknown[]).map(d => ({
    ...(d as object),
    _source: 'summary',
  }));

  // rawMaterial: experts first (sorted by triage), then legacy summaries (sorted by sourceDate)
  const combinedRawMaterial = [...taggedExperts, ...taggedSummaryRaw];

  // Apply per-bucket limit
  const limitedBuckets = {
    rawMaterial: combinedRawMaterial.slice(0, limit),
    candidate: (buckets.candidate as unknown[]).slice(0, limit),
    needsReview: (buckets.needsReview as unknown[]).slice(0, limit),
    published: (buckets.published as unknown[]).slice(0, limit),
    unpublished: (buckets.unpublished as unknown[]).slice(0, limit),
    invalid: (buckets.invalid as unknown[]).slice(0, limit),
  };

  return NextResponse.json({
    ok: true,
    // 6 buckets
    rawMaterial: limitedBuckets.rawMaterial,
    rawMaterialCount: combinedRawMaterial.length,
    rawMaterialExpertCount: filteredExperts.length,
    rawMaterialIrrelevantCount: irrelevantCount,
    candidate: limitedBuckets.candidate,
    candidateCount: (buckets.candidate as unknown[]).length,
    needsReview: limitedBuckets.needsReview,
    needsReviewCount: (buckets.needsReview as unknown[]).length,
    published: limitedBuckets.published,
    publishedCount: (buckets.published as unknown[]).length,
    unpublished: limitedBuckets.unpublished,
    unpublishedCount: (buckets.unpublished as unknown[]).length,
    invalid: limitedBuckets.invalid,
    invalidCount: (buckets.invalid as unknown[]).length,
    // Backward compatibility aliases
    newExpertInsights: filteredExperts,
    sectionAIrrelevantCount: irrelevantCount,
    sectionB: buckets.candidate,
    sectionBCount: (buckets.candidate as unknown[]).length,
    sectionBEmpty: (buckets.candidate as unknown[]).length === 0,
    candidateSummaries: buckets.candidate,
    publishedSummaries: buckets.published,
    unpublishedSummaries: buckets.unpublished,
    archivedRejectedUnpublished: [],
  });
}
