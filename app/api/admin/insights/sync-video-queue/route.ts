import { NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';

export async function POST() {
  // 1. Admin-only
  const auth = await checkAdminStatus();
  if (auth.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  // 2. 查 video_queue 最近 30 天
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const videos = await db.collection('video_queue').find({
    publishedAt: { $gte: thirtyDaysAgo.toISOString() },
    videoId: { $exists: true, $nin: [null, ''] },
  }).sort({ publishedAt: -1 }).toArray();

  const results = { synced: 0, skipped: 0, skipReasons: [] as string[] };

  for (const v of videos) {
    // 去重：用 videoId 查 expert_insights
    const existing = await db.collection('expert_insights').findOne({ youtube_id: v.videoId });
    if (existing) {
      results.skipped++;
      results.skipReasons.push(`${v.videoId}: already exists`);
      continue;
    }

    // 判斷有沒有 key_insights / transcript
    const hasContent = !!(
      (Array.isArray(v.key_insights) && v.key_insights.length > 0) ||
      v.transcript_sample ||
      v.transcript
    );
    const enrichmentStatus = hasContent ? 'ready' : 'needs_transcript_or_insights';

    const publishedAtRaw = v.publishedAt;
    let publishDate: string | null = null;
    if (typeof publishedAtRaw === 'string') {
      publishDate = publishedAtRaw.split('T')[0];
    } else if (publishedAtRaw instanceof Date) {
      publishDate = publishedAtRaw.toISOString().split('T')[0];
    }

    const doc = {
      youtube_id: v.videoId,
      video_title: v.title || '',
      title: v.title || '',
      channel: v.channelName || v.channelShort || '',
      channel_id: v.channelId || '',
      source_url: v.videoUrl || `https://www.youtube.com/watch?v=${v.videoId}`,
      publish_date: publishDate,
      createdAt: new Date(),
      insertedAt: new Date(),
      status: 'new',
      source_type: 'video_queue',
      ticker: v.ticker || null,
      topic: v.topic || v.channelName || '',
      key_insights: v.key_insights || [],
      transcript_sample: v.transcript_sample || (typeof v.transcript === 'string' ? v.transcript.slice(0, 500) : '') || '',
      investmentScore: v.investmentScore || 0,
      syncedFrom: 'video_queue',
      syncedAt: new Date(),
      enrichmentStatus,
    };

    await db.collection('expert_insights').insertOne(doc);
    results.synced++;
  }

  return NextResponse.json({
    ok: true,
    total: videos.length,
    synced: results.synced,
    skipped: results.skipped,
    skipReasons: results.skipReasons,
  });
}
