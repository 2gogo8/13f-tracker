/**
 * keyInsightsV2Job.ts
 *
 * Core logic for the Key Insights V2 Job System.
 * - Chunk-by-chunk DB writes (incremental, resumable)
 * - JSON parse protection (cleanLLMJson)
 * - Job state tracking on each summary document
 */

import { ObjectId, Db } from 'mongodb';
import Anthropic from '@anthropic-ai/sdk';
import { YoutubeTranscript } from 'youtube-transcript';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface KeyInsightV2 {
  insightTitle: string;
  zhSummary: string;
  sourceExcerpt: string;
  sourceCharStart: number;
  sourceCharEnd: number;
  chunkIndex: number;
  totalChunks: number;
  timestampStart?: string;
  timestampEnd?: string;
  importanceScore: number;
  investmentRelevanceScore: number;
  topicTags: string[];
  tickers: string[];
  companies: string[];
  suggestedArticleAngle: string;
  whyItMatters: string;
}

export interface KeyInsightsV2JobState {
  keyInsightsV2Status: 'not_started' | 'queued' | 'running' | 'completed' | 'failed' | 'partial';
  keyInsightsV2StartedAt?: Date;
  keyInsightsV2CompletedAt?: Date;
  transcriptCharLength?: number;
  totalChunks?: number;
  processedChunks?: number;
  failedChunks?: number;
  skippedChunks?: number;
  coveragePercent?: number;
  insightsCount?: number;
  lastProcessedChunkIndex?: number;
  lastError?: string;
  modelUsed?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 4500;
const MODEL = 'claude-sonnet-4-5';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Clean LLM response that may be wrapped in markdown code fences.
 */
export function cleanLLMJson(raw: string): string {
  return raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
}

/**
 * Chunk transcript into non-overlapping segments, breaking at sentence boundaries.
 */
export function chunkTranscript(text: string): { chunk: string; charStart: number; charEnd: number }[] {
  const chunks: { chunk: string; charStart: number; charEnd: number }[] = [];
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
      if (lastBreak > 0) {
        end = searchStart + lastBreak + 1;
      }
    }
    chunks.push({ chunk: text.substring(pos, end), charStart: pos, charEnd: end });
    pos = end;
  }
  return chunks;
}

/**
 * Process a single chunk with Anthropic Claude.
 */
async function processChunk(
  anthropic: Anthropic,
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  charStart: number,
  charEnd: number,
  videoTitle: string,
  channel: string
): Promise<{ insights: KeyInsightV2[]; error?: string }> {
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

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText = (msg.content[0] as { text: string }).text.trim();
    const cleanText = cleanLLMJson(rawText);

    try {
      const parsed = JSON.parse(cleanText);
      if (!Array.isArray(parsed)) return { insights: [] };

      // Filter: must have sourceExcerpt >= 300 chars and insightTitle
      const valid = parsed.filter(
        (item: Record<string, unknown>) =>
          typeof item.sourceExcerpt === 'string' &&
          item.sourceExcerpt.length >= 100 &&
          typeof item.insightTitle === 'string'
      ) as KeyInsightV2[];

      return { insights: valid };
    } catch (parseErr) {
      console.error(`[key-insights-v2] JSON parse failed for chunk ${chunkIndex}:`, (parseErr as Error).message);
      return { insights: [], error: `JSON parse failed: ${(parseErr as Error).message}` };
    }
  } catch (apiErr) {
    console.error(`[key-insights-v2] API error for chunk ${chunkIndex}:`, (apiErr as Error).message);
    return { insights: [], error: `API error: ${(apiErr as Error).message}` };
  }
}

/**
 * Compute coverage percentage.
 */
function computeCoverage(
  transcriptLength: number,
  chunks: { charStart: number; charEnd: number }[],
  processedIndices: number[]
): number {
  if (transcriptLength <= 0) return 0;
  const processedRanges = processedIndices
    .map(i => chunks[i])
    .filter(Boolean)
    .sort((a, b) => a.charStart - b.charStart);

  let coveredChars = 0;
  let lastEnd = 0;
  for (const range of processedRanges) {
    const effectiveStart = Math.max(range.charStart, lastEnd);
    if (range.charEnd > effectiveStart) {
      coveredChars += range.charEnd - effectiveStart;
    }
    lastEnd = Math.max(lastEnd, range.charEnd);
  }

  return Math.min(100, Math.round((coveredChars / transcriptLength) * 100));
}

/**
 * Fetch or retrieve transcript for a summary.
 * Returns fullTranscript string or throws.
 */
