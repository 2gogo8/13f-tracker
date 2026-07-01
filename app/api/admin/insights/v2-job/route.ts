import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/**
 * V2 Job State Management API
 * Actions: queue, resume, retry-failed, reset
 * These only update state — actual LLM work is done by the local worker script.
 */

export async function POST(req: NextRequest) {
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { action, summaryId, confirmed } = body;

  if (!summaryId || !action) {
    return NextResponse.json({ error: 'summaryId and action required' }, { status: 400 });
  }

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(summaryId);
  } catch {
    return NextResponse.json({ error: 'Invalid summaryId' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');
  const summaries = db.collection('summaries');
  const insightChunks = db.collection('insight_chunks');

  const summary = await summaries.findOne({ _id: objectId });
  if (!summary) {
    return NextResponse.json({ error: 'Summary not found' }, { status: 404 });
  }

  switch (action) {
    case 'queue': {
      // Set status to 'queued' — ready for worker to pick up
      await summaries.updateOne({ _id: objectId }, {
        $set: {
          keyInsightsV2Status: 'queued',
          lastError: null,
          updatedAt: new Date(),
        },
      });
      return NextResponse.json({
        ok: true,
        action: 'queue',
        summaryId,
        message: 'Status set to queued. Run the worker script to process.',
      });
    }

    case 'resume': {
      // Set status to 'queued' for worker pickup (preserves existing progress)
      await summaries.updateOne({ _id: objectId }, {
        $set: {
          keyInsightsV2Status: 'queued',
          lastError: null,
          updatedAt: new Date(),
        },
      });
      return NextResponse.json({
        ok: true,
        action: 'resume',
        summaryId,
        message: 'Status set to queued (resume). Run worker with --resume flag.',
      });
    }

    case 'retry-failed': {
      // Reset failed chunks: delete failed insight_chunks records, set status back to 'partial'
      const failedChunks = await insightChunks.countDocuments({ summaryId: objectId, status: 'failed' });
      await insightChunks.deleteMany({ summaryId: objectId, status: 'failed' });
      await summaries.updateOne({ _id: objectId }, {
        $set: {
          keyInsightsV2Status: 'queued',
          failedChunks: 0,
          lastError: null,
          updatedAt: new Date(),
        },
      });
      return NextResponse.json({
        ok: true,
        action: 'retry-failed',
        summaryId,
        deletedFailedChunks: failedChunks,
        message: `Cleared ${failedChunks} failed chunk records. Run worker with --retry-failed.`,
      });
    }

    case 'reset': {
      if (!confirmed) {
        return NextResponse.json({
          error: 'Reset requires confirmed: true',
          message: 'This will delete all V2 data for this summary. Set confirmed: true to proceed.',
        }, { status: 400 });
      }
      // Delete all insight_chunks for this summary
      const deletedChunks = await insightChunks.deleteMany({ summaryId: objectId });
      // Reset all V2 fields on the summary
      await summaries.updateOne({ _id: objectId }, {
        $set: {
          keyInsightsV2: [],
          keyInsightsV2Status: 'not_started',
          keyInsightsV2StartedAt: null,
          keyInsightsV2CompletedAt: null,
          keyInsightsV2GeneratedAt: null,
          keyInsightsV2Count: 0,
          transcriptCharLength: null,
          totalChunks: null,
          processedChunks: 0,
          failedChunks: 0,
          skippedChunks: 0,
          coveragePercent: 0,
          insightsCount: 0,
          lastProcessedChunkIndex: -1,
          lastError: null,
          modelUsed: null,
          coverageReport: null,
          updatedAt: new Date(),
        },
      });
      return NextResponse.json({
        ok: true,
        action: 'reset',
        summaryId,
        deletedChunks: deletedChunks.deletedCount,
        message: 'All V2 data reset. Summary ready for fresh processing.',
      });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}. Valid: queue, resume, retry-failed, reset` }, { status: 400 });
  }
}

/**
 * GET: Retrieve V2 job status for a summary
 */
export async function GET(req: NextRequest) {
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const summaryId = req.nextUrl.searchParams.get('summaryId');
  if (!summaryId) {
    return NextResponse.json({ error: 'summaryId required' }, { status: 400 });
  }

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(summaryId);
  } catch {
    return NextResponse.json({ error: 'Invalid summaryId' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  const summary = await db.collection('summaries').findOne(
    { _id: objectId },
    {
      projection: {
        title: 1,
        keyInsightsV2Status: 1,
        transcriptCharLength: 1,
        totalChunks: 1,
        processedChunks: 1,
        failedChunks: 1,
        skippedChunks: 1,
        coveragePercent: 1,
        insightsCount: 1,
        lastProcessedChunkIndex: 1,
        lastError: 1,
        modelUsed: 1,
        keyInsightsV2StartedAt: 1,
        keyInsightsV2CompletedAt: 1,
        keyInsightsV2GeneratedAt: 1,
      },
    }
  );

  if (!summary) {
    return NextResponse.json({ error: 'Summary not found' }, { status: 404 });
  }

  // Get chunk-level details
  const chunkStats = await db.collection('insight_chunks').aggregate([
    { $match: { summaryId: objectId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).toArray();

  return NextResponse.json({
    ok: true,
    summary: {
      _id: summary._id,
      title: summary.title,
      keyInsightsV2Status: summary.keyInsightsV2Status,
      transcriptCharLength: summary.transcriptCharLength,
      totalChunks: summary.totalChunks,
      processedChunks: summary.processedChunks,
      failedChunks: summary.failedChunks,
      skippedChunks: summary.skippedChunks,
      coveragePercent: summary.coveragePercent,
      insightsCount: summary.insightsCount,
      lastProcessedChunkIndex: summary.lastProcessedChunkIndex,
      lastError: summary.lastError,
      modelUsed: summary.modelUsed,
      startedAt: summary.keyInsightsV2StartedAt,
      completedAt: summary.keyInsightsV2CompletedAt,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chunkStats: chunkStats.reduce((acc: Record<string, number>, g: any) => { acc[g._id as string] = g.count as number; return acc; }, {} as Record<string, number>),
  });
}
