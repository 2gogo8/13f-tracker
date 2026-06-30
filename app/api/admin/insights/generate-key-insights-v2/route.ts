import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { processKeyInsightsV2Job } from '@/lib/insights/keyInsightsV2Job';

export const maxDuration = 300; // 5 min for Vercel

export async function POST(req: NextRequest) {
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { summaryId } = body;
  if (!summaryId) {
    return NextResponse.json({ error: 'summaryId required' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  const result = await processKeyInsightsV2Job(db, summaryId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...result }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    summaryId,
    insightsCount: result.insightsCount,
    status: result.status,
    jobState: result.jobState,
    coverageReport: result.jobState,
  });
}
