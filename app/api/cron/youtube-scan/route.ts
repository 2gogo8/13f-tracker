import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { fetchYouTubeRSS } from '@/lib/youtube/fetchRSS';

/**
 * GET /api/cron/youtube-scan
 *
 * Vercel Cron job — runs daily at 22:00 UTC (06:00 台灣時間).
 * Scans active YouTube channels via RSS, inserts new videos as
 * status: "queued" into expert_insights for the Mac Worker to process.
 *
 * Protected by CRON_SECRET bearer token.
 */
export async function GET(req: NextRequest) {
  // 1. Verify CRON_SECRET
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  // 2. Read active channels with channelId
  const channels = await db.collection('channels')
    .find({ active: true, channelId: { $nin: [null, ''] } })
    .toArray();

  if (channels.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active channels', scanned: 0, inserted: 0 });
  }

  let totalScanned = 0;
  let totalInserted = 0;
  const errors: string[] = [];

  // 3. Scan each channel
  for (const channel of channels) {
    try {
      const feed = await fetchYouTubeRSS(channel.channelId);
      totalScanned++;

      for (const entry of feed.entries) {
        // 4. Dedup: check sourceId (new) and youtube_id (legacy)
        const existing = await db.collection('expert_insights')
          .findOne({ $or: [{ sourceId: entry.videoId }, { youtube_id: entry.videoId }] });
        if (existing) continue;

        // 5. Insert new document with unified + legacy fields
        await db.collection('expert_insights').insertOne({
          // Unified source schema
          sourceType: 'youtube',
          sourceTitle: entry.title,
          sourceUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
          sourceId: entry.videoId,
          sourceName: channel.name || channel.short || '',
          sourcePublishedAt: entry.published,
          fetchedAt: new Date().toISOString(),
          rawTextType: null,
          rawText: null,
          mediaUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
          thumbnailUrl: entry.thumbnail || null,

          // Legacy fields (backward compatibility)
          youtube_id: entry.videoId,
          video_title: entry.title,
          title: entry.title,
          channel: channel.name || channel.short || '',
          channel_id: channel.channelId,
          source_url: `https://www.youtube.com/watch?v=${entry.videoId}`,
          publish_date: entry.published?.split('T')[0] || null,
          source_type: 'youtube',
          topic: channel.name || '',

          // Status
          status: 'queued',
          enrichmentStatus: 'pending',

          // Metadata
          createdAt: new Date(),
          insertedAt: new Date(),
          scannedBy: 'cron/youtube-scan',
        });

        totalInserted++;
      }

      // 6. Update channel.lastCheckedAt
      await db.collection('channels').updateOne(
        { _id: channel._id },
        { $set: { lastCheckedAt: new Date().toISOString() } }
      );
    } catch (err) {
      const errMsg = `Channel ${channel.name || channel.channelId}: ${(err as Error).message}`;
      errors.push(errMsg);
      console.error(`[youtube-scan] ${errMsg}`);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: totalScanned,
    inserted: totalInserted,
    channelsCount: channels.length,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  });
}
