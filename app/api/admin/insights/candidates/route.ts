import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { classifySummaryBucket, getContentReadiness } from '@/lib/insights/normalizeSummary';

/**
 * GET /api/admin/insights/candidates
 *
 * Returns buckets for the /experts CMS view (new content-gate flow):
 *   contentCandidate – ALL 5 conditions met (title + content + V2 + draft + meta)
 *   inProgress       – has title + content, but V2 or draft incomplete
 *   needsData        – missing title OR missing content
 *   needsReview      – blocker phrase / explicit blocker / status contradiction
 *   published        – status=published + alphaReady=true + publishedArticle
 *   invalid          – no content at all
 *   rawMaterial      – catch-all
 *
 * inProgress and needsData docs include a `missingItems` field.
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

  // ── Classify into new buckets ──
  const buckets: Record<string, unknown[]> = {
    rawMaterial: [],
    contentCandidate: [],
    inProgress: [],
    needsData: [],
    needsReview: [],
    published: [],
    invalid: [],
    // legacy aliases kept for backward compat
    topicCandidate: [],
    draftCandidate: [],
  };

  for (const doc of allSummaries) {
    const bucket = classifySummaryBucket(doc as Record<string, unknown>);
    // Attach missingItems to inProgress and needsData docs
    if (bucket === 'inProgress' || bucket === 'needsData') {
      const readiness = getContentReadiness(doc as Record<string, unknown>);
      (doc as Record<string, unknown>).missingItems = readiness.missingItems;
    }
    buckets[bucket].push(doc);
  }

  // Sort contentCandidate by draftStatus + sourceDate
  (buckets.contentCandidate as Array<Record<string, unknown>>).sort((a, b) => {
    const dateA = String(a.sourceDate || a.createdAt || '');
    const dateB = String(b.sourceDate || b.createdAt || '');
    return dateB.localeCompare(dateA);
  });

  // Sort inProgress: docs missing only draft first, then sourceDate
  (buckets.inProgress as Array<Record<string, unknown>>).sort((a, b) => {
    const missingA = (a.missingItems as string[] || []).length;
    const missingB = (b.missingItems as string[] || []).length;
    if (missingA !== missingB) return missingA - missingB;
    return String(b.sourceDate || b.createdAt || '').localeCompare(String(a.sourceDate || a.createdAt || ''));
  });

  // Apply per-bucket limit
  const limitedBuckets = {
    rawMaterial: (buckets.rawMaterial as unknown[]).slice(0, limit),
    contentCandidate: (buckets.contentCandidate as unknown[]).slice(0, limit),
    inProgress: (buckets.inProgress as unknown[]).slice(0, limit),
    needsData: (buckets.needsData as unknown[]).slice(0, limit),
    needsReview: (buckets.needsReview as unknown[]).slice(0, limit),
    published: (buckets.published as unknown[]).slice(0, limit),
    invalid: (buckets.invalid as unknown[]).slice(0, limit),
    // legacy (empty — kept for backward compat)
    topicCandidate: (buckets.topicCandidate as unknown[]).slice(0, limit),
    draftCandidate: (buckets.draftCandidate as unknown[]).slice(0, limit),
  };

  // ── Backward compatibility: expose expert_insights from a separate collection ──
  // Keep this for the existing "A. 新掃描內容" section
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  // Status-based pre-filter: hide pipeline-in-progress items
  const expertFilter: Record<string, unknown> = {
    // Exclude pipeline statuses that shouldn't appear in the CMS
    status: { $nin: ['queued', 'fetching', 'enriching'] },
    source_type: { $ne: 'no_match' },
    $and: [
      {
        $or: [
          { status: { $in: ['new', 'ready', 'needs_manual', 'failed', 'skipped'] } },
          { status: { $exists: false } },
        ],
      },
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

  // Route needs_manual → needsData, failed → needsReview, skipped → invalid
  for (const doc of sortedExperts) {
    const docStatus = doc.status as string;
    if (docStatus === 'needs_manual') {
      (buckets.needsData as unknown[]).push(doc);
    } else if (docStatus === 'failed') {
      (buckets.needsReview as unknown[]).push(doc);
    } else if (docStatus === 'skipped') {
      (buckets.invalid as unknown[]).push(doc);
    }
  }

  const irrelevantCount = sortedExperts.filter(d => d.triageStatus === 'irrelevant').length;
  const filteredExperts = sortedExperts.filter(d =>
    d.triageStatus !== 'irrelevant' &&
    !['needs_manual', 'failed', 'skipped'].includes(d.status as string)
  );

  return NextResponse.json({
    ok: true,

    // ── New content-gate buckets ──
    rawMaterial: limitedBuckets.rawMaterial,
    rawMaterialCount: (buckets.rawMaterial as unknown[]).length,

    contentCandidate: limitedBuckets.contentCandidate,
    contentCandidateCount: (buckets.contentCandidate as unknown[]).length,

    inProgress: limitedBuckets.inProgress,
    inProgressCount: (buckets.inProgress as unknown[]).length,

    needsData: limitedBuckets.needsData,
    needsDataCount: (buckets.needsData as unknown[]).length,

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
    topicCandidate: limitedBuckets.topicCandidate,
    topicCandidateCount: (buckets.topicCandidate as unknown[]).length,
    draftCandidate: limitedBuckets.draftCandidate,
    draftCandidateCount: (buckets.draftCandidate as unknown[]).length,
    candidate: limitedBuckets.contentCandidate,
    candidateCount: (buckets.contentCandidate as unknown[]).length,
    candidateSummaries: buckets.contentCandidate,
    sectionB: buckets.contentCandidate,
    sectionBCount: (buckets.contentCandidate as unknown[]).length,
    sectionBEmpty: (buckets.contentCandidate as unknown[]).length === 0,
    publishedSummaries: buckets.published,
    unpublished: [],
    unpublishedCount: 0,
    unpublishedSummaries: [],
    archivedRejectedUnpublished: [],
    rawMaterialExpertCount: filteredExperts.length,
    rawMaterialIrrelevantCount: irrelevantCount,
  });
}
