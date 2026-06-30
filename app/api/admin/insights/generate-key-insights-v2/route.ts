import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import Anthropic from '@anthropic-ai/sdk';
import { YoutubeTranscript } from 'youtube-transcript';

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

interface KeyInsightV2 {
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

interface CoverageReport {
  transcriptCharLength: number;
  totalChunks: number;
  processedChunks: number;
  skippedChunks: number;
  coveragePercent: number;
  maxUncoveredGap: number;
}

const CHUNK_SIZE = 4000; // target 3000-5000 chars per chunk
const CHUNK_OVERLAP = 200; // small overlap to avoid cutting mid-sentence

function chunkTranscript(text: string): { chunk: string; charStart: number; charEnd: number }[] {
  const chunks: { chunk: string; charStart: number; charEnd: number }[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + CHUNK_SIZE, text.length);
    // Try to break at sentence boundary
    if (end < text.length) {
      const searchBack = text.substring(end - 200, end);
      const lastPeriod = Math.max(
        searchBack.lastIndexOf('. '),
        searchBack.lastIndexOf('。'),
        searchBack.lastIndexOf('！'),
        searchBack.lastIndexOf('？'),
        searchBack.lastIndexOf('\n')
      );
      if (lastPeriod > 0) {
        end = end - 200 + lastPeriod + 1;
      }
    }
    chunks.push({
      chunk: text.substring(pos, end),
      charStart: pos,
      charEnd: end,
    });
    pos = Math.max(pos + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

async function processChunk(
  anthropic: Anthropic,
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  charStart: number,
  charEnd: number,
  videoTitle: string,
  channel: string
): Promise<KeyInsightV2[]> {
  const MODEL = 'claude-sonnet-4-5';

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

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawText = (msg.content[0] as { text: string }).text.trim();

  try {
    // Try to parse, handling potential markdown wrapping
    let cleanText = rawText;
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const parsed = JSON.parse(cleanText);
    if (!Array.isArray(parsed)) return [];

    // Validate each insight has sourceExcerpt
    return parsed.filter(
      (item: Record<string, unknown>) =>
        typeof item.sourceExcerpt === 'string' &&
        item.sourceExcerpt.length >= 100 &&
        typeof item.insightTitle === 'string'
    ) as KeyInsightV2[];
  } catch {
    console.error(`[key-insights-v2] Failed to parse chunk ${chunkIndex} response:`, rawText.substring(0, 200));
    return [];
  }
}

function computeCoverageReport(
  transcriptLength: number,
  chunks: { charStart: number; charEnd: number }[],
  processedChunkIndices: number[],
  skippedChunkIndices: number[]
): CoverageReport {
  const totalChunks = chunks.length;
  const processedChunks = processedChunkIndices.length;
  const skippedChunks = skippedChunkIndices.length;

  // Calculate coverage: find uncovered ranges
  const processedRanges = processedChunkIndices
    .map(i => chunks[i])
    .sort((a, b) => a.charStart - b.charStart);

  let coveredChars = 0;
  let maxGap = 0;
  let lastEnd = 0;

  for (const range of processedRanges) {
    const effectiveStart = Math.max(range.charStart, lastEnd);
    if (effectiveStart > lastEnd) {
      maxGap = Math.max(maxGap, effectiveStart - lastEnd);
    }
    if (range.charEnd > effectiveStart) {
      coveredChars += range.charEnd - effectiveStart;
    }
    lastEnd = Math.max(lastEnd, range.charEnd);
  }

  // Check gap at the end
  if (lastEnd < transcriptLength) {
    maxGap = Math.max(maxGap, transcriptLength - lastEnd);
  }

  const coveragePercent = transcriptLength > 0
    ? Math.round((coveredChars / transcriptLength) * 100)
    : 0;

  return {
    transcriptCharLength: transcriptLength,
    totalChunks,
    processedChunks,
    skippedChunks,
    coveragePercent: Math.min(coveragePercent, 100),
    maxUncoveredGap: maxGap,
  };
}

export async function POST(req: NextRequest) {
  // 1. Admin-only
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2. Parse body
  const body = await req.json();
  const { summaryId } = body;
  if (!summaryId) {
    return NextResponse.json({ error: 'summaryId required' }, { status: 400 });
  }

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(summaryId);
  } catch {
    return NextResponse.json({ error: 'Invalid summaryId' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  // 3. Find summary
  const summary = await db.collection('summaries').findOne({ _id: objectId });
  if (!summary) {
    return NextResponse.json({ error: 'Summary not found' }, { status: 404 });
  }

  // 4. Find youtube_id
  const youtubeId =
    summary.youtube_id ||
    (summary.rawExpertInsight as Record<string, unknown>)?.youtube_id;

  if (!youtubeId) {
    return NextResponse.json({ error: 'No youtube_id found on this summary' }, { status: 400 });
  }

  // 5. Get fullTranscript from video_transcripts
  let transcriptDoc: Record<string, unknown> | null = await db.collection('video_transcripts').findOne({ youtube_id: youtubeId });

  if (!transcriptDoc || !transcriptDoc.fullTranscript) {
    // Try to fetch transcript from YouTube
    console.log(`[key-insights-v2] No transcript in DB for ${youtubeId}, fetching from YouTube...`);
    try {
      let transcriptLines: { text: string; offset?: number; duration?: number }[] = [];
      try {
        transcriptLines = await YoutubeTranscript.fetchTranscript(youtubeId, { lang: 'en' });
      } catch {
        transcriptLines = await YoutubeTranscript.fetchTranscript(youtubeId);
      }

      if (!transcriptLines || transcriptLines.length === 0) {
        return NextResponse.json({ error: 'Transcript unavailable for this video' }, { status: 400 });
      }

      const fullTranscript = transcriptLines.map(l => l.text).join(' ');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

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
          $setOnInsert: {
            createdAt: now.toISOString(),
          },
        },
        { upsert: true }
      );

      transcriptDoc = {
        youtube_id: youtubeId,
        fullTranscript,
        transcriptLength: fullTranscript.length,
      };
    } catch (fetchErr) {
      console.error(`[key-insights-v2] Failed to fetch transcript:`, fetchErr);
      return NextResponse.json(
        { error: `Failed to fetch transcript from YouTube: ${(fetchErr as Error).message}` },
        { status: 400 }
      );
    }
  }

  const fullTranscript = transcriptDoc.fullTranscript as string;
  if (!fullTranscript || fullTranscript.length < 100) {
    return NextResponse.json({ error: 'Transcript too short' }, { status: 400 });
  }

  // 6. Chunk transcript
  const chunks = chunkTranscript(fullTranscript);
  const totalChunks = chunks.length;
  const videoTitle = (summary.title as string) || (summary.jgTitle as string) || '';
  const channel =
    (summary.sourceChannel as string) ||
    (summary.rawExpertInsight as Record<string, unknown>)?.channel as string ||
    '';

  console.log(`[key-insights-v2] Processing ${summaryId}: ${totalChunks} chunks, ${fullTranscript.length} chars`);

  // 7. Process all chunks
  const anthropic = getAnthropicClient();
  const allInsights: KeyInsightV2[] = [];
  const processedIndices: number[] = [];
  const skippedIndices: number[] = [];

  for (let i = 0; i < totalChunks; i++) {
    try {
      const insights = await processChunk(
        anthropic,
        chunks[i].chunk,
        i,
        totalChunks,
        chunks[i].charStart,
        chunks[i].charEnd,
        videoTitle,
        channel
      );
      if (insights.length > 0) {
        allInsights.push(...insights);
        processedIndices.push(i);
      } else {
        // Chunk processed but no insights found
        processedIndices.push(i);
        skippedIndices.push(i);
      }
    } catch (err) {
      console.error(`[key-insights-v2] Error processing chunk ${i}:`, err);
      skippedIndices.push(i);
    }
  }

  // 8. Compute coverage report
  const coverageReport = computeCoverageReport(
    fullTranscript.length,
    chunks,
    processedIndices,
    skippedIndices
  );

  // 9. Filter: no sourceExcerpt = discard
  const validInsights = allInsights.filter(
    ins => ins.sourceExcerpt && ins.sourceExcerpt.length >= 100
  );

  // 10. Save to DB
  const generatedAt = new Date();
  await db.collection('summaries').updateOne(
    { _id: objectId },
    {
      $set: {
        keyInsightsV2: validInsights,
        coverageReport,
        keyInsightsV2GeneratedAt: generatedAt.toISOString(),
        keyInsightsV2Count: validInsights.length,
        updatedAt: generatedAt.toISOString(),
      },
    }
  );

  console.log(`[key-insights-v2] Done ${summaryId}: ${validInsights.length} insights, coverage ${coverageReport.coveragePercent}%`);

  return NextResponse.json({
    ok: true,
    summaryId,
    insightsCount: validInsights.length,
    coverageReport,
    keyInsightsV2: validInsights,
    generatedAt: generatedAt.toISOString(),
  });
}