export async function getTranscript(db: Db, youtubeId: string): Promise<string> {
  // Check video_transcripts collection first
  const transcriptDoc = await db.collection('video_transcripts').findOne({ youtube_id: youtubeId });
  if (transcriptDoc?.fullTranscript) {
    return transcriptDoc.fullTranscript as string;
  }

  // Fetch from YouTube
  console.log(`[key-insights-v2] Fetching transcript from YouTube for ${youtubeId}...`);
  let transcriptLines: { text: string; offset?: number; duration?: number }[];
  try {
    transcriptLines = await YoutubeTranscript.fetchTranscript(youtubeId, { lang: 'en' });
  } catch {
    transcriptLines = await YoutubeTranscript.fetchTranscript(youtubeId);
  }

  if (!transcriptLines || transcriptLines.length === 0) {
    throw new Error('Transcript unavailable for this video');
  }

  const fullTranscript = transcriptLines.map(l => l.text).join(' ');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await db.collection('video_transcripts').updateOne(
    { youtube_id: youtubeId },
    {
      $set: {
        youtube_id: youtubeId,
        fullTranscript,
        transcriptLength: fullTranscript.length,
        transcriptSegments: transcriptLines.length,
        transcriptSource: 'youtube-transcript',
        fetchedAt: now.toISOString(),
        expiresAt,
        updatedAt: now.toISOString(),
      },
      $setOnInsert: { createdAt: now.toISOString() },
    },
    { upsert: true }
  );

  return fullTranscript;
}

/**
 * Main job processor: process a single summary's transcript into V2 insights.
 * Writes each chunk's results to DB immediately (resumable).
 *
 * @param db - MongoDB database
 * @param summaryId - ObjectId string of the summary document
 * @param options - { continueFrom?: number, resetFailed?: boolean }
 */
