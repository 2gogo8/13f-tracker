#!/usr/bin/env node
/**
 * Multi-Source Content Worker — Process queued expert_insights.
 *
 * Handles the full pipeline: fetch transcript → V2 key insights → draft generation.
 * Status flow: queued → fetching → enriching → ready
 *
 * Usage:
 *   node scripts/worker.js --once              # process one round (default)
 *   node scripts/worker.js --once --limit 5    # max 5 items
 *   node scripts/worker.js --interval 30       # continuous, check every 30s
 *   node scripts/worker.js --dry-run           # show plan only
 *   node scripts/worker.js --retry-failed      # reprocess failed items
 *   node scripts/worker.js --id <id>           # process specific document
 *   node scripts/worker.js --help
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
    once:           { type: 'boolean', default: true },
    interval:       { type: 'string' },
    limit:          { type: 'string' },
    'dry-run':      { type: 'boolean', default: false },
    execute:        { type: 'boolean', default: false },
    'retry-failed': { type: 'boolean', default: false },
    id:             { type: 'string' },
    help:           { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Multi-Source Content Worker
===========================
Processes queued expert_insights through the full pipeline:
  fetch transcript → V2 key insights → draft generation

Options:
  --once              Process one round then stop (default)
  --interval <secs>   Continuous mode, check every N seconds
  --limit <n>         Max items per round
  --dry-run           Show plan, don't process
  --retry-failed      Reprocess status: "failed" items
  --id <id>           Process specific document by _id
  --help              Show this help
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

const DB_NAME = '13f-tracker';
const CHUNK_SIZE = 4500;
const MODEL = 'claude-sonnet-4-5';

// ── PUBLISH_BLOCKERS ───────────────────────────────────────────────────────────

const PUBLISH_BLOCKERS = [
  '【JG 觀點待補】', '《JG 觀點待補》',
  '請從上面候選方向', '候選方向中選一個', '改寫成正式 JG 判斷',
  'reviewer note', 'internal instruction', 'TODO for JG',
  '請 JG', '後台操作指令', 'TODO',
];

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

// ── Fetch transcript ───────────────────────────────────────────────────────────

async function fetchTranscript(db, doc) {
  const videoId = doc.sourceId || doc.youtube_id;
  if (!videoId) return null;

  // 1. Check existing transcript in video_transcripts
  const existing = await db.collection('video_transcripts').findOne({ youtube_id: videoId });
  if (existing?.fullTranscript) {
    console.log(`  📚 Found existing transcript (${existing.fullTranscript.length.toLocaleString()} chars)`);
    return existing.fullTranscript;
  }

  // 2. Fetch from YouTube
  console.log(`  📥 Fetching transcript from YouTube for ${videoId}...`);
  try {
    const { YoutubeTranscript } = await import('youtube-transcript');
    let lines;
    try { lines = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' }); }
    catch { lines = await YoutubeTranscript.fetchTranscript(videoId); }

    if (lines?.length) {
      const fullTranscript = lines.map(l => l.text).join(' ');
      const now = new Date();

      // Store in video_transcripts for cache
      await db.collection('video_transcripts').updateOne(
        { youtube_id: videoId },
        {
          $set: {
            youtube_id: videoId,
            fullTranscript,
            transcriptLength: fullTranscript.length,
            transcriptSource: 'youtube-transcript',
            fetchedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          $setOnInsert: { createdAt: now.toISOString() },
        },
        { upsert: true }
      );

      console.log(`  ✅ Transcript fetched (${fullTranscript.length.toLocaleString()} chars)`);
      return fullTranscript;
    }
  } catch (err) {
    console.error(`  ❌ Transcript fetch failed: ${err.message}`);
  }

  return null;
}

// ── V2 Key Insights extraction ─────────────────────────────────────────────────

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
  "zhEvidenceSummary": "繁體中文，1-2句，說明哪些具體數據或陳述支持這條洞察",
  "sourceExcerpt": "the exact transcript excerpt supporting this insight, 300-800 chars, MUST be verbatim",
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
  "suggestedArticleAngle": "繁體中文，1-2 句",
  "whyItMatters": "繁體中文，1-2 句，為什麼這件事對投資人重要"
}

Rules:
- sourceExcerpt MUST be verbatim from the transcript, 300-800 chars
- Only extract insights with importanceScore >= 30
- If no investment-relevant content, return []
- Return ONLY a JSON array`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawText = msg.content[0].text.trim();
  if (msg.stop_reason === 'max_tokens') {
    return { insights: [], error: 'max_tokens_truncated' };
  }

  const cleanText = cleanLLMJson(rawText);
  try {
    const parsed = JSON.parse(cleanText);
    if (!Array.isArray(parsed)) return { insights: [], error: 'not_array' };

    const valid = parsed.filter(item =>
      item.insightTitle && item.sourceExcerpt &&
      typeof item.sourceExcerpt === 'string' && item.sourceExcerpt.length >= 100 &&
      typeof item.importanceScore === 'number'
    );
    return { insights: valid, error: null };
  } catch (err) {
    return { insights: [], error: `json_parse_failed: ${err.message}` };
  }
}

async function runV2KeyInsights(db, anthropic, doc, transcript) {
  const chunks = chunkTranscript(transcript);
  const totalChunks = chunks.length;
  const videoTitle = doc.sourceTitle || doc.video_title || doc.title || '';
  const channel = doc.sourceName || doc.channel || '';

  console.log(`  🔬 V2 Key Insights: ${transcript.length.toLocaleString()} chars | ${totalChunks} chunks`);

  const allInsights = [];
  let failedCount = 0;

  for (let i = 0; i < totalChunks; i++) {
    const c = chunks[i];
    try {
      const result = await processChunk(anthropic, c.chunk, i, totalChunks, c.charStart, c.charEnd, videoTitle, channel);
      if (result.error) {
        failedCount++;
        console.log(`  ❌ Chunk ${i + 1}/${totalChunks}: ${result.error}`);
      } else {
        allInsights.push(...result.insights);
        console.log(`  ✅ Chunk ${i + 1}/${totalChunks}: +${result.insights.length} insights`);
      }
    } catch (err) {
      failedCount++;
      console.error(`  💥 Chunk ${i + 1}/${totalChunks}: ${err.message}`);
    }
  }

  // Update document with V2 results
  const v2Status = failedCount === 0 && allInsights.length > 0 ? 'completed'
    : failedCount > 0 && allInsights.length > 0 ? 'partial'
    : 'failed';

  await db.collection('expert_insights').updateOne(
    { _id: doc._id },
    {
      $set: {
        keyInsightsV2: allInsights,
        keyInsightsV2Status: v2Status,
        keyInsightsV2Count: allInsights.length,
        insightsCount: allInsights.length,
        keyInsightsV2GeneratedAt: new Date().toISOString(),
        totalChunks,
        transcriptCharLength: transcript.length,
        coveragePercent: failedCount === 0 ? 100 : Math.round(((totalChunks - failedCount) / totalChunks) * 100),
        modelUsed: MODEL,
        updatedAt: new Date(),
      },
    }
  );

  console.log(`  📊 V2 result: ${allInsights.length} insights | status: ${v2Status}`);
  return { ok: v2Status !== 'failed', status: v2Status, insightsCount: allInsights.length };
}

// ── Draft generation ───────────────────────────────────────────────────────────

async function generateDraft(db, anthropic, doc) {
  const title = doc.sourceTitle || doc.video_title || doc.title || doc.topic || '';
  const channel = doc.sourceName || doc.channel || '';
  const sourceUrl = doc.sourceUrl || doc.source_url || '';
  const sourceDate = doc.sourcePublishedAt || doc.publish_date || new Date().toISOString().split('T')[0];
  const ticker = doc.topic_ticker || doc.ticker || doc.topic || '';

  // Get V2 insights for prompt
  const freshDoc = await db.collection('expert_insights').findOne({ _id: doc._id });
  const v2Insights = freshDoc?.keyInsightsV2 || [];

  if (v2Insights.length === 0) {
    console.log(`  ⚠️ No V2 insights available for draft`);
    return { ok: false, error: 'no_v2_insights' };
  }

  const kiText = v2Insights.slice(0, 15).map((k, i) =>
    `${i + 1}. ${k.zhTitle || k.insightTitle}: ${k.zhSummary || ''}`
  ).join('\n');

  // Fetch recent published articles for context
  const recentArticles = await db.collection('summaries')
    .find({ alphaReady: true }, { projection: { _id: 1, jgTitle: 1, title: 1, topic: 1, tags: 1, publishedAt: 1 } })
    .sort({ publishedAt: -1 }).limit(5).toArray();

  const systemPrompt = `你是一個財經研究助理。你必須只回傳一個 valid JSON object，不加任何解釋文字、markdown code block、或前後文。`;
  const userPrompt = `素材資訊：
- 標題：${title}
- 頻道：${channel || '（未知）'}
- 日期：${sourceDate || '（未知）'}
- 主題標的：${ticker}
- 來源連結：${sourceUrl || '（未提供）'}

專家關鍵觀點（V2 extracted）：
${kiText}

最近已上架文章（供聯想參考）：
${recentArticles.length > 0
    ? recentArticles.map(a => `- ${a.jgTitle || a.title || '未知'} | ${a.topic || '—'} | ${(a.tags || []).join(', ') || '—'}`).join('\n')
    : '（無）'}

---

請生成以下格式的 JSON object，只回傳 JSON，不加任何額外文字：

{
  "suggestedTitle": "建議標題（繁體中文）",
  "articleDraft": "完整文章草稿（markdown 格式）",
  "normalizedMarketThemes": [],
  "selectedMarketDirection": null,
  "marketDirectionFitScore": 0,
  "marketDirectionReason": "",
  "relatedRecentArticles": [],
  "jgAngleCandidates": []
}

articleDraft 格式（固定格式，markdown，用 \\n 換行）：
# {標題}

## 一、這則素材在講什麼
（根據素材整理這位專家說了什麼，只整理，不評論）

## 二、為什麼這件事對投資人重要
（從市場角度說明這則訊息的意義，不給買賣建議）

## 三、投資判斷摘要
（中性分析語氣，不要寫「JG 認為」「買賣建議」）

## 四、接下來觀察什麼
（列出 2-3 個後續值得追蹤的觀察指標或事件）

禁止出現：「JG 認為」「我的觀點是」買賣建議、影片口吻`;

  console.log(`  ✍️ Generating draft...`);

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawLLMText = msg.content[0].text.trim();
  let parsed;
  try {
    parsed = JSON.parse(cleanLLMJson(rawLLMText));
  } catch {
    return { ok: false, error: 'LLM JSON parse failed' };
  }

  const draftTitle = parsed.suggestedTitle || title;
  const articleDraft = parsed.articleDraft || '';
  const draftLines = articleDraft.split('\n');
  let bodyStart = 0;
  for (let i = 0; i < draftLines.length; i++) {
    if (draftLines[i].startsWith('# ')) { bodyStart = i + 1; break; }
  }
  const draftBody = draftLines.slice(bodyStart).join('\n').trim();
  const blocked = PUBLISH_BLOCKERS.some(b => draftBody.includes(b));
  const draftStatus = blocked ? 'draft_needs_review' : 'draft_ready';

  await db.collection('expert_insights').updateOne(
    { _id: doc._id },
    {
      $set: {
        articleDraft: draftBody,
        cleanArticleDraft: draftBody,
        draftTitle,
        jgTitle: draftTitle,
        draftStatus,
        draftGeneratedAt: new Date().toISOString(),
        draftModel: MODEL,
        normalizedMarketThemes: parsed.normalizedMarketThemes ?? [],
        jgAngleCandidates: parsed.jgAngleCandidates ?? [],
        updatedAt: new Date(),
      },
    }
  );

  console.log(`  ✅ Draft generated: ${draftStatus}${blocked ? ' (needs review)' : ''}`);
  return { ok: true, draftStatus, blocked };
}

// ── Process a single expert_insight ────────────────────────────────────────────

async function processItem(db, anthropic, doc, dryRun) {
  const title = doc.sourceTitle || doc.video_title || doc.title || '(untitled)';
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📄 ${title}`);
  console.log(`   ID: ${doc._id} | sourceType: ${doc.sourceType || 'unknown'}`);

  if (dryRun) {
    console.log(`  🔍 DRY RUN — would process this item`);
    return { ok: true, dryRun: true };
  }

  // 1. Check entry gate — missing required fields
  const missingFields = [];
  if (!doc.sourceType) missingFields.push('sourceType');
  if (!doc.sourceTitle && !doc.video_title && !doc.title) missingFields.push('sourceTitle');
  if (!doc.sourceName && !doc.channel) missingFields.push('sourceName');
  if (!doc.sourcePublishedAt && !doc.publish_date) missingFields.push('sourcePublishedAt');

  if (missingFields.length > 0) {
    console.log(`  ⚠️ Missing fields: ${missingFields.join(', ')} → needs_manual`);
    await db.collection('expert_insights').updateOne(
      { _id: doc._id },
      { $set: { status: 'needs_manual', missingField: missingFields[0], updatedAt: new Date() } }
    );
    return { ok: false, status: 'needs_manual' };
  }

  // 2. Fetch transcript
  await db.collection('expert_insights').updateOne(
    { _id: doc._id },
    { $set: { status: 'fetching', updatedAt: new Date() } }
  );

  const transcript = await fetchTranscript(db, doc);
  if (!transcript) {
    console.log(`  ❌ No transcript available → failed`);
    await db.collection('expert_insights').updateOne(
      { _id: doc._id },
      { $set: { status: 'failed', errorReason: 'transcript_fetch_failed', updatedAt: new Date() } }
    );
    return { ok: false, status: 'failed' };
  }

  if (transcript.length < 3000) {
    console.log(`  ⚠️ Transcript too short (${transcript.length} chars) → skipped`);
    await db.collection('expert_insights').updateOne(
      { _id: doc._id },
      { $set: { status: 'skipped', reason: 'too_short', rawText: transcript, rawTextType: 'transcript', updatedAt: new Date() } }
    );
    return { ok: false, status: 'skipped' };
  }

  // Write rawText + rawContentOriginal
  const rawContentFields = {
    rawText: transcript,
    rawTextType: 'transcript',
    rawContentOriginal: transcript,
    rawContentStatus: 'complete',
    updatedAt: new Date(),
  };

  // Generate rawContentZh (Chinese summary) before V2
  try {
    console.log(`  🇹🇼 Generating rawContentZh...`);
    const zhResponse = await anthropic.messages.create({
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

標題：${doc.sourceTitle || doc.video_title || doc.title || '(無標題)'}
來源：${doc.sourceName || doc.channel || '(未知)'}

原文：
${transcript.slice(0, 30000)}`,
      }],
    });
    rawContentFields.rawContentZh = zhResponse.content[0].text.trim();
    console.log(`  ✅ rawContentZh generated (${rawContentFields.rawContentZh.length} chars)`);
  } catch (err) {
    console.log(`  ⚠️ rawContentZh generation failed: ${err.message} (continuing without zh)`);
  }

  await db.collection('expert_insights').updateOne(
    { _id: doc._id },
    { $set: rawContentFields }
  );

  // 3. V2 Key Insights
  await db.collection('expert_insights').updateOne(
    { _id: doc._id },
    { $set: { status: 'enriching', updatedAt: new Date() } }
  );

  const v2Result = await runV2KeyInsights(db, anthropic, doc, transcript);
  if (!v2Result.ok) {
    console.log(`  ❌ V2 failed → status: failed`);
    await db.collection('expert_insights').updateOne(
      { _id: doc._id },
      { $set: { status: 'failed', errorReason: 'v2_failed', updatedAt: new Date() } }
    );
    return { ok: false, status: 'failed' };
  }

  // 4. Draft generation
  const draftResult = await generateDraft(db, anthropic, doc);
  if (!draftResult.ok) {
    console.log(`  ⚠️ Draft failed, but V2 succeeded → status: failed (draft)`);
    await db.collection('expert_insights').updateOne(
      { _id: doc._id },
      { $set: { status: 'failed', errorReason: 'draft_failed', updatedAt: new Date() } }
    );
    return { ok: false, status: 'failed' };
  }

  // 5. All done → ready
  await db.collection('expert_insights').updateOne(
    { _id: doc._id },
    { $set: { status: 'ready', enrichmentStatus: 'enriched', completedAt: new Date().toISOString(), updatedAt: new Date() } }
  );

  console.log(`  🎉 Complete → status: ready`);
  return { ok: true, status: 'ready' };
}

// ── Find items to process ──────────────────────────────────────────────────────

async function findItems(db) {
  const limit = args.limit ? parseInt(args.limit, 10) : 0;
  let filter;

  if (args.id) {
    let objectId;
    try { objectId = new ObjectId(args.id); } catch {
      console.error(`❌ Invalid ObjectId: ${args.id}`);
      process.exit(1);
    }
    return [await db.collection('expert_insights').findOne({ _id: objectId })].filter(Boolean);
  }

  if (args['retry-failed']) {
    filter = { status: 'failed' };
  } else {
    filter = { status: 'queued' };
  }

  const cursor = db.collection('expert_insights')
    .find(filter)
    .sort({ createdAt: -1 });

  if (limit > 0) cursor.limit(limit);
  return cursor.toArray();
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function runOnce(db, anthropic) {
  const items = await findItems(db);
  const dryRun = args['dry-run'] || false;

  console.log(`\n📋 ${items.length} items to process${dryRun ? ' (DRY RUN)' : ''}`);

  if (items.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const result = await processItem(db, anthropic, item, dryRun);
      if (result.ok) succeeded++;
      else failed++;
    } catch (err) {
      console.error(`💥 Error processing ${item._id}: ${err.message}`);
      failed++;
      // Mark as failed
      if (!dryRun) {
        await db.collection('expert_insights').updateOne(
          { _id: item._id },
          { $set: { status: 'failed', errorReason: `exception: ${err.message}`, updatedAt: new Date() } }
        );
      }
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🏁 COMPLETE: ${succeeded} succeeded, ${failed} failed out of ${items.length}`);
}

async function main() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  console.log('🔗 Connected to MongoDB');

  const db = client.db(DB_NAME);
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const interval = args.interval ? parseInt(args.interval, 10) : null;

  if (interval) {
    console.log(`🔄 Continuous mode: checking every ${interval}s`);
    while (true) {
      await runOnce(db, anthropic);
      console.log(`\n⏳ Waiting ${interval}s...`);
      await new Promise(r => setTimeout(r, interval * 1000));
    }
  } else {
    await runOnce(db, anthropic);
    await client.close();
  }
}

main().catch(e => { console.error('💥 Fatal:', e); process.exit(1); });
