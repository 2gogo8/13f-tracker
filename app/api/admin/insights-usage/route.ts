import { NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';

const DB = '13f-tracker';
const COL = 'insights_usage_events';

export async function GET() {
  const auth = await checkAdminStatus();
  if (auth.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const client = await getClientPromise();
    const db = client.db(DB);
    const col = db.collection(COL);

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const h24ago = new Date(Date.now() - 86400000).toISOString();

    // ── Overview ─────────────────────────────────────────────────────────────
    const [
      totalUsers,
      totalPageViews,
      totalArticleViews,
      todayEvents,
      last24hEvents,
      lastEvent,
    ] = await Promise.all([
      col.distinct('userEmail').then(a => a.length),
      col.countDocuments({ eventType: 'insights_page_view' }),
      col.countDocuments({ eventType: 'article_view' }),
      col.countDocuments({ timestamp: { $gte: today } }),
      col.countDocuments({ timestamp: { $gte: h24ago } }),
      col.findOne({}, { sort: { timestamp: -1 }, projection: { timestamp: 1 } }),
    ]);

    // ── User aggregation ─────────────────────────────────────────────────────
    const userAgg = await col.aggregate([
      {
        $group: {
          _id: '$userEmail',
          userName: { $last: '$userName' },
          visitCount: {
            $sum: { $cond: [{ $eq: ['$eventType', 'insights_page_view'] }, 1, 0] },
          },
          articleViewCount: {
            $sum: { $cond: [{ $eq: ['$eventType', 'article_view'] }, 1, 0] },
          },
          lastSeenAt: { $max: '$timestamp' },
          firstSeenAt: { $min: '$timestamp' },
          sessions: { $addToSet: '$sessionId' },
          recentArticles: {
            $push: {
              $cond: [
                { $eq: ['$eventType', 'article_view'] },
                { topic: '$articleTopic', title: '$articleTitle', ts: '$timestamp' },
                '$$REMOVE',
              ],
            },
          },
        },
      },
      { $sort: { lastSeenAt: -1 } },
      { $limit: 100 },
    ]).toArray();

    const users = userAgg.map((u: any) => ({
      email: u._id,
      userName: u.userName,
      visitCount: u.visitCount,
      articleViewCount: u.articleViewCount,
      lastSeenAt: u.lastSeenAt,
      firstSeenAt: u.firstSeenAt,
      sessionCount: (u.sessions || []).filter(Boolean).length,
      recentArticle: (u.recentArticles || [])
        .sort((a: any, b: any) => b.ts.localeCompare(a.ts))[0] || null,
    }));

    // ── Article ranking ──────────────────────────────────────────────────────
    const articleAgg = await col.aggregate([
      { $match: { eventType: 'article_view', articleTopic: { $ne: null } } },
      {
        $group: {
          _id: '$articleTopic',
          articleTitle: { $last: '$articleTitle' },
          viewCount: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userEmail' },
          lastViewedAt: { $max: '$timestamp' },
        },
      },
      { $sort: { viewCount: -1 } },
      { $limit: 20 },
    ]).toArray();

    const articles = articleAgg.map((a: any) => ({
      articleTopic: a._id,
      articleTitle: a.articleTitle,
      viewCount: a.viewCount,
      uniqueUsers: a.uniqueUsers.length,
      lastViewedAt: a.lastViewedAt,
    }));

    // ── Recent events ────────────────────────────────────────────────────────
    const recentEvents = await col
      .find({}, {
        projection: {
          _id: 0,
          timestamp: 1,
          userEmail: 1,
          eventType: 1,
          articleTitle: 1,
          articleTopic: 1,
          path: 1,
          sessionId: 1,
        },
      })
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({
      overview: {
        totalUsers,
        totalPageViews,
        totalArticleViews,
        todayEvents,
        last24hEvents,
        lastEventAt: lastEvent?.timestamp ?? null,
      },
      users,
      articles,
      recentEvents,
    });
  } catch (e) {
    console.error('insights-usage error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
