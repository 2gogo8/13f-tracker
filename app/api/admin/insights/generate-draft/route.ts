import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { generateDraft } from '@/lib/insights/generateDraft';

export async function POST(req: NextRequest) {
  // 1. Admin-only
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2. Parse body
  const body = await req.json();
  const { summaryId, marketDirections, marketDirectionsRaw, force } = body;
  if (!summaryId) {
    return NextResponse.json({ error: 'summaryId required' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  // 3. Generate draft
  const result = await generateDraft(db, summaryId, {
    marketDirections,
    marketDirectionsRaw,
    force: force === true,
    workerMode: false,
  });

  if (!result.ok) {
    // Distinguish skip vs hard error for HTTP status
    const status = result.errorCode === 'already_has_draft' ? 409
      : result.errorCode === 'not_found' ? 404
      : result.errorCode === 'invalid_id' ? 400
      : result.errorCode === 'not_candidate' ? 400
      : result.errorCode === 'freshness_block' ? 400
      : result.errorCode === 'json_parse_failed' ? 502
      : 400;

    return NextResponse.json(
      { ok: false, error: result.error, errorCode: result.errorCode },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    summaryId,
    draftTitle: result.draftTitle,
    draftStatus: result.draftStatus,
    blocked: result.blocked,
    generatedAt: result.generatedAt?.toISOString(),
    model: 'claude-sonnet-4-5',
    freshnessWarning: result.freshnessWarning,
    daysOld: result.daysOld,
  });
}
