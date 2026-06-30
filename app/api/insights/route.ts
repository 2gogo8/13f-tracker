import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import getClientPromise from '@/lib/mongodb';

// ── Alpha Safety Gate v3 ──────────────────────────────────────────────────────
//
// Only shows articles that are:
//   1. alphaReady === true
//   2. status === 'published'
//   3. have publishedArticle content (not empty)
//
// Frontend content source: ONLY publishedArticle (no fallback to articleDraft)
// Rollback: revert to previous commit

// DB pre-filter: fetch only candidates that could pass the gate
const ALPHA_DB_FILTER = {
  alphaReady: true,
  status: 'published',
  publishedArticle: { $exists: true, $ne: '' },
};

export async function GET(request: Request) {
  // Require login — any Google or Discord session. No isMember check.
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    const client = await getClientPromise();
    const db = client.db('13f-tracker');

    const summaries = await db
      .collection('summaries')
      .find(ALPHA_DB_FILTER)
      .sort({ isPinned: -1, sortOrder: 1, publishedAt: -1, createdAt: -1 })
      .limit(limit)
      .project({
        tags: 1,
        source: 1,
        topic: 1,
        // Article content: ONLY publishedArticle on frontend
        publishedArticle: 1,
        articleTitle: 1,
        expertCount: 1,
        publishedAt: 1,
        createdAt: 1,
        // Metadata
        articleType: 1,
        topicLabel: 1,
        jgTitle: 1,
        sourceLabel: 1,
        sourceDate: 1,
        analysisDate: 1,
        dataCutoffDate: 1,
        // CMS fields
        status: 1,
        isPinned: 1,
        sortOrder: 1,
        displaySection: 1,
      })
      .toArray();

    // Map publishedArticle to 'article' for backward compatibility with frontend
    const mapped = summaries.map(doc => ({
      ...doc,
      article: doc.publishedArticle,
    }));

    const res = NextResponse.json(mapped);
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  } catch (error) {
    console.error('GET /api/insights error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
