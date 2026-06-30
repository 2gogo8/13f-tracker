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
  const { mode, summaryIds } = body as {
    mode: 'selected' | 'all_with_transcript' | 'failed_only';
    summaryIds?: string[];
  };

  if (!mode) {
    return NextResponse.json({ error: 'mode required' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  let targetIds: string[] = [];

  if (mode === 'selected') {
    if (!summaryIds || summaryIds.length === 0) {
      return NextResponse.json({ error: 'summaryIds required for mode=selected' }, { status: 400 });
    }
    targetIds = summaryIds;
  } else if (mode === 'all_with_transcript') {
    // Find all summaries that have a youtube_id (can get transcript)
    const docs = await db.collection('summaries').find({
      $or: [
        { youtube_id: { $exists: true, $ne: null } },
        { 'rawExpertInsight.youtube_id': { $exists: true, $ne: null } },
      ],
      keyInsightsV2Status: { $nin: ['completed', 'running'] },
    }).project({ _id: 1 }).toArray();
    targetIds = docs.map(d => String(d._id));
  } else if (mode === 'failed_only') {
    const docs = await db.collection('summaries').find({
      keyInsightsV2Status: { $in: ['failed', 'partial'] },
    }).project({ _id: 1 }).toArray();
    targetIds = docs.map(d => String(d._id));
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ ok: true, message: 'No matching summaries to process', results: [] });
  }

  // Process sequentially (not concurrent, to avoid rate limits)
  const results: Array<{
    summaryId: string;
    ok: boolean;
    insightsCount: number;
    status: string;
    error?: string;
  }> = [];

  for (const id of targetIds) {
    try {
      let objectId: ObjectId;
      try {
        objectId = new ObjectId(id);
      } catch {
        results.push({ summaryId: id, ok: false, insightsCount: 0, status: 'failed', error: 'Invalid ObjectId' });
        continue;
      }

      // For failed_only mode, continue from where we left off
      const isResume = mode === 'failed_only';
      const summary = await db.collection('summaries').findOne({ _id: objectId });
      let opts = {};
      if (isResume && summary) {
        const lastIdx = typeof summary.lastProcessedChunkIndex === 'number' ? summary.lastProcessedChunkIndex : -1;
        opts = { continueFrom: lastIdx + 1 };
      }

      const result = await processKeyInsightsV2Job(db, id, opts);
      results.push({
        summaryId: id,
        ok: result.ok,
        insightsCount: result.insightsCount,
        status: result.status,
        error: result.error,
      });
    } catch (err) {
      results.push({
        summaryId: id,
        ok: false,
        insightsCount: 0,
        status: 'failed',
        error: (err as Error).message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    totalProcessed: results.length,
    results,
  });
}
