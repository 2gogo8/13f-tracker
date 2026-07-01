#!/usr/bin/env node
/**
 * Key Insights V2 Worker — Local CLI for chunk-by-chunk LLM processing.
 *
 * Usage:
 *   node scripts/insights-worker.mjs --summaryId=<id> [--resume]
 *   node scripts/insights-worker.mjs --all-partial --resume
 *   node scripts/insights-worker.mjs --all-with-transcript [--limit=N]
 *   node scripts/insights-worker.mjs --all-with-article-content [--resume]
 *   node scripts/insights-worker.mjs --retry-failed --summaryId=<id>
 *   node scripts/insights-worker.mjs --dry-run --all-with-transcript
 *
 * Requires .env.local with MONGO_URI and ANTHROPIC_API_KEY
 */

import { MongoClient, ObjectId } from 'mongodb';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { parseArgs } from 'util';

// ── Parse CLI args ─────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    summaryId:                  { type: 'string' },
    resume:                     { type: 'boolean', default: false },
    'all-partial':              { type: 'boolean', default: false },
    'all-with-transcript':      { type: 'boolean', default: false },
    'all-with-article-content': { type: 'boolean', default: false },
    'retry-failed':             { type: 'boolean', default: false },
    'dry-run':                  { type: 'boolean', default: false },
    limit:                      { type: 'string' },
    help:                       { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Key Insights V2 Worker
======================
Flags:
  --summaryId=<id>            Process a single summary
  --resume                    Skip already-completed chunks
  --all-partial               Process all partial/failed summaries
  --all-with-transcript       Process all summaries that have youtube_id OR article content
  --all-with-article-content  Process only non-YouTube sources (article/bloomberg/podcast)
  --retry-failed              Retry only failed chunks for a summary
  --limit=N                   Max summaries to process
  --dry-run                   Show plan without making LLM calls
  --help                      Show this help
`);
  process.exit(0);
}

// ── Load env ───────────────────────────────────────────────────────────────────

const envContent = readFileSync('.env.local', 'utf8');
const mongoUri = envContent.match(/MONGO_URI=(.*)/)?.[1]?.trim();
const anthropicKey = envContent.match(/ANTHROPIC_API_KEY=(.*)/)?.[1]?.trim();

if (!mongoUri || !anthropicKey) {
  console.error('❌ Missing MONGO_URI or ANTHROPIC_API_KEY in .env.local');
  process.exit(1);
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 4500;
const MODEL = 'claude-sonnet-4-5';
const DB_NAME = '13f-tracker';

// ── Helpers ────────────────────────────────────────────────────────────────────

function cleanLLMJson(raw) {
  return raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
}

function chunkTranscript(text) {
  const chunks = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const searchStart = Math.max(pos + 3000, end - 300);
      const searchBack = text.substring(searchStart, end);
      const lastBreak = Math.max(
        searchBack.lastIndexOf('. '),
        searchBack.lastIndexOf('。'),
        searchBack.lastIndexOf('！'),
        searchBack.lastIndexOf('？'),
        searchBack.lastIndexOf('\n')
      );
      if (lastBreak > 0) end = searchStart + lastBreak + 1;
    }
    chunks.push({ chunk: text.substring(pos, end), charStart: pos, charEnd: end });
    pos = end;
  }
  return chunks;
}

async function processChunk(anthropic, chunk, chunkIndex, totalChunks, charStart, charEnd, videoTitle, channel) {
  const systemPrompt = `You are a financial research analyst extracting key investment insights from video transcripts. You must return ONLY a valid JSON array. No markdown, no explanation.`;
  const userPrompt = `Video: "${videoTitle}" (Channel: ${channel || 'unknown'})
Transcript chunk ${chunkIndex + 1} / ${totalChunks} (chars ${charStart}–${charEnd}):

---
${chunk}
---

Extract ALL investment-relevant insights from this chunk. For each insight, return a JSON object:

{
  "zhTitle": "繁體中文標題，20字以內，精準描述這條洞察的核心",
  "insightTitle": "concise English title (max 80 chars)",
  "zhSummary": "繁體中文摘要，2-4 句話說明此觀點重點",
  "zhEvidenceSummary": "繁體中文，1-2句，說明哪些具體數據或陳述支持這條洞察（可引用數字、比例、時間點）",
  "sourceExcerpt": "the exact transcript excerpt supporting this insight, 300-800 chars, MUST be verbatim from the chunk above",
  "sourceCharStart": ${charStart},
  "sourceCharEnd": ${charEnd},
  "chunkIndex": ${chunkIndex},
  "totalChunks": ${totalChunks},
  "timestampStart": null,
  "timestampEnd": null,
  "importanceScore": 0-100,
  "investmentRelevanceScore": 0-100,
  "topicTags": ["tag1", "tag2"],
  "tickers": ["TICKER1"],
  "companies": ["Company Name"],
  "suggestedArticleAngle": "繁體中文，1-2 句，從這條 insight 可以怎麼寫文章",
  "whyItMatters": "繁體中文，1-2 句，為什麼這件事對投資人重要"
}

Rules:
- zhTitle: 繁體中文，20字以內，必填
- zhEvidenceSummary: 繁體中文，必填，說明支持數據或依據
- sourceExcerpt MUST be verbatim from the transcript, 300-800 chars. No paraphrasing.
- If a chunk has no investment-relevant content, return an empty array []
- importanceScore: how important is this insight overall (0-100)
- investmentRelevanceScore: how relevant to investment decisions (0-100)
- Only extract insights with importanceScore >= 30
- Return a JSON array of objects. Nothing else.`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawText = msg.content[0].text.trim();
  const cleanText = cleanLLMJson(rawText);

  try {
    const parsed = JSON.parse(cleanText);
    if (!Array.isArray(parsed)) return { insights: [], error: null };
    // Filter: must have sourceExcerpt (discard without it)
    const valid = parsed.filter(item =>
      typeof item.sourceExcerpt === 'string' &&
      item.sourceExcerpt.length >= 100 &&
      typeof item.insightTitle === 'string'
    );
    return { insights: valid, error: null };
  } catch (parseErr) {
    return { insights: [], error: `JSON parse failed: ${parseErr.message}` };
  }
}

// ── Ensure insight_chunks collection + index ───────────────────────────────────

async function ensureInsightChunksCollection(db) {
  const collections = await db.listCollections({ name: 'insight_chunks' }).toArray();
  if (collections.length === 0) {
    await db.createCollection('insight_chunks');
    console.log('📦 Created insight_chunks collection');
  }
  try {
    await db.collection('insight_chunks').createIndex(
      { summaryId: 1, chunkIndex: 1 },
      { unique: true, name: 'summaryId_chunkIndex_unique' }
    );
    console.log('📇 Ensured unique index on insight_chunks (summaryId, chunkIndex)');
  } catch (e) {
    // Index may already exist
    if (!e.message.includes('already exists')) throw e;
  }
}

// ── Get transcript ─────────────────────────────────────────────────────────────

async function getTranscript(db, summary) {
  // 1. Try YouTube transcript (by youtube_id)
  const youtubeId = summary.youtube_id || summary.rawExpertInsight?.youtube_id;
  if (youtubeId) {
    const transcriptDoc = await db.collection('video_transcripts').findOne({ youtube_id: youtubeId });
    if (transcriptDoc?.fullTranscript) {
      await db.collection('summaries').updateOne(
        { _id: summary._id },
        { $set: { workerInputField: 'video_transcripts.fullTranscript', workerInputSource: 'youtube' } }
      );
      return transcriptDoc.fullTranscript;
    }

    // Try fetching from YouTube
    console.log(`  📥 Fetching transcript from YouTube for ${youtubeId}...`);
    try {
      const { YoutubeTranscript } = await import('youtube-transcript');
      let lines;
      try { lines = await YoutubeTranscript.fetchTranscript(youtubeId, { lang: 'en' }); }
      catch { lines = await YoutubeTranscript.fetchTranscript(youtubeId); }
      if (lines?.length) {
        const fullTranscript = lines.map(l => l.text).join(' ');
        const now = new Date();
        await db.collection('video_transcripts').updateOne(
          { youtube_id: youtubeId },
          {
            $set: { youtube_id: youtubeId, fullTranscript, transcriptLength: fullTranscript.length, transcriptSource: 'youtube-transcript', fetchedAt: now.toISOString(), updatedAt: now.toISOString() },
            $setOnInsert: { createdAt: now.toISOString() },
          },
          { upsert: true }
        );
        await db.collection('summaries').updateOne(
          { _id: summary._id },
          { $set: { workerInputField: 'video_transcripts.fullTranscript', workerInputSource: 'youtube' } }
        );
        return fullTranscript;
      }
    } catch (err) {
      console.error(`  ❌ Failed to fetch transcript: ${err.message}`);
    }
    // YouTube ID present but no transcript available — do NOT fall through to article
    return null;
  }

  // 2. Article content fallback (non-YouTube sources)
  const articleText = summary.article || summary.body || summary.rawText || summary.sourceText || '';
  if (typeof articleText === 'string' && articleText.trim().length >= 100) {
    console.log(`  📰 Using article content (${articleText.trim().length} chars) as input`);
    await db.collection('summaries').updateOne(
      { _id: summary._id },
      { $set: { workerInputField: 'article', workerInputSource: 'article_content' } }
    );
    return articleText;
  }

  return null;
}

// ── Process a single summary ───────────────────────────────────────────────────

async function processSummary(db, anthropic, summaryId, options = {}) {
  const { resume = false, retryFailed = false, dryRun = false } = options;
  const objectId = new ObjectId(summaryId);
  const summary = await db.collection('summaries').findOne({ _id: objectId });

  if (!summary) {
    console.error(`❌ Summary not found: ${summaryId}`);
    return { ok: false };
  }

  const title = summary.jgTitle || summary.title || summary.video_title || summary.articleTitle || summary.rawExpertInsight?.title || '(untitled)';
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📄 ${title}`);
  console.log(`   ID: ${summaryId}`);

  // Get transcript
  const fullTranscript = await getTranscript(db, summary);
  if (!fullTranscript || fullTranscript.length < 100) {
    console.error('  ❌ No transcript or too short');
    await db.collection('summaries').updateOne({ _id: objectId }, {
      $set: { keyInsightsV2Status: 'failed', lastError: 'No transcript available', updatedAt: new Date() }
    });
    return { ok: false };
  }

  const chunks = chunkTranscript(fullTranscript);
  const totalChunks = chunks.length;
  const videoTitle = summary.jgTitle || summary.title || summary.video_title || summary.articleTitle || summary.rawExpertInsight?.title || '';
  const channel = summary.sourceChannel || summary.rawExpertInsight?.channel || '';

  console.log(`   Transcript: ${fullTranscript.length.toLocaleString()} chars | ${totalChunks} chunks`);

  // Determine which chunks to skip
  const chunksCollection = db.collection('insight_chunks');
  let chunksToProcess = [];

  if (retryFailed) {
    // Only retry chunks marked as 'failed' in insight_chunks
    const failedChunkDocs = await chunksCollection.find({ summaryId: objectId, status: 'failed' }).toArray();
    if (failedChunkDocs.length === 0) {
      // Also check: chunks that don't exist yet (never processed)
      const existingChunkIndexes = new Set(
        (await chunksCollection.find({ summaryId: objectId }).project({ chunkIndex: 1 }).toArray()).map(d => d.chunkIndex)
      );
      for (let i = 0; i < totalChunks; i++) {
        if (!existingChunkIndexes.has(i)) chunksToProcess.push(i);
      }
      if (chunksToProcess.length === 0) {
        console.log('  ✅ No failed chunks to retry');
        return { ok: true };
      }
      console.log(`  🔄 ${chunksToProcess.length} unprocessed chunks found`);
    } else {
      chunksToProcess = failedChunkDocs.map(d => d.chunkIndex);
      console.log(`  🔄 Retrying ${chunksToProcess.length} failed chunks: [${chunksToProcess.join(', ')}]`);
      // Delete failed records so we can re-insert
      await chunksCollection.deleteMany({ summaryId: objectId, status: 'failed' });
    }
  } else if (resume) {
    // Skip chunks that already have completed records in insight_chunks
    const completedChunks = await chunksCollection.find({ summaryId: objectId, status: 'completed' }).project({ chunkIndex: 1 }).toArray();
    const completedSet = new Set(completedChunks.map(d => d.chunkIndex));

    // Also honor lastProcessedChunkIndex for legacy data (before insight_chunks existed)
    const lastIdx = typeof summary.lastProcessedChunkIndex === 'number' ? summary.lastProcessedChunkIndex : -1;

    for (let i = 0; i < totalChunks; i++) {
      if (completedSet.has(i)) continue;
      if (completedSet.size === 0 && i <= lastIdx) continue; // Legacy: skip chunks <= lastProcessedChunkIndex
      chunksToProcess.push(i);
    }
    if (chunksToProcess.length === 0) {
      console.log('  ✅ All chunks already completed');
      // Ensure status is 'completed'
      await db.collection('summaries').updateOne({ _id: objectId }, {
        $set: { keyInsightsV2Status: 'completed', updatedAt: new Date() }
      });
      return { ok: true };
    }
    console.log(`  ⏩ Resuming: ${chunksToProcess.length} chunks remaining (skipping ${totalChunks - chunksToProcess.length} completed)`);
  } else {
    // Process all chunks
    chunksToProcess = Array.from({ length: totalChunks }, (_, i) => i);
  }

  if (dryRun) {
    console.log(`  🔍 DRY RUN — would process ${chunksToProcess.length}/${totalChunks} chunks`);
    console.log(`     Chunks: [${chunksToProcess.join(', ')}]`);
    return { ok: true, dryRun: true };
  }

  // If starting fresh (not resume, not retryFailed), clear existing data
  if (!resume && !retryFailed) {
    await db.collection('summaries').updateOne({ _id: objectId }, {
      $set: {
        keyInsightsV2: [],
        keyInsightsV2Status: 'running',
        keyInsightsV2StartedAt: new Date(),
        transcriptCharLength: fullTranscript.length,
        totalChunks,
        processedChunks: 0,
        failedChunks: 0,
        skippedChunks: 0,
        coveragePercent: 0,
        insightsCount: 0,
        lastProcessedChunkIndex: -1,
        lastError: null,
        modelUsed: MODEL,
        updatedAt: new Date(),
      }
    });
    // Clear existing insight_chunks for this summary
    await chunksCollection.deleteMany({ summaryId: objectId });
  } else {
    // Set status to running
    await db.collection('summaries').updateOne({ _id: objectId }, {
      $set: {
        keyInsightsV2Status: 'running',
        totalChunks,
        transcriptCharLength: fullTranscript.length,
        modelUsed: MODEL,
        updatedAt: new Date(),
      }
    });
  }

  let processedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let lastError = null;
  let totalInsightsAdded = 0;

  for (const chunkIdx of chunksToProcess) {
    const c = chunks[chunkIdx];
    try {
      const result = await processChunk(anthropic, c.chunk, chunkIdx, totalChunks, c.charStart, c.charEnd, videoTitle, channel);

      if (result.error) {
        failedCount++;
        lastError = result.error;
        // Write failed chunk record
        await chunksCollection.updateOne(
          { summaryId: objectId, chunkIndex: chunkIdx },
          { $set: { summaryId: objectId, chunkIndex: chunkIdx, charStart: c.charStart, charEnd: c.charEnd, sourceExcerpt: '', generatedInsights: [], status: 'failed', error: result.error, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );
        console.log(`  ❌ Chunk ${chunkIdx + 1}/${totalChunks} FAILED: ${result.error}`);
      } else {
        const validInsights = result.insights.filter(ins => ins.sourceExcerpt && ins.sourceExcerpt.length >= 100);
        processedCount++;
        if (validInsights.length === 0) skippedCount++;
        totalInsightsAdded += validInsights.length;

        // Write chunk to insight_chunks collection
        await chunksCollection.updateOne(
          { summaryId: objectId, chunkIndex: chunkIdx },
          {
            $set: {
              summaryId: objectId,
              chunkIndex: chunkIdx,
              charStart: c.charStart,
              charEnd: c.charEnd,
              sourceExcerpt: c.chunk.substring(0, 500),
              generatedInsights: validInsights,
              status: validInsights.length > 0 ? 'completed' : 'skipped',
              error: null,
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true }
        );

        // Also push to summaries.keyInsightsV2 for backward compat
        if (validInsights.length > 0) {
          await db.collection('summaries').updateOne({ _id: objectId }, {
            $push: { keyInsightsV2: { $each: validInsights } },
          });
        }

        // Calculate coverage from all completed chunks
        const allCompleted = await chunksCollection.find({ summaryId: objectId, status: { $in: ['completed', 'skipped'] } }).project({ chunkIndex: 1 }).toArray();
        const coveredChars = allCompleted.reduce((sum, d) => {
          const ch = chunks[d.chunkIndex];
          return ch ? sum + (ch.charEnd - ch.charStart) : sum;
        }, 0);
        const coveragePercent = Math.min(100, Math.round((coveredChars / fullTranscript.length) * 100));

        // Get current total insights count
        const currentDoc = await db.collection('summaries').findOne({ _id: objectId }, { projection: { keyInsightsV2: 1 } });
        const insightsCount = Array.isArray(currentDoc?.keyInsightsV2) ? currentDoc.keyInsightsV2.length : 0;

        console.log(`  ✅ Chunk ${chunkIdx + 1}/${totalChunks} | coverage ${coveragePercent}% | insights ${insightsCount} (+${validInsights.length})`);
      }

      // Update summaries progress after each chunk
      const allChunkDocs = await chunksCollection.find({ summaryId: objectId }).toArray();
      const completedOrSkipped = allChunkDocs.filter(d => d.status === 'completed' || d.status === 'skipped').length;
      const failedDocs = allChunkDocs.filter(d => d.status === 'failed').length;
      const skippedDocs = allChunkDocs.filter(d => d.status === 'skipped').length;
      const coveredChars = allChunkDocs
        .filter(d => d.status === 'completed' || d.status === 'skipped')
        .reduce((sum, d) => { const ch = chunks[d.chunkIndex]; return ch ? sum + (ch.charEnd - ch.charStart) : sum; }, 0);
      const coveragePercent = Math.min(100, Math.round((coveredChars / fullTranscript.length) * 100));
      const currentDoc = await db.collection('summaries').findOne({ _id: objectId }, { projection: { keyInsightsV2: 1 } });
      const insightsCount = Array.isArray(currentDoc?.keyInsightsV2) ? currentDoc.keyInsightsV2.length : 0;

      await db.collection('summaries').updateOne({ _id: objectId }, {
        $set: {
          processedChunks: completedOrSkipped,
          failedChunks: failedDocs,
          skippedChunks: skippedDocs,
          lastProcessedChunkIndex: chunkIdx,
          coveragePercent,
          insightsCount,
          lastError: lastError,
          updatedAt: new Date(),
        }
      });
    } catch (err) {
      failedCount++;
      lastError = err.message;
      console.error(`  💥 Chunk ${chunkIdx + 1}/${totalChunks} EXCEPTION: ${err.message}`);
      await chunksCollection.updateOne(
        { summaryId: objectId, chunkIndex: chunkIdx },
        { $set: { summaryId: objectId, chunkIndex: chunkIdx, charStart: c.charStart, charEnd: c.charEnd, sourceExcerpt: '', generatedInsights: [], status: 'failed', error: err.message, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
    }
  }

  // Final status update
  const allChunkDocs = await chunksCollection.find({ summaryId: objectId }).toArray();
  const totalCompleted = allChunkDocs.filter(d => d.status === 'completed' || d.status === 'skipped').length;
  const totalFailed = allChunkDocs.filter(d => d.status === 'failed').length;
  const totalSkipped = allChunkDocs.filter(d => d.status === 'skipped').length;
  const coveredChars = allChunkDocs
    .filter(d => d.status === 'completed' || d.status === 'skipped')
    .reduce((sum, d) => { const ch = chunks[d.chunkIndex]; return ch ? sum + (ch.charEnd - ch.charStart) : sum; }, 0);
  const finalCoverage = Math.min(100, Math.round((coveredChars / fullTranscript.length) * 100));
  const finalDoc = await db.collection('summaries').findOne({ _id: objectId }, { projection: { keyInsightsV2: 1 } });
  const finalInsightsCount = Array.isArray(finalDoc?.keyInsightsV2) ? finalDoc.keyInsightsV2.length : 0;
  const finalStatus = totalFailed > 0 ? 'partial' : (totalCompleted >= totalChunks ? 'completed' : 'partial');

  await db.collection('summaries').updateOne({ _id: objectId }, {
    $set: {
      keyInsightsV2Status: finalStatus,
      keyInsightsV2CompletedAt: finalStatus === 'completed' ? new Date() : undefined,
      processedChunks: totalCompleted,
      failedChunks: totalFailed,
      skippedChunks: totalSkipped,
      coveragePercent: finalCoverage,
      insightsCount: finalInsightsCount,
      keyInsightsV2Count: finalInsightsCount,
      keyInsightsV2GeneratedAt: new Date().toISOString(),
      lastError: lastError,
      coverageReport: {
        transcriptCharLength: fullTranscript.length,
        totalChunks,
        processedChunks: totalCompleted,
        skippedChunks: totalSkipped,
        coveragePercent: finalCoverage,
        maxUncoveredGap: 0,
      },
      updatedAt: new Date(),
    }
  });

  console.log(`\n  📊 DONE: ${finalInsightsCount} insights | coverage ${finalCoverage}% | status ${finalStatus}`);
  if (totalFailed > 0) console.log(`  ⚠️  ${totalFailed} chunks failed — use --retry-failed to retry`);

  return { ok: true, status: finalStatus, insightsCount: finalInsightsCount };
}

// ── Find summaries to process ──────────────────────────────────────────────────

async function findSummaries(db) {
  const limit = args.limit ? parseInt(args.limit, 10) : 0;

  if (args.summaryId) {
    return [args.summaryId];
  }

  let filter = {};

  if (args['all-partial']) {
    filter = { keyInsightsV2Status: { $in: ['partial', 'failed', 'queued'] } };
  } else if (args['all-with-transcript']) {
    // Find summaries with youtube_id OR article content (expanded to include article sources)
    filter = {
      $or: [
        { youtube_id: { $exists: true, $ne: null } },
        { 'rawExpertInsight.youtube_id': { $exists: true, $ne: null } },
        { article: { $exists: true, $ne: null, $type: 'string' } },
        { body: { $exists: true, $ne: null, $type: 'string' } },
      ]
    };
  } else if (args['all-with-article-content']) {
    // Only non-YouTube sources that have article/body text
    filter = {
      youtube_id: { $exists: false },
      'rawExpertInsight.youtube_id': { $exists: false },
      $or: [
        { article: { $exists: true, $ne: null, $type: 'string' } },
        { body: { $exists: true, $ne: null, $type: 'string' } },
      ],
    };
  } else {
    console.error('❌ Must specify --summaryId, --all-partial, --all-with-transcript, or --all-with-article-content');
    process.exit(1);
  }

  const cursor = db.collection('summaries').find(filter, { projection: { _id: 1, title: 1, keyInsightsV2Status: 1 } });
  if (limit > 0) cursor.limit(limit);
  const docs = await cursor.toArray();
  return docs.map(d => d._id.toString());
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  console.log('🔗 Connected to MongoDB');

  const db = client.db(DB_NAME);
  await ensureInsightChunksCollection(db);

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const summaryIds = await findSummaries(db);

  console.log(`\n📋 ${summaryIds.length} summaries to process`);

  if (summaryIds.length === 0) {
    console.log('Nothing to do.');
    await client.close();
    return;
  }

  const options = {
    resume: args.resume || false,
    retryFailed: args['retry-failed'] || false,
    dryRun: args['dry-run'] || false,
  };

  let processed = 0;
  let failed = 0;

  for (const id of summaryIds) {
    try {
      const result = await processSummary(db, anthropic, id, options);
      if (result.ok) processed++;
      else failed++;
    } catch (err) {
      console.error(`💥 Error processing ${id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🏁 COMPLETE: ${processed} succeeded, ${failed} failed out of ${summaryIds.length}`);

  await client.close();
}

main().catch(e => { console.error('💥 Fatal:', e); process.exit(1); });
