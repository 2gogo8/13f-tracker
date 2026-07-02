#!/usr/bin/env node
/**
 * Backfill rawContentOriginal / rawContentZh / rawContentStatus
 *
 * Phase 1: expert_insights with YouTube ID but missing rawContent
 *   - Check video_transcripts collection for existing fullTranscript
 *   - If found → set rawContentOriginal + generate rawContentZh via Claude
 *   - If not found → try re-fetch from YouTube
 *
 * Phase 2: summaries with no rawContent → mark legacy_missing_raw_content
 *
 * Phase 3: expert_insights with rawText but no rawContentOriginal → copy rawText to rawContentOriginal
 *
 * Usage:
 *   node scripts/backfill-rawcontent.js --dry-run     # preview only
 *   node scripts/backfill-rawcontent.js --execute      # actually update DB
 *   node scripts/backfill-rawcontent.js --execute --skip-zh  # skip rawContentZh generation
 *   node scripts/backfill-rawcontent.js --execute --limit 5  # process max N items
 */

import { MongoClient, ObjectId } from 'mongodb';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { parseArgs } from 'util';

const { values: args } = parseArgs({
  options: {
    'dry-run':    { type: 'boolean', default: false },
    execute:      { type: 'boolean', default: false },
    'skip-zh':    { type: 'boolean', default: false },
    limit:        { type: 'string' },
    help:         { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Backfill rawContentOriginal / rawContentZh / rawContentStatus
==============================================================
  --dry-run       Preview changes (default)
  --execute       Actually update DB
  --skip-zh       Skip rawContentZh generation (just copy rawText → rawContentOriginal)
  --limit <n>     Max items to process
  --help          Show this help
`);
  process.exit(0);
}

const dryRun = !args.execute;
const skipZh = args['skip-zh'] || false;
const limit = args.limit ? parseInt(args.limit, 10) : 0;

// ── Load env ───────────────────────────────────────────────────────────────────

const envContent = readFileSync('.env.local', 'utf8');
const mongoUri = envContent.match(/MONGO_URI=(.*)/)?.[1]?.trim();
const anthropicKey = envContent.match(/ANTHROPIC_API_KEY=(.*)/)?.[1]?.trim();

if (!mongoUri) {
  console.error('❌ Missing MONGO_URI in .env.local');
  process.exit(1);
}
if (!anthropicKey && !skipZh) {
  console.error('❌ Missing ANTHROPIC_API_KEY in .env.local (use --skip-zh to skip translation)');
  process.exit(1);
}

const MODEL = 'claude-sonnet-4-5';
const DB_NAME = '13f-tracker';

// ── Generate rawContentZh via Claude ───────────────────────────────────────────

async function generateRawContentZh(anthropic, originalText, title, sourceName) {
  const truncated = originalText.slice(0, 30000); // Cap input to ~30k chars
  
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `你是財經研究分析師。以下是一篇英文影片逐字稿/文章的原文。

請將內容整理成**繁體中文段落摘要 + 關鍵觀點**，不是逐字翻譯。

要求：
- 用繁體中文
- 分段整理，每段 2-4 句話
- 保留重要數字、公司名、人名（英文原文）
- 標出關鍵觀點（用 • 符號）
- 總長度控制在 800-1500 字
- 不要加標題，直接開始內容

標題：${title || '(無標題)'}
來源：${sourceName || '(未知)'}

原文：
${truncated}`,
    }],
  });

  return response.content[0].text.trim();
}

// ── Fetch YouTube transcript ───────────────────────────────────────────────────

async function fetchYouTubeTranscript(videoId) {
  try {
    const { YoutubeTranscript } = await import('youtube-transcript');
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    if (!segments || segments.length === 0) return null;
    return segments.map(s => s.text).join(' ');
  } catch (err) {
    console.log(`    ⚠️ YouTube fetch failed for ${videoId}: ${err.message}`);
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔄 Backfill rawContentOriginal / rawContentZh`);
  console.log(`   Mode: ${dryRun ? '🔍 DRY RUN' : '⚡ EXECUTE'}`);
  console.log(`   Skip rawContentZh: ${skipZh}`);
  if (limit) console.log(`   Limit: ${limit}`);
  console.log(`${'═'.repeat(60)}\n`);

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(DB_NAME);

  const anthropic = !skipZh ? new Anthropic({ apiKey: anthropicKey }) : null;

  const stats = {
    expertCopiedRawText: 0,
    expertFetchedTranscript: 0,
    expertGeneratedZh: 0,
    expertMarkedLegacy: 0,
    summariesMarkedLegacy: 0,
    failed: 0,
    skipped: 0,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 1: expert_insights — copy rawText → rawContentOriginal for docs that have rawText
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n📦 Phase 1: expert_insights with rawText but no rawContentOriginal');
  
  const withRawText = await db.collection('expert_insights').find({
    rawText: { $exists: true, $ne: null },
    $or: [
      { rawContentOriginal: { $exists: false } },
      { rawContentOriginal: null },
    ],
  }).toArray();
  
  console.log(`   Found ${withRawText.length} docs with rawText but no rawContentOriginal`);

  let processed = 0;
  for (const doc of withRawText) {
    if (limit && processed >= limit) break;
    
    const title = doc.sourceTitle || doc.video_title || doc.title || '(untitled)';
    const rawText = typeof doc.rawText === 'string' ? doc.rawText.trim() : '';
    
    if (rawText.length < 100) {
      console.log(`   ⏭️ ${title} — rawText too short (${rawText.length} chars)`);
      stats.skipped++;
      continue;
    }

    console.log(`   📄 ${title} (${rawText.length.toLocaleString()} chars)`);

    if (!dryRun) {
      const updateFields = {
        rawContentOriginal: rawText,
        rawContentStatus: 'complete',
        updatedAt: new Date(),
      };

      // Generate rawContentZh if not skipping
      if (!skipZh && anthropic) {
        try {
          console.log(`      🔄 Generating rawContentZh...`);
          const zh = await generateRawContentZh(anthropic, rawText, title, doc.sourceName || doc.channel || '');
          updateFields.rawContentZh = zh;
          console.log(`      ✅ rawContentZh generated (${zh.length} chars)`);
          stats.expertGeneratedZh++;
        } catch (err) {
          console.log(`      ⚠️ rawContentZh generation failed: ${err.message}`);
          // Still save rawContentOriginal even if zh fails
        }
      }

      await db.collection('expert_insights').updateOne(
        { _id: doc._id },
        { $set: updateFields }
      );
    }

    stats.expertCopiedRawText++;
    processed++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 2: expert_insights with youtube_id but no rawText & no rawContentOriginal
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n📦 Phase 2: expert_insights with youtube_id but no rawContent');

  const needsFetch = await db.collection('expert_insights').find({
    youtube_id: { $exists: true, $ne: null },
    $or: [
      { rawText: { $exists: false } },
      { rawText: null },
      { rawText: '' },
    ],
    $and: [
      { $or: [{ rawContentOriginal: { $exists: false } }, { rawContentOriginal: null }] },
    ],
  }).toArray();

  console.log(`   Found ${needsFetch.length} docs needing transcript fetch`);

  for (const doc of needsFetch) {
    if (limit && processed >= limit) break;

    const title = doc.sourceTitle || doc.video_title || doc.title || '(untitled)';
    const videoId = doc.youtube_id;
    console.log(`   🎬 ${title} (youtube_id: ${videoId})`);

    // Try video_transcripts collection first
    const vtDoc = await db.collection('video_transcripts').findOne({ youtube_id: videoId });
    let transcript = vtDoc?.fullTranscript || null;

    if (!transcript) {
      console.log(`      📥 Not in video_transcripts, trying YouTube API...`);
      if (!dryRun) {
        transcript = await fetchYouTubeTranscript(videoId);
      } else {
        console.log(`      🔍 DRY RUN — would attempt YouTube fetch`);
      }
    } else {
      console.log(`      📚 Found in video_transcripts (${transcript.length.toLocaleString()} chars)`);
    }

    if (transcript && transcript.length >= 100) {
      if (!dryRun) {
        const updateFields = {
          rawContentOriginal: transcript,
          rawText: transcript,
          rawTextType: 'transcript',
          rawContentStatus: 'complete',
          updatedAt: new Date(),
        };

        if (!skipZh && anthropic) {
          try {
            console.log(`      🔄 Generating rawContentZh...`);
            const zh = await generateRawContentZh(anthropic, transcript, title, doc.sourceName || doc.channel || '');
            updateFields.rawContentZh = zh;
            console.log(`      ✅ rawContentZh generated (${zh.length} chars)`);
            stats.expertGeneratedZh++;
          } catch (err) {
            console.log(`      ⚠️ rawContentZh generation failed: ${err.message}`);
          }
        }

        await db.collection('expert_insights').updateOne(
          { _id: doc._id },
          { $set: updateFields }
        );
      }
      stats.expertFetchedTranscript++;
    } else {
      console.log(`      ❌ No transcript available`);
      if (!dryRun) {
        await db.collection('expert_insights').updateOne(
          { _id: doc._id },
          { $set: { rawContentStatus: 'transcript_unavailable', updatedAt: new Date() } }
        );
      }
      stats.expertMarkedLegacy++;
    }
    processed++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 3: expert_insights with no youtube_id, no rawText, no rawContentOriginal
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n📦 Phase 3: expert_insights with no content at all → legacy');

  const noContent = await db.collection('expert_insights').find({
    $and: [
      { $or: [{ rawText: { $exists: false } }, { rawText: null }, { rawText: '' }] },
      { $or: [{ rawContentOriginal: { $exists: false } }, { rawContentOriginal: null }] },
      { $or: [{ youtube_id: { $exists: false } }, { youtube_id: null }] },
    ],
    rawContentStatus: { $exists: false },
  }).toArray();

  console.log(`   Found ${noContent.length} docs with no content → marking legacy`);

  for (const doc of noContent) {
    const title = doc.sourceTitle || doc.video_title || doc.title || '(untitled)';
    console.log(`   📦 ${title}`);
    if (!dryRun) {
      await db.collection('expert_insights').updateOne(
        { _id: doc._id },
        { $set: { rawContentStatus: 'legacy_missing_raw_content', updatedAt: new Date() } }
      );
    }
    stats.expertMarkedLegacy++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 4: summaries with no rawContentOriginal → mark legacy
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n📦 Phase 4: summaries without rawContentOriginal → mark legacy');

  const summariesNoRaw = await db.collection('summaries').find({
    $or: [
      { rawContentOriginal: { $exists: false } },
      { rawContentOriginal: null },
    ],
    rawContentStatus: { $exists: false },
  }).toArray();

  console.log(`   Found ${summariesNoRaw.length} summaries without rawContentOriginal`);

  for (const doc of summariesNoRaw) {
    const title = doc.jgTitle || doc.title || doc.articleTitle || '(untitled)';
    console.log(`   📝 ${title}`);
    if (!dryRun) {
      await db.collection('summaries').updateOne(
        { _id: doc._id },
        { $set: { rawContentStatus: 'legacy_missing_raw_content', updatedAt: new Date() } }
      );
    }
    stats.summariesMarkedLegacy++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 Backfill Results ${dryRun ? '(DRY RUN)' : '(EXECUTED)'}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  expert_insights rawText → rawContentOriginal: ${stats.expertCopiedRawText}`);
  console.log(`  expert_insights transcript fetched:           ${stats.expertFetchedTranscript}`);
  console.log(`  expert_insights rawContentZh generated:       ${stats.expertGeneratedZh}`);
  console.log(`  expert_insights marked legacy/unavailable:    ${stats.expertMarkedLegacy}`);
  console.log(`  summaries marked legacy:                      ${stats.summariesMarkedLegacy}`);
  console.log(`  skipped (too short):                          ${stats.skipped}`);
  console.log(`  failed:                                       ${stats.failed}`);
  console.log(`${'═'.repeat(60)}\n`);

  await client.close();
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
