/**
 * batch-enrich.js
 * Batch enrichment worker for expert_insights items
 * Usage: node scripts/batch-enrich.js [--dry-run] [--limit N]
 */

const { MongoClient, ObjectId } = require('mongodb');
const { YoutubeTranscript } = require('youtube-transcript');
const Anthropic = require('@anthropic-ai/sdk').default;

const MONGO_URI = 'mongodb+srv://jgtruestock:ly94FxlZoad8PVWm@cluster0.lh6rsp1.mongodb.net/';
const { readFileSync } = require('fs');
const _envContent = readFileSync('.env.local', 'utf8');
const ANTHROPIC_KEY = _envContent.match(/ANTHROPIC_API_KEY=(.*)/)?.[1]?.trim() || '';
const MODEL = 'claude-sonnet-4-5';
const CHUNK_SIZE = 7000;
const MAX_CHARS_FULL = 80000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? parseInt(args[limitArg + 1]) : 20;

async function enrichItem(db, doc) {
  const id = doc._id.toString();
  const youtubeId = doc.youtube_id;
  const title = doc.video_title || doc.title || '';
  const channel = doc.channel || '';
  const now = new Date();

  console.log(`\n[${id}] Processing: "${title.slice(0,60)}" (${youtubeId})`);

  if (!youtubeId || youtubeId.startsWith('manual_')) {
    console.log(`  ↳ Skipping: invalid youtube_id`);
    return { id, status: 'skipped', reason: 'invalid_youtube_id' };
  }

  // Investment relevance check
  const combined = (title + ' ' + channel).toLowerCase();
  const irrelevant = ['recipe', 'cooking', 'fitness', 'makeup', 'fashion', 'celebrity', 'anime'];
  if (irrelevant.some(k => combined.includes(k))) {
    console.log(`  ↳ Skipping: not investment relevant`);
    if (!dryRun) {
      await db.collection('expert_insights').updateOne(
        { _id: doc._id },
        { $set: { enrichmentStatus: 'irrelevant', skippedReason: 'not_investment_related', enrichedAt: now } }
      );
    }
    return { id, status: 'skipped', reason: 'irrelevant' };
  }

  // Check if transcript already stored in video_transcripts
  let fullTranscript = null;
  const existing = await db.collection('video_transcripts').findOne({ youtube_id: youtubeId });
  if (existing && existing.fullTranscript) {
    console.log(`  ↳ Using cached transcript (${existing.transcriptLength} chars)`);
    fullTranscript = existing.fullTranscript;
  }

  // Fetch transcript if needed
  if (!fullTranscript) {
    console.log(`  ↳ Fetching transcript...`);
    let transcriptLines = [];
    try {
      transcriptLines = await YoutubeTranscript.fetchTranscript(youtubeId, { lang: 'en' });
    } catch {
      try {
        transcriptLines = await YoutubeTranscript.fetchTranscript(youtubeId);
      } catch (e2) {
        console.log(`  ↳ Transcript unavailable: ${e2.message?.slice(0,80)}`);
        if (!dryRun) {
          await db.collection('expert_insights').updateOne(
            { _id: doc._id },
            { $set: { enrichmentStatus: 'transcript_unavailable', enrichmentError: String(e2), enrichedAt: now } }
          );
        }
        return { id, status: 'transcript_unavailable', reason: e2.message };
      }
    }

    fullTranscript = transcriptLines.map(l => l.text).join(' ');
    const transcriptLength = fullTranscript.length;
    const transcriptSegments = transcriptLines.length;

    // Short content gate
    const titleLower = title.toLowerCase();
    const isTitleShort = /\b(shorts?|clip|highlight|trailer|teaser)\b/.test(titleLower);
    const isUrlShort = (doc.source_url || '').includes('/shorts/');
    const isTooShort = isUrlShort || isTitleShort || transcriptSegments < 50 || transcriptLength < 3000;

    if (isTooShort) {
      console.log(`  ↳ Transcript too short: ${transcriptLength} chars, ${transcriptSegments} segments`);
      if (!dryRun) {
        await db.collection('expert_insights').updateOne(
          { _id: doc._id },
          { $set: { enrichmentStatus: 'transcript_too_short', transcriptLength, transcriptSegments, enrichedAt: now } }
        );
      }
      return { id, status: 'transcript_too_short', transcriptLength };
    }

    // Save to video_transcripts
    if (!dryRun) {
      const fetchedAt = now;
      const expiresAt = new Date(fetchedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      await db.collection('video_transcripts').updateOne(
        { youtube_id: youtubeId },
        { $set: { youtube_id: youtubeId, video_title: title, channel, fullTranscript, transcriptLength, transcriptSegments, fetchedAt, expiresAt, createdAt: fetchedAt, updatedAt: fetchedAt } },
        { upsert: true }
      );
    }
    console.log(`  ↳ Transcript fetched: ${fullTranscript.length} chars`);
  }

  const transcriptLength = fullTranscript.length;
  const transcriptSample = fullTranscript.slice(0, 600);

  if (dryRun) {
    console.log(`  ↳ DRY RUN: would run LLM enrichment`);
    return { id, status: 'dry_run_ok', transcriptLength };
  }

  // LLM: Extract key insights in chunks
  console.log(`  ↳ Running LLM key insight extraction...`);
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const totalChunks = Math.ceil(transcriptLength / CHUNK_SIZE);
  const isPartial = transcriptLength > MAX_CHARS_FULL;
  const maxChunks = isPartial ? Math.ceil(MAX_CHARS_FULL / CHUNK_SIZE) : totalChunks;
  const chunks = [];
  for (let i = 0; i < fullTranscript.length && chunks.length < maxChunks; i += CHUNK_SIZE) {
    chunks.push(fullTranscript.slice(i, i + CHUNK_SIZE));
  }

  const allPartialInsights = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const msg = await anthropic.messages.create({
        model: MODEL, max_tokens: 600,
        system: '你是財經分析助理，只回傳 JSON array，不加解釋文字。',
        messages: [{ role: 'user', content: `這是逐字稿第 ${i+1}/${chunks.length} 段：\n${chunks[i]}\n\n請從這段抽出 2-4 條投資/商業/產業相關的具體觀點。\n去除：[music]、like/subscribe、寒暄、空泛句。\n只回傳 JSON array：["觀點1", "觀點2", ...]` }]
      });
      const raw = msg.content[0].text.trim();
      const parsed = JSON.parse(raw.startsWith('[') ? raw : raw.replace(/^```json\n?/, '').replace(/```$/, ''));
      allPartialInsights.push(...parsed.filter(k => typeof k === 'string' && k.length > 20));
    } catch { /* skip failed chunk */ }
  }

  let keyInsights = [];
  if (allPartialInsights.length > 0) {
    try {
      const summaryMsg = await anthropic.messages.create({
        model: MODEL, max_tokens: 800,
        system: '你是財經分析助理，只回傳 JSON array，不加解釋文字。',
        messages: [{ role: 'user', content: `以下是從逐字稿各段抽出的觀點（共 ${allPartialInsights.length} 條）：\n${allPartialInsights.map((k,i) => `${i+1}. ${k}`).join('\n')}\n\n請整合成 6-8 條最重要的 final key_insights。\n去除重複、空泛、非投資相關的內容。\n只回傳 JSON array：["final insight 1", ...]` }]
      });
      const raw = summaryMsg.content[0].text.trim();
      keyInsights = JSON.parse(raw.startsWith('[') ? raw : raw.replace(/^```json\n?/, '').replace(/```$/, ''));
      keyInsights = keyInsights.filter(k => typeof k === 'string' && k.length > 20);
    } catch {
      keyInsights = allPartialInsights.slice(0, 8);
    }
  }

  if (keyInsights.length === 0) {
    await db.collection('expert_insights').updateOne(
      { _id: doc._id },
      { $set: { enrichmentStatus: 'error', enrichmentError: 'no_insights_extracted', enrichedAt: now } }
    );
    return { id, status: 'error', reason: 'no_insights_extracted' };
  }

  // Write back
  const transcriptRef = `video_transcripts/${youtubeId}`;
  const transcriptExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.collection('expert_insights').updateOne(
    { _id: doc._id },
    {
      $set: {
        key_insights: keyInsights,
        transcript_sample: transcriptSample,
        transcriptRef,
        transcriptStored: true,
        transcriptFetchedAt: now,
        transcriptLength,
        transcriptSegments: Math.ceil(transcriptLength / 100),
        transcriptExpiresAt: transcriptExpiresAt.toISOString(),
        enrichmentStatus: 'enriched',
        enrichedAt: now,
        enrichmentModel: MODEL,
        sourceQuality: 'youtube_transcript',
        insightExtractionMode: 'chunked_full_transcript',
        chunksProcessed: chunks.length,
        totalChunks,
        chunkSize: CHUNK_SIZE,
        transcriptCoverageRatio: Math.min(1, chunks.length / totalChunks),
        coverageMode: isPartial ? 'partial_with_warning' : 'full',
        keyInsightsCount: keyInsights.length,
        enrichmentError: null,
      }
    }
  );

  console.log(`  ↳ ✅ Done: ${keyInsights.length} key insights extracted`);
  return { id, status: 'enriched', keyInsightsCount: keyInsights.length };
}

