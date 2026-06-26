import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Forbidden – ADMIN_EMAILS not set or email not in allowlist' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
  const q = searchParams.get('q') || '';

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  // A. New expert_insights (status=new or no status)
  const expertFilter: Record<string, unknown> = {
    $or: [{ status: 'new' }, { status: { $exists: false } }],
  };
  if (q) {
    expertFilter['$and'] = [
      { $or: [{ title: { $regex: q, $options: 'i' } }, { topic: { $regex: q, $options: 'i' } }] },
    ];
  }

  const newExpertInsights = await db
    .collection('expert_insights')
    .find(expertFilter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  // B. Candidate summaries
  const candidateFilter: Record<string, unknown> = { status: 'candidate' };
  if (q) {
    candidateFilter['$or'] = [
      { title: { $regex: q, $options: 'i' } },
      { jgTitle: { $regex: q, $options: 'i' } },
      { topic: { $regex: q, $options: 'i' } },
    ];
  }

  const candidateSummaries = await db
    .collection('summaries')
    .find(candidateFilter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

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

  // D. Rejected / archived / unpublished
  const archivedFilter: Record<string, unknown> = {
    status: { $in: ['rejected', 'archived', 'unpublished'] },
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
    candidateSummaries,
    publishedSummaries,
    archivedRejectedUnpublished: [
      ...archivedSummaries.map(d => ({ ...d, _source: 'summary' })),
      ...archivedInsights.map(d => ({ ...d, _source: 'expert_insight' })),
    ],
  });
}
