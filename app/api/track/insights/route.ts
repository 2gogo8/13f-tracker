import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import getClientPromise from '@/lib/mongodb';

// ── POST /api/track/insights ──────────────────────────────────────────────────
// Logs usage events for /insights to MongoDB.
// Requires authenticated session (no isMember check).
// Events: insights_page_view | article_view | watchlist_view | session_end

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      eventType,
      articleTopic,
      articleTitle,
      sessionId,
      durationSeconds,
      metadata,
    } = body as {
      eventType?: string;
      articleTopic?: string;
      articleTitle?: string;
      sessionId?: string;
      durationSeconds?: number;
      metadata?: Record<string, unknown>;
    };

    const validEvents = ['insights_page_view', 'article_view', 'watchlist_view', 'session_end'];
    if (!eventType || !validEvents.includes(eventType)) {
      return NextResponse.json({ error: 'Invalid eventType' }, { status: 400 });
    }

    const userEmail = session.user.email || 'unknown';
    const userName = session.user.name || '';

    const event = {
      userEmail,
      userName,
      eventType,
      path: '/insights',
      articleTopic: articleTopic ?? null,
      articleTitle: articleTitle ?? null,
      timestamp: new Date().toISOString(),
      sessionId: sessionId ?? null,
      userAgent: req.headers.get('user-agent') ?? '',
      durationSeconds: durationSeconds ?? null,
      metadata: metadata ?? {},
    };

    const client = await getClientPromise();
    await client.db('13f-tracker').collection('insights_usage_events').insertOne(event);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('track/insights error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
