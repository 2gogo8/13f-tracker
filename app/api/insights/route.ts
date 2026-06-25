import { NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

// ── Alpha Safety Gate ─────────────────────────────────────────────────────────
// Only these topic keys are allowed in the public Alpha feed.
// To add a new article: either set articleVersion="v2_alpha" or alphaReady=true in DB,
// OR add the topic key below.
// Rollback: remove the filter from the .find() query below.
const ALPHA_TOPIC_ALLOWLIST = new Set([
  'All-In·6/24',
  'Manual·6/24',
  'a16z·6/24',
  'ARK·6/24',
]);

const ALPHA_FILTER = {
  investmentRelevant: { $ne: false },
  $or: [
    { articleVersion: 'v2_alpha' },
    { alphaReady: true },
    { topic: { $in: Array.from(ALPHA_TOPIC_ALLOWLIST) } },
  ],
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    const client = await getClientPromise();
    const db = client.db('13f-tracker');

    const summaries = await db
      .collection('summaries')
      .find(ALPHA_FILTER)
      .sort({ publishedAt: -1 })
      .limit(limit)
      .project({
        tags: 1,
        source: 1,
        topic: 1,
        summary: 1,
        article: 1,
        articleTitle: 1,
        expertCount: 1,
        publishedAt: 1,
        createdAt: 1,
        // Alpha metadata fields
        articleVersion: 1,
        alphaReady: 1,
        articleType: 1,
        topicLabel: 1,
        jgTitle: 1,
        sourceLabel: 1,
        sourceDate: 1,
        analysisDate: 1,
        dataCutoffDate: 1,
        claimsToCheck: 1,
        verificationPoints: 1,
        needsReview: 1,
      })
      .toArray();

    const res = NextResponse.json(summaries);
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  } catch (error) {
    console.error('GET /api/insights error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
