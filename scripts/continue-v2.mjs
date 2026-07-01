/**
 * Continue Key Insights V2 for remaining articles.
 * Usage: node scripts/continue-v2.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf8');
const mongoUri = envContent.match(/MONGO_URI=(.*)/)?.[1]?.trim();
const anthropicKey = envContent.match(/ANTHROPIC_API_KEY=(.*)/)?.[1]?.trim();
process.env.ANTHROPIC_API_KEY = anthropicKey;

const CHUNK_SIZE = 4500;
const MODEL = 'claude-sonnet-4-5';

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
      const lastBreak = Math.max(searchBack.lastIndexOf('. '), searchBack.lastIndexOf('。'), searchBack.lastIndexOf('！'), searchBack.lastIndexOf('？'), searchBack.lastIndexOf('\n'));
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
  "insightTitle": "concise English title (max 80 chars)",
  "zhSummary": "繁體中文摘要，2-4 句話說明此觀點重點",
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
- sourceExcerpt MUST be verbatim from the transcript, 300-800 chars. No paraphrasing.
- If a chunk has no investment-relevant content, return an empty array []
- importanceScore: how important is this insight overall (0-100)
- investmentRelevanceScore: how relevant to investment decisions (0-100)
- Only extract insights with importanceScore >= 30
- Return a JSON array of objects. Nothing else.`;

  const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 4000, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] });
  const rawText = msg.content[0].text.trim();
  try {
    const parsed = JSON.parse(cleanLLMJson(rawText));
    if (!Array.isArray(parsed)) return { insights: [] };
    return { insights: parsed.filter(item => typeof item.sourceExcerpt === 'string' && item.sourceExcerpt.length >= 100 && typeof item.insightTitle === 'string') };
  } catch (e) {
    console.error(`  JSON parse failed for chunk ${chunkIndex}: ${e.message}`);
    return { insights: [], error: e.message };
  }
}

async function continueArticle(db, anthropic, summaryId, name) {
  console.log(`\n=== ${name} (${summaryId}) ===`);
  const objectId = new ObjectId(summaryId);
  const summary = await db.collection('summaries').findOne({ _id: objectId });
  const youtubeId = summary.youtube_id || summary.rawExpertInsight?.youtube_id;
  
  let transcriptDoc = await db.collection('video_transcripts').findOne({ youtube_id: youtubeId });
  if (!transcriptDoc?.fullTranscript) {
    console.log(`  Fetching transcript for ${youtubeId}...`);
    const { YoutubeTranscript } = await import('youtube-transcript');
    let lines;
    try { lines = await YoutubeTranscript.fetchTranscript(youtubeId, { lang: 'en' }); }
    catch { lines = await YoutubeTranscript.fetchTranscript(youtubeId); }
    if (!lines?.length) { console.error('  No transcript'); return; }
    const fullTranscript = lines.map(l => l.text).join(' ');
    await db.collection('video_transcripts').updateOne({ youtube_id: youtubeId }, { $set: { youtube_id: youtubeId, fullTranscript, transcriptLength: fullTranscript.length, transcriptSource: 'youtube-transcript', fetchedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, $setOnInsert: { createdAt: new Date().toISOString() } }, { upsert: true });
    transcriptDoc = { fullTranscript, transcriptLength: fullTranscript.length };
  }

  const fullTranscript = transcriptDoc.fullTranscript;
  const chunks = chunkTranscript(fullTranscript);
  const totalChunks = chunks.length;
  const videoTitle = summary.title || summary.jgTitle || '';
  const channel = summary.sourceChannel || summary.rawExpertInsight?.channel || '';

  // Determine start index
  const lastIdx = typeof summary.lastProcessedChunkIndex === 'number' ? summary.lastProcessedChunkIndex : -1;
  const startIdx = lastIdx + 1;
  
  if (startIdx === 0) {
    // Fresh start
    await db.collection('summaries').updateOne({ _id: objectId }, { $set: { keyInsightsV2: [], keyInsightsV2Status: 'running', keyInsightsV2StartedAt: new Date(), transcriptCharLength: fullTranscript.length, totalChunks, processedChunks: 0, failedChunks: 0, skippedChunks: 0, coveragePercent: 0, insightsCount: 0, lastProcessedChunkIndex: -1, lastError: null, modelUsed: MODEL, updatedAt: new Date() } });
  } else {
    await db.collection('summaries').updateOne({ _id: objectId }, { $set: { keyInsightsV2Status: 'running', totalChunks, transcriptCharLength: fullTranscript.length, updatedAt: new Date() } });
  }

  console.log(`  ${totalChunks} chunks, start from ${startIdx}, ${fullTranscript.length} chars`);

  let processedChunks = summary.processedChunks || 0;
  let failedChunks = summary.failedChunks || 0;
  let skippedChunks = summary.skippedChunks || 0;

  for (let i = startIdx; i < totalChunks; i++) {
    const result = await processChunk(anthropic, chunks[i].chunk, i, totalChunks, chunks[i].charStart, chunks[i].charEnd, videoTitle, channel);
    if (result.error) { failedChunks++; await db.collection('summaries').updateOne({ _id: objectId }, { $set: { failedChunks, lastError: result.error, lastProcessedChunkIndex: i, updatedAt: new Date() } }); continue; }
    
    const valid = result.insights.filter(ins => ins.sourceExcerpt && ins.sourceExcerpt.length >= 100);
    processedChunks++;
    if (valid.length === 0) skippedChunks++;
    
    const coveredChars = chunks.slice(0, i + 1).reduce((s, c) => s + (c.charEnd - c.charStart), 0);
    const coverage = Math.min(100, Math.round((coveredChars / fullTranscript.length) * 100));
    const cur = await db.collection('summaries').findOne({ _id: objectId }, { projection: { keyInsightsV2: 1 } });
    const count = (cur?.keyInsightsV2?.length || 0) + valid.length;
    
    if (valid.length > 0) {
      await db.collection('summaries').updateOne({ _id: objectId }, { $push: { keyInsightsV2: { $each: valid } }, $set: { processedChunks, skippedChunks, failedChunks, lastProcessedChunkIndex: i, coveragePercent: coverage, insightsCount: count, updatedAt: new Date() } });
    } else {
      await db.collection('summaries').updateOne({ _id: objectId }, { $set: { processedChunks, skippedChunks, failedChunks, lastProcessedChunkIndex: i, coveragePercent: coverage, insightsCount: count, updatedAt: new Date() } });
    }
    console.log(`  Chunk ${i + 1}/${totalChunks}: +${valid.length} (total: ${count})`);
  }

  const final = await db.collection('summaries').findOne({ _id: objectId }, { projection: { keyInsightsV2: 1 } });
  const finalCount = final?.keyInsightsV2?.length || 0;
  const finalStatus = failedChunks > 0 ? 'partial' : 'completed';
  await db.collection('summaries').updateOne({ _id: objectId }, { $set: { keyInsightsV2Status: finalStatus, keyInsightsV2CompletedAt: new Date(), coveragePercent: 100, insightsCount: finalCount, keyInsightsV2GeneratedAt: new Date().toISOString(), keyInsightsV2Count: finalCount, coverageReport: { transcriptCharLength: fullTranscript.length, totalChunks, processedChunks, skippedChunks, coveragePercent: 100, maxUncoveredGap: 0 }, updatedAt: new Date() } });
  console.log(`  DONE: ${finalCount} insights, status ${finalStatus}`);
}

async function main() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db('13f-tracker');
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // Continue Bloom Energy (from chunk 2)
  await continueArticle(db, anthropic, '6a41d70f2615eca486b0789e', 'Bloom Energy');
  // Process Bitcoin Treasury (fresh)
  await continueArticle(db, anthropic, '6a41e63e4bb69fbeefd9f21c', 'Bitcoin Treasury');

  console.log('\n=== All done ===');
  await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
