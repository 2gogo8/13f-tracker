import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { runAutoTriage } from '@/lib/insights/autoTriage';

/**
 * POST /api/admin/insights/run-triage
 *
 * Runs auto-triage on all summaries and writes triage fields back to DB.
 * Idempotent — safe to re-run; always overwrites triage fields.
 *
 * Triage fields written:
 *   investmentRelevanceScore, topicValueScore, editorialFitScore,
 *   topicCandidateStatus, articleDecision (if not already set),
 *   suggestedUse, matchedThemes, matchedStocks, triageReason, triagedAt
 */
export async function POST(req: NextRequest) {
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Optional: force=true overwrites existing articleDecision
  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  const allDocs = await db
    .collection('summaries')
    .find(
      {},
      {
        projection: {
          _id: 1,
          status: 1,
          jgTitle: 1,
          video_title: 1,
          title: 1,
          articleTitle: 1,
          topic: 1,
          sourceDate: 1,
          createdAt: 1,
          publish_date: 1,
          article: 1,
          body: 1,
          cleanArticleDraft: 1,
          editedArticleDraft: 1,
          articleDraft: 1,
          publishedArticle: 1,
          key_insights: 1,
          keyInsights: 1,
          transcriptStored: 1,
          transcriptRef: 1,
          transcriptLength: 1,
          articleDecision: 1,
          investmentRelevanceScore: 1,
          topicValueScore: 1,
          editorialFitScore: 1,
          suggestedUse: 1,
          blocker: 1,
        },
      }
    )
    .toArray();

  const results: Record<string, unknown>[] = [];
  let updated = 0;
  let skipped = 0;

  for (const doc of allDocs) {
    const triage = runAutoTriage(doc as Record<string, unknown>);

    // Don't override manually set articleDecision unless force=true
    const existingDecision = doc.articleDecision as string | undefined;
    const manuallySet = existingDecision && doc.investmentRelevanceScore == null; // was set before triage ran
    const articleDecisionToWrite = (manuallySet && !force)
      ? existingDecision
      : triage.articleDecision;

    const update: Record<string, unknown> = {
      investmentRelevanceScore: triage.investmentRelevanceScore,
      topicValueScore: triage.topicValueScore,
      editorialFitScore: triage.editorialFitScore,
      topicCandidateStatus: triage.topicCandidateStatus,
      articleDecision: articleDecisionToWrite,
      suggestedUse: triage.suggestedUse,
      matchedThemes: triage.matchedThemes,
      matchedStocks: triage.matchedStocks,
      triageReason: triage.triageReason,
      triagedAt: triage.triagedAt,
    };

    await db.collection('summaries').updateOne(
      { _id: doc._id },
      { $set: update }
    );

    const docTitle = (doc.jgTitle || doc.video_title || doc.title || '(無標題)') as string;
    results.push({
      id: String(doc._id),
      title: docTitle.slice(0, 60),
      investmentRelevanceScore: triage.investmentRelevanceScore,
      topicValueScore: triage.topicValueScore,
      editorialFitScore: triage.editorialFitScore,
      topicCandidateStatus: triage.topicCandidateStatus,
      articleDecision: articleDecisionToWrite,
      matchedThemes: triage.matchedThemes,
      matchedStocks: triage.matchedStocks,
    });

    if (manuallySet && !force) skipped++;
    else updated++;
  }

  // Summary by bucket
  const bucketCounts: Record<string, number> = {};
  for (const r of results) {
    const s = r.topicCandidateStatus as string;
    bucketCounts[s] = (bucketCounts[s] || 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    total: allDocs.length,
    updated,
    skipped,
    bucketCounts,
    results,
  });
}