async function main() {
  console.log(`\n🚀 Batch Enrich Worker — ${dryRun ? 'DRY RUN' : 'LIVE'} — limit: ${limit}`);
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('13f-tracker');

  // Find items needing enrich
  const items = await db.collection('expert_insights').find({
    youtube_id: { $exists: true, $ne: null, $nin: ['', 'N/A'] },
    $or: [
      { enrichmentStatus: { $exists: false } },
      { enrichmentStatus: { $in: ['needs_transcript_or_insights', 'ready', null, ''] } },
    ],
    status: { $nin: ['promoted'] }
  }).sort({ insertedAt: -1 }).limit(limit).toArray();

  console.log(`Found ${items.length} items to process\n`);

  const results = { enriched: 0, skipped: 0, too_short: 0, unavailable: 0, error: 0, dry_run: 0 };
  
  for (const item of items) {
    try {
      const result = await enrichItem(db, item);
      if (result.status === 'enriched') results.enriched++;
      else if (result.status === 'skipped') results.skipped++;
      else if (result.status === 'transcript_too_short') results.too_short++;
      else if (result.status === 'transcript_unavailable') results.unavailable++;
      else if (result.status === 'dry_run_ok') results.dry_run++;
      else results.error++;
    } catch (e) {
      console.error(`  ↳ ❌ Unexpected error: ${e.message}`);
      results.error++;
    }
    // Small delay between items
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n📊 Results:', results);
  await client.close();
}

main().catch(console.error);
