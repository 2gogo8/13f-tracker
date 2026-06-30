import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
  const q = searchParams.get('q') || '';

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  // A. New expert_insights (status=new or no status), 30-day filter
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
    (expertFilter['$and'] as unknown[]).push(
      { $or: [{ title: { $regex: q, $options: 'i' } }, { topic: { $regex: q, $options: 'i' } }] }
    );
  }

  const sectionADocs = await db
    .collection('expert_insights')
    .find(expertFilter)
    .sort({ publish_date: -1, createdAt: -1 })
    .limit(limit)
    .toArray();

  // 按 triageStatus 排序：recommended > needs_review > low_priority > 未評分 > irrelevant
  // 再按 priorityScore desc，再按 publish_date desc
  const triageOrder: Record<string, number> = { recommended: 0, needs_review: 1, low_priority: 2, irrelevant: 4 };

  const sorted = [...sectionADocs].sort((a, b) => {
    const aOrder = triageOrder[a.triageStatus as string] ?? 3;
    const bOrder = triageOrder[b.triageStatus as string] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if ((b.priorityScore || 0) !== (a.priorityScore || 0)) return (b.priorityScore || 0) - (a.priorityScore || 0);
    return (b.publish_date || '') > (a.publish_date || '') ? 1 : -1;
  });

  const irrelevantCount = sorted.filter(d => d.triageStatus === 'irrelevant').length;
  const newExpertInsights = sorted.filter(d => d.triageStatus !== 'irrelevant');

  const sectionAEmpty = newExpertInsights.length === 0;

  // ── B. Candidate summaries — split into new (B) and historical (B2) ──
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

  const candidateBaseFilter: Record<string, unknown> = { status: 'candidate', alphaReady: false };
  const searchFilter = q
    ? {
        $or: [
          { title: { $regex: q, $options: 'i' } },
          { jgTitle: { $regex: q, $options: 'i' } },
          { topic: { $regex: q, $options: 'i' } },
        ],
      }
    : {};

  // B 區主列表：最新候選（有 sourceType=video_queue、sourceDate 在 30 天內、未 archived）
  // 加過濾：只接受 draft_candidate 或尚未判斷（undefined/null）
  const newCandidates = await db
    .collection('summaries')
    .find({
      ...candidateBaseFilter,
      ...searchFilter,
      sourceType: 'video_queue',
      sourceDate: { $exists: true, $nin: [null, 'n/a'], $gte: thirtyDaysAgoStr },
      draftStatus: { $ne: 'archived' },
      $or: [
        { articleDecision: 'draft_candidate' },
        { articleDecision: { $exists: false } },
        { articleDecision: null },
      ],
    })
    .sort({ sourceDate: -1 })
    .limit(limit)
    .toArray();

  // B2 區：歷史候選（非 video_queue、或 sourceDate 太舊、或缺 sourceDate）
  const historicalCandidates = await db
    .collection('summaries')
    .find({
      ...candidateBaseFilter,
      ...searchFilter,
      $or: [
        { sourceType: { $ne: 'video_queue' } },
        { sourceType: { $exists: false } },
        { sourceDate: { $lt: ninetyDaysAgoStr } },
        { sourceDate: { $exists: false } },
        { sourceDate: null },
        { sourceDate: 'n/a' },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  // Also keep backward-compatible candidateSummaries (all candidates combined)
  const candidateSummaries = [...newCandidates, ...historicalCandidates];

  // C. Published summaries
  const publishedFilter: Record<string, unknown> = { status: 'published', alphaReady: true };
  if (q) {
    publishedFilter['$or'] = [
      { title: { $regex: q, $options: 'i' } },
      { jgTitle: { $regex: q, $options: 'i' } },
      { topic: { $regex: q, $options: 'i' } },
    ];
  }

  const publishedSummaries = await db
    .collection('summaries')
    .find(publishedFilter)
    .sort({ publishedAt: -1 })
    .limit(limit)
    .toArray();

  // D. Unpublished summaries (separate from rejected/archived)
  const unpublishedFilter: Record<string, unknown> = { status: 'unpublished' };
  if (q) {
    unpublishedFilter['$or'] = [
      { title: { $regex: q, $options: 'i' } },
      { jgTitle: { $regex: q, $options: 'i' } },
      { topic: { $regex: q, $options: 'i' } },
    ];
  }
  const unpublishedSummaries = await db
    .collection('summaries')
    .find(unpublishedFilter)
    .sort({ unpublishedAt: -1 })
    .limit(limit)
    .toArray();

  // E. Rejected / archived
  const archivedFilter: Record<string, unknown> = {
    status: { $in: ['rejected', 'archived'] },
  };
  if (q) {
    archivedFilter['$or'] = [
      { title: { $regex: q, $options: 'i' } },
      { jgTitle: { $regex: q, $options: 'i' } },
      { topic: { $regex: q, $options: 'i' } },
    ];
  }

  const [archivedSummaries, archivedInsights] = await Promise.all([
    db.collection('summaries').find(archivedFilter).sort({ updatedAt: -1 }).limit(limit).toArray(),
    db
      .collection('expert_insights')
      .find({ status: { $in: ['rejected', 'archived'] } })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray(),
  ]);

  return NextResponse.json({
    ok: true,
    newExpertInsights,
    sectionAIrrelevantCount: irrelevantCount,
    ...(sectionAEmpty ? { sectionAEmpty: true, sectionAEmptyReason: 'no_recent_insights' } : {}),
    // B 區分拆
    sectionB: newCandidates,
    sectionBCount: newCandidates.length,
    sectionBEmpty: newCandidates.length === 0,
    sectionBEmptyReason: newCandidates.length === 0 ? 'no_recent_video_queue_candidates' : null,
    sectionB2: historicalCandidates,
    sectionB2Count: historicalCandidates.length,
    // 向下相容
    candidateSummaries,
    publishedSummaries,
    unpublishedSummaries,
    archivedRejectedUnpublished: [
      ...archivedSummaries.map(d => ({ ...d, _source: 'summary' })),
      ...archivedInsights.map(d => ({ ...d, _source: 'expert_insight' })),
    ],
  });
}