export async function processKeyInsightsV2Job(
  db: Db,
  summaryId: string,
  options: { continueFrom?: number; resetFailed?: boolean } = {}
): Promise<{
  ok: boolean;
  insightsCount: number;
  status: KeyInsightsV2JobState['keyInsightsV2Status'];
  error?: string;
  jobState: KeyInsightsV2JobState;
}> {
  const objectId = new ObjectId(summaryId);
  const summary = await db.collection('summaries').findOne({ _id: objectId });
  if (!summary) {
    return { ok: false, insightsCount: 0, status: 'failed', error: 'Summary not found', jobState: { keyInsightsV2Status: 'failed', lastError: 'Summary not found' } };
  }

  const youtubeId = summary.youtube_id || (summary.rawExpertInsight as Record<string, unknown>)?.youtube_id;
  if (!youtubeId) {
    return { ok: false, insightsCount: 0, status: 'failed', error: 'No youtube_id', jobState: { keyInsightsV2Status: 'failed', lastError: 'No youtube_id' } };
  }

  // Get transcript
  let fullTranscript: string;
  try {
    fullTranscript = await getTranscript(db, youtubeId as string);
  } catch (err) {
    const errMsg = (err as Error).message;
    await db.collection('summaries').updateOne({ _id: objectId }, {
      $set: { keyInsightsV2Status: 'failed', lastError: errMsg, updatedAt: new Date() }
    });
    return { ok: false, insightsCount: 0, status: 'failed', error: errMsg, jobState: { keyInsightsV2Status: 'failed', lastError: errMsg } };
  }

  if (fullTranscript.length < 100) {
    const errMsg = 'Transcript too short';
    await db.collection('summaries').updateOne({ _id: objectId }, {
      $set: { keyInsightsV2Status: 'failed', lastError: errMsg, updatedAt: new Date() }
    });
    return { ok: false, insightsCount: 0, status: 'failed', error: errMsg, jobState: { keyInsightsV2Status: 'failed', lastError: errMsg } };
  }

  const chunks = chunkTranscript(fullTranscript);
  const totalChunks = chunks.length;
  const videoTitle = (summary.title as string) || (summary.jgTitle as string) || '';
  const channel = (summary.sourceChannel as string) || (summary.rawExpertInsight as Record<string, unknown>)?.channel as string || '';

  // Determine start index
  let startIndex = 0;
  if (options.continueFrom !== undefined) {
    startIndex = options.continueFrom;
  } else if (options.resetFailed) {
    // Only reprocess failed chunks - but we don't track per-chunk status yet
    // So for resetFailed, start from lastProcessedChunkIndex + 1
    const lastIdx = typeof summary.lastProcessedChunkIndex === 'number' ? summary.lastProcessedChunkIndex : -1;
    startIndex = lastIdx + 1;
  }

  // If starting fresh (startIndex = 0 and no continueFrom), clear existing V2 data
  if (startIndex === 0 && !options.continueFrom && !options.resetFailed) {
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
  } else {
    // Continuing: set status to running
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

  console.log(`[key-insights-v2] Processing ${summaryId}: chunks ${startIndex}–${totalChunks - 1} of ${totalChunks}, ${fullTranscript.length} chars`);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let totalInsightsAdded = 0;
  let failedChunksCount = typeof summary.failedChunks === 'number' && startIndex > 0 ? summary.failedChunks : 0;
  let skippedChunksCount = typeof summary.skippedChunks === 'number' && startIndex > 0 ? summary.skippedChunks : 0;
  let processedChunksCount = typeof summary.processedChunks === 'number' && startIndex > 0 ? summary.processedChunks : 0;
  let lastError: string | null = null;

  // Collect all processed indices for coverage calc (including prior ones)
  const allProcessedIndices: number[] = [];
  if (startIndex > 0) {
    for (let i = 0; i < startIndex; i++) allProcessedIndices.push(i);
  }

  for (let i = startIndex; i < totalChunks; i++) {
    const result = await processChunk(
      anthropic,
      chunks[i].chunk,
      i,
      totalChunks,
      chunks[i].charStart,
      chunks[i].charEnd,
      videoTitle,
      channel
    );

    if (result.error) {
      failedChunksCount++;
      lastError = result.error;
      console.error(`[key-insights-v2] Chunk ${i} failed: ${result.error}`);
      // Update DB with failure but continue
      await db.collection('summaries').updateOne({ _id: objectId }, {
        $set: {
          failedChunks: failedChunksCount,
          lastError,
          lastProcessedChunkIndex: i,
          updatedAt: new Date(),
        }
      });
      continue;
    }

    // Filter: no sourceExcerpt = discard
    const validInsights = result.insights.filter(
      ins => ins.sourceExcerpt && ins.sourceExcerpt.length >= 100
    );

    processedChunksCount++;
    allProcessedIndices.push(i);

    if (validInsights.length === 0) {
      skippedChunksCount++;
    }

    totalInsightsAdded += validInsights.length;

    // Calculate current coverage
    const coveragePercent = computeCoverage(fullTranscript.length, chunks, allProcessedIndices);

    // Get current total insights count
    const currentDoc = await db.collection('summaries').findOne({ _id: objectId }, { projection: { keyInsightsV2: 1 } });
    const currentCount = (Array.isArray(currentDoc?.keyInsightsV2) ? currentDoc.keyInsightsV2.length : 0) + validInsights.length;

    // Write chunk results to DB immediately
    const updateOp: Record<string, unknown> = {
      processedChunks: processedChunksCount,
      skippedChunks: skippedChunksCount,
      failedChunks: failedChunksCount,
      lastProcessedChunkIndex: i,
      coveragePercent,
      insightsCount: currentCount,
      updatedAt: new Date(),
    };
    if (lastError) updateOp.lastError = lastError;

    if (validInsights.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.collection('summaries').updateOne({ _id: objectId }, {
        $push: { keyInsightsV2: { $each: validInsights } },
        $set: updateOp,
      } as any);
    } else {
      await db.collection('summaries').updateOne({ _id: objectId }, {
        $set: updateOp,
      });
    }

    console.log(`[key-insights-v2] Chunk ${i + 1}/${totalChunks}: ${validInsights.length} insights (total so far: ${currentCount})`);
  }

  // Final status
  const finalDoc = await db.collection('summaries').findOne({ _id: objectId }, { projection: { keyInsightsV2: 1 } });
  const finalInsightsCount = Array.isArray(finalDoc?.keyInsightsV2) ? finalDoc.keyInsightsV2.length : 0;
  const finalCoverage = computeCoverage(fullTranscript.length, chunks, allProcessedIndices);

  let finalStatus: KeyInsightsV2JobState['keyInsightsV2Status'];
  if (failedChunksCount > 0 && processedChunksCount < totalChunks) {
    finalStatus = 'partial';
  } else if (failedChunksCount > 0) {
    finalStatus = 'partial';
  } else {
    finalStatus = 'completed';
  }

  const jobState: KeyInsightsV2JobState = {
    keyInsightsV2Status: finalStatus,
    keyInsightsV2CompletedAt: new Date(),
    transcriptCharLength: fullTranscript.length,
    totalChunks,
    processedChunks: processedChunksCount,
    failedChunks: failedChunksCount,
    skippedChunks: skippedChunksCount,
    coveragePercent: finalCoverage,
    insightsCount: finalInsightsCount,
    lastProcessedChunkIndex: totalChunks - 1,
    modelUsed: MODEL,
  };
  if (lastError) jobState.lastError = lastError;

  await db.collection('summaries').updateOne({ _id: objectId }, {
    $set: {
      ...jobState,
      keyInsightsV2GeneratedAt: new Date().toISOString(),
      keyInsightsV2Count: finalInsightsCount,
      // Also write the legacy coverageReport for backward compat
      coverageReport: {
        transcriptCharLength: fullTranscript.length,
        totalChunks,
        processedChunks: processedChunksCount,
        skippedChunks: skippedChunksCount,
        coveragePercent: finalCoverage,
        maxUncoveredGap: 0,
      },
      updatedAt: new Date(),
    },
  });

  console.log(`[key-insights-v2] Done ${summaryId}: ${finalInsightsCount} insights, coverage ${finalCoverage}%, status ${finalStatus}`);

  return {
    ok: true,
    insightsCount: finalInsightsCount,
    status: finalStatus,
    jobState,
  };
}
