import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { processKeyInsightsV2Job } from '@/lib/insights/keyInsightsV2Job';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { summaryId, resetFailed } = body;
  if (!summaryId) {
    return NextResponse.json({ error: 'summaryId required' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  // Find the summary to get lastProcessedChunkIndex
  let objectId: ObjectId;
  try {
    objectId = new ObjectId(summaryId);
  } catch {
    return NextResponse.json({ error: 'Invalid summaryId' }, { status: 400 });
  }

  const summary = await db.collection('summaries').findOne({ _id: objectId });
  if (!summary) {
    return NextResponse.json({ error: 'Summary not found' }, { status: 404 });
  }

  const lastIdx = typeof summary.lastProcessedChunkIndex === 'number' ? summary.lastProcessedChunkIndex : -1;
  const continueFrom = lastIdx + 1;

  if (continueFrom >= (summary.totalChunks || 0) && !resetFailed) {
    return NextResponse.json({
      ok: true,
      message: 'All chunks already processed',
      summaryId,
      insightsCount: summary.insightsCount || summary.keyInsightsV2Count || 0,
      status: summary.keyInsightsV2Status || 'completed',
    });
  }

  const result = await processKeyInsightsV2Job(db, summaryId, {
    continueFrom: resetFailed ? undefined : continueFrom,
    resetFailed,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...result }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    summaryId,
    insightsCount: result.insightsCount,
    status: result.status,
    jobState: result.jobState,
    continuedFrom: continueFrom,
  });
}
