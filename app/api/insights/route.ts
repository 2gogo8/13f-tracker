import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import getClientPromise from '@/lib/mongodb';

// ── Alpha Safety Gate v2 ──────────────────────────────────────────────────────
//
// Rules (ANY one must be true):
//   1. alphaReady === true  (manually approved in DB)
//   2. articleVersion === "v2_alpha" AND no script/broadcast banned phrases
//   3. _id in ALPHA_APPROVED_ARTICLES  (hardcoded whitelist by article ID)
//
// Removed: topic-based allowlist — topic-mapping.ts hit does NOT imply alpha-ready.
//
// Rollback: revert to previous commit or replace ALPHA_FILTER below with
//   { investmentRelevant: { $ne: false } }

// ── Explicit article ID whitelist (add manually approved article IDs here) ───
const ALPHA_APPROVED_ARTICLES = new Set<string>([
  // Example: '6a3bb178dcf7b7046d928600'
  // Add article _id strings here when manually approved via review
]);

// ── Banned phrases: indicate podcast / broadcast script format ───────────────
const SCRIPT_BANNED_PHRASES = [
  '大家好',
  '我是 JG',
  '今天要跟大家聊',
  '今天我們來聊',
  '這集 podcast',
  '這集 Podcast',
  '這個人的履歷誇張',
  '## 開場',
  '各位觀眾',
];

function isScriptContent(article: string | undefined | null): boolean {
  if (!article) return false;
  return SCRIPT_BANNED_PHRASES.some(phrase => article.includes(phrase));
}

function isAlphaReady(doc: Record<string, unknown>): boolean {
  // Rule 1: explicitly marked alphaReady in DB
  if (doc.alphaReady === true) return true;
  // Rule 2: v2_alpha version AND content passes lint
  if (doc.articleVersion === 'v2_alpha' && !isScriptContent(doc.article as string)) return true;
  // Rule 3: in hardcoded approved list
  if (doc._id && ALPHA_APPROVED_ARTICLES.has(String(doc._id))) return true;
  return false;
}

// DB pre-filter: fetch only candidates that could pass the gate
// (avoids loading all 18+ docs on every request)
const ALPHA_DB_FILTER = {
  investmentRelevant: { $ne: false },
  $or: [
    { alphaReady: true },
    { articleVersion: 'v2_alpha' },
    // Note: ALPHA_APPROVED_ARTICLES checked in code below
  ],
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

    // Fetch candidates
    const candidates = await db
      .collection('summaries')
      .find(ALPHA_DB_FILTER)
      .sort({ publishedAt: -1 })
      .limit(limit * 3) // over-fetch to account for content lint filtering
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
        // Alpha metadata
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

    // Apply content lint gate
    const summaries = (candidates as Record<string, unknown>[])
      .filter(doc => isAlphaReady(doc))
      .slice(0, limit);

    const res = NextResponse.json(summaries);
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  } catch (error) {
    console.error('GET /api/insights error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
