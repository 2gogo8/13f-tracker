/**
 * scan-now.js - 手動觸發頻道掃描
 * 掃描所有 active 頻道 RSS，把新影片寫入 expert_insights (status: queued)
 */

const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');

// Read .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) envVars[k.trim()] = v.join('=').trim();
});

const MONGO_URI = envVars.MONGO_URI;

async function fetchRSS(channelId) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();

  const entries = [];
  const entryBlocks = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
  
  for (const block of entryBlocks) {
    const videoIdMatch = block.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
    const titleMatch = block.match(/<title>(.*?)<\/title>/);
    const publishedMatch = block.match(/<published>(.*?)<\/published>/);
    const thumbnailMatch = block.match(/url="(https:\/\/i\.ytimg\.com[^"]+)"/);
    
    if (videoIdMatch && titleMatch) {
      const title = titleMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      
      entries.push({
        videoId: videoIdMatch[1],
        title,
        published: publishedMatch ? publishedMatch[1] : null,
        thumbnail: thumbnailMatch ? thumbnailMatch[1] : null,
        videoUrl: `https://www.youtube.com/watch?v=${videoIdMatch[1]}`,
      });
    }
  }
  return entries;
}

async function main() {
  console.log('🔍 Channel Scanner — starting...\n');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('13f-tracker');

  const channels = await db.collection('channels')
    .find({ active: true, channelId: { $nin: [null, ''] } })
    .toArray();

  console.log(`Found ${channels.length} active channels\n`);

  let totalNew = 0;
  const now = new Date();

  for (const channel of channels) {
    if (channel.type === 'podcast') {
      console.log(`⏭️  Skipping podcast: ${channel.name} (RSS format different)`);
      continue;
    }

    console.log(`📡 Scanning: ${channel.name} (${channel.channelId})`);
    
    try {
      const entries = await fetchRSS(channel.channelId);
      console.log(`   Found ${entries.length} videos in RSS`);

      let newCount = 0;
      for (const entry of entries) {
        // De-duplicate: check both sourceId and youtube_id
        const existing = await db.collection('expert_insights').findOne({
          $or: [
            { sourceId: entry.videoId },
            { youtube_id: entry.videoId }
          ]
        });
        if (existing) continue;

        // Insert new item as queued
        await db.collection('expert_insights').insertOne({
          // New schema fields
          sourceType: 'youtube',
          sourceTitle: entry.title,
          sourceUrl: entry.videoUrl,
          sourceId: entry.videoId,
          sourceName: channel.name,
          sourcePublishedAt: entry.published,
          fetchedAt: now.toISOString(),
          thumbnailUrl: entry.thumbnail || null,
          rawText: null,
          rawTextType: null,
          status: 'queued',
          pipeline: 'youtube-rss',
          
          // Legacy fields (backward compat)
          youtube_id: entry.videoId,
          video_title: entry.title,
          title: entry.title,
          channel: channel.name,
          source_url: entry.videoUrl,
          publish_date: entry.published ? entry.published.split('T')[0] : null,
          createdAt: now,
          insertedAt: now,
          
          // Channel metadata
          channelId: channel._id?.toString(),
          channelDbId: channel._id?.toString(),
        });
        newCount++;
        totalNew++;
        console.log(`   ✅ New: "${entry.title.slice(0, 60)}"`);
      }

      if (newCount === 0) console.log(`   ✓ No new videos`);

      // Update lastCheckedAt
      await db.collection('channels').updateOne(
        { _id: channel._id },
        { $set: { lastCheckedAt: now.toISOString() } }
      );

    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
    }
  }

  console.log(`\n📊 Scan complete: ${totalNew} new videos added (status: queued)`);
  await client.close();
}

main().catch(console.error);
