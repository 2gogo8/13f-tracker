/**
 * Unified Content Resolver
 *
 * Single source of truth for reading content across expert_insights and summaries.
 * Read-only — never writes to DB.
 *
 * Transcript lookup priority (confirmed by Hopper):
 *   1. expert_insights.rawText (new schema, full text)
 *   2. expert_insights.transcript_sample (old schema, ~600 chars)
 *   3. video_transcripts collection (full transcript, TTL 30 days, lookup by youtube_id)
 *   4. (future: re-fetch YouTube transcript if youtube_id exists)
 *   5. Show "舊資料缺來源"
 */

import { Db, ObjectId } from 'mongodb';

// ── Types ──────────────────────────────────────────────────────────────────

export type SourceType = 'youtube' | 'podcast' | 'article' | 'expert_pipeline' | 'manual' | 'unknown';
export type TranscriptType = 'full' | 'sample' | null;
export type TranscriptSource = 'rawText' | 'transcript_sample' | 'video_transcripts' | 'refetched' | null;
export type PublishedStatus = 'new' | 'queued' | 'ready' | 'candidate' | 'published' | 'promoted' | 'unpublished' | null;

export type RawContentStatus = 'complete' | 'pending' | 'missing_source_url' | 'transcript_unavailable' | 'paywalled' | 'fetch_failed' | 'legacy_missing_raw_content' | null;

export interface ResolvedContent {
  id: string;
  sourceDocId: string;                  // expert_insights _id
  sourceType: SourceType;
  sourceTitle: string;
  sourceUrl: string | null;
  sourceName: string;                   // channel / podcast / publisher
  sourcePublishedAt: string | null;

  // Raw Content (Source Material)
  rawContentOriginal: string | null;    // original language full text
  rawContentZh: string | null;          // Chinese summary/translation (main reading layer)
  rawContentStatus: RawContentStatus;   // completeness status

  // Transcript
  transcript: string | null;
  transcriptType: TranscriptType;
  transcriptSource: TranscriptSource;
  transcriptLength: number | null;

  // Key Insights
  keyInsights: string[];
  keyInsightsV2: Record<string, unknown>[] | null;
  keyInsightsV2Status: string | null;

  // Draft / Published
  draft: string | null;
  draftSource: string | null;           // which field the draft came from
  draftStatus: string | null;
  publishedArticle: string | null;
  publishedStatus: PublishedStatus;

  // Summary-specific fields (only populated when resolved from summaries)
  summaryId: string | null;

  // Metadata
  youtubeId: string | null;
  expertName: string | null;
  expertOrg: string | null;
  expertRole: string | null;
  ticker: string | null;
  topic: string | null;
  tags: string[];

  // Coverage & V2 meta
  transcriptCharLength: number | null;
  totalChunks: number | null;
  processedChunks: number | null;
  failedChunks: number | null;
  coveragePercent: number | null;
  insightsCount: number | null;
  modelUsed: string | null;
  keyInsightsV2StartedAt: string | null;
  keyInsightsV2CompletedAt: string | null;
  keyInsightsV2GeneratedAt: string | null;

  // Lint / readiness
  lintErrors: string[];
  transcriptSample: string | null;      // always the short 600-char version

  _missing: string[];                   // what's truly missing
  _resolvedFrom: 'expert_insights' | 'summaries_with_fallback';
}

export interface ResolveOptions {
  includeVideoTranscript?: boolean;     // whether to look up video_transcripts collection (default true)
}

// ── Helper: safe string ──────────────────────────────────────────────────────

function safeStr(val: unknown): string | null {
  if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  return null;
}

// ── Helper: resolve sourceType ───────────────────────────────────────────────

function resolveSourceType(doc: Record<string, unknown>): SourceType {
  const st = safeStr(doc.sourceType) || safeStr(doc.source_type);
  if (st) {
    if (st === 'youtube' || st === 'video_queue') return 'youtube';
    if (st === 'podcast' || st.toLowerCase().includes('podcast')) return 'podcast';
    if (st === 'article' || st === 'bloomberg') return 'article';
    if (st === 'expert_pipeline' || st === 'expert-pipeline') return 'expert_pipeline';
    if (st === 'manual') return 'manual';
  }
  if (doc.youtube_id) return 'youtube';
  return 'unknown';
}

// ── Helper: resolve draft chain ──────────────────────────────────────────────

function resolveDraft(
  expertDoc: Record<string, unknown> | null,
  summaryDoc: Record<string, unknown> | null
): { draft: string | null; draftSource: string | null } {
  // Summary drafts take priority (they're the editable copy)
  const chain: [Record<string, unknown> | null, string, string][] = [
    [summaryDoc, 'editedArticleDraft', 'summaries.editedArticleDraft'],
    [summaryDoc, 'cleanArticleDraft', 'summaries.cleanArticleDraft'],
    [summaryDoc, 'articleDraft', 'summaries.articleDraft'],
    [expertDoc, 'editedArticleDraft', 'expert_insights.editedArticleDraft'],
    [expertDoc, 'cleanArticleDraft', 'expert_insights.cleanArticleDraft'],
    [expertDoc, 'articleDraft', 'expert_insights.articleDraft'],
    [expertDoc, 'draft', 'expert_insights.draft'],
  ];

  for (const [doc, field, source] of chain) {
    if (!doc) continue;
    const val = safeStr(doc[field] as string);
    if (val) return { draft: val, draftSource: source };
  }
  return { draft: null, draftSource: null };
}

// ── Main Resolver ────────────────────────────────────────────────────────────

export async function resolveContent(
  id: string,
  db: Db,
  options?: ResolveOptions
): Promise<ResolvedContent | null> {
  const includeVideoTranscript = options?.includeVideoTranscript !== false;

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return null;
  }

  // ── Step 1: Try expert_insights first ──
  let expertDoc = await db.collection('expert_insights').findOne({ _id: objectId });
  let summaryDoc: Record<string, unknown> | null = null;
  let resolvedFrom: 'expert_insights' | 'summaries_with_fallback' = 'expert_insights';

  if (!expertDoc) {
    // ── Step 2: Try summaries, then follow sourceExpertInsightId ──
    summaryDoc = await db.collection('summaries').findOne({ _id: objectId }) as Record<string, unknown> | null;
    if (!summaryDoc) return null;

    resolvedFrom = 'summaries_with_fallback';

    // Follow back to expert_insights
    const sourceId = safeStr(summaryDoc.sourceExpertInsightId as string);
    if (sourceId) {
      try {
        expertDoc = await db.collection('expert_insights').findOne({ _id: new ObjectId(sourceId) });
      } catch {
        // invalid ObjectId, skip
      }
    }
    // Also try originalExpertInsightId
    if (!expertDoc && summaryDoc.originalExpertInsightId) {
      try {
        const origId = summaryDoc.originalExpertInsightId instanceof ObjectId
          ? summaryDoc.originalExpertInsightId
          : new ObjectId(String(summaryDoc.originalExpertInsightId));
        expertDoc = await db.collection('expert_insights').findOne({ _id: origId });
      } catch {
        // skip
      }
    }
    // Last resort: check rawExpertInsight embedded doc
    if (!expertDoc && summaryDoc.rawExpertInsight && typeof summaryDoc.rawExpertInsight === 'object') {
      // Use embedded copy but mark it as such
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expertDoc = summaryDoc.rawExpertInsight as any;
    }
  } else {
    // Check if there's also a summary for this expert_insight
    const summaryResult = await db.collection('summaries').findOne({
      $or: [
        { sourceExpertInsightId: String(objectId) },
        { originalExpertInsightId: objectId },
      ]
    });
    if (summaryResult) {
      summaryDoc = summaryResult as Record<string, unknown>;
    }
  }

  const e = (expertDoc || {}) as Record<string, unknown>;
  const s = (summaryDoc || {}) as Record<string, unknown>;

  // ── Step 3: Merge data ──

  // Source document ID
  const sourceDocId = expertDoc?._id ? String(expertDoc._id) : id;

  // Title
  const sourceTitle =
    safeStr(e.sourceTitle as string) ||
    safeStr(e.video_title as string) ||
    safeStr(e.title as string) ||
    safeStr(s.jgTitle as string) ||
    safeStr(s.title as string) ||
    safeStr(s.video_title as string) ||
    safeStr(e.topic as string) ||
    safeStr(e.ticker as string) ||
    '(無標題)';

  // Source type
  const sourceType = resolveSourceType(e.sourceType ? e : s);

  // Source URL
  const sourceUrl =
    safeStr(e.sourceUrl as string) ||
    safeStr(e.source_url as string) ||
    safeStr(e.url as string) ||
    safeStr(s.sourceUrl as string) ||
    safeStr(s.source_url as string) ||
    safeStr(s.url as string) ||
    null;

  // Source name (channel/podcast/publisher)
  const sourceName =
    safeStr(e.sourceName as string) ||
    safeStr(e.channel as string) ||
    safeStr(e.source_name as string) ||
    safeStr(s.channel as string) ||
    safeStr(s.source as string) ||
    '';

  // Source published at
  const sourcePublishedAt =
    safeStr(e.sourcePublishedAt as string) ||
    safeStr(e.publishedAt as string) ||
    safeStr(e.publish_date as string) ||
    safeStr(e.video_published_at as string) ||
    safeStr(s.sourceDate as string) ||
    null;

  // YouTube ID — check all possible fields including legacy summaries.sourceVideoId
  const youtubeId =
    safeStr(e.youtube_id as string) ||
    safeStr(e.sourceId as string) ||
    safeStr(s.youtube_id as string) ||
    safeStr(s.sourceVideoId as string) ||
    safeStr(s.sourceId as string) ||
    null;

  // ── Transcript (priority chain) ──
  let transcript: string | null = null;
  let transcriptType: TranscriptType = null;
  let transcriptSource: TranscriptSource = null;

  // 1. expert_insights.rawText (new schema, full text)
  const rawText = safeStr(e.rawText as string);
  if (rawText && rawText.length > 100) {
    transcript = rawText;
    transcriptType = 'full';
    transcriptSource = 'rawText';
  }

  // 2. expert_insights.transcript_sample (old schema, ~600 chars)
  if (!transcript) {
    const sample = safeStr(e.transcript_sample as string) || safeStr(s.transcript_sample as string);
    if (sample) {
      transcript = sample;
      transcriptType = 'sample';
      transcriptSource = 'transcript_sample';
    }
  }

  // 3. video_transcripts collection (full transcript, TTL 30 days)
  if (!transcript && youtubeId && includeVideoTranscript) {
    const vtDoc = await db.collection('video_transcripts').findOne({ youtube_id: youtubeId });
    if (vtDoc && safeStr(vtDoc.fullTranscript as string)) {
      transcript = vtDoc.fullTranscript as string;
      transcriptType = 'full';
      transcriptSource = 'video_transcripts';
    }
  }

  // transcript_sample always populated separately for preview
  const transcriptSample =
    safeStr(e.transcript_sample as string) ||
    safeStr(s.transcript_sample as string) ||
    safeStr((s.rawExpertInsight as Record<string, unknown>)?.transcript_sample as string) ||
    null;

  // ── Key Insights ──
  const keyInsightsRaw =
    (Array.isArray(e.key_insights) && (e.key_insights as unknown[]).length > 0 ? e.key_insights : null) ||
    (Array.isArray(e.keyInsights) && (e.keyInsights as unknown[]).length > 0 ? e.keyInsights : null) ||
    (Array.isArray(s.key_insights) && (s.key_insights as unknown[]).length > 0 ? s.key_insights : null) ||
    (Array.isArray(s.keyInsights) && (s.keyInsights as unknown[]).length > 0 ? s.keyInsights : null) ||
    [];
  const keyInsights = keyInsightsRaw as string[];

  // Key Insights V2
  const keyInsightsV2 =
    (Array.isArray(s.keyInsightsV2) && (s.keyInsightsV2 as unknown[]).length > 0 ? s.keyInsightsV2 : null) ||
    (Array.isArray(e.keyInsightsV2) && (e.keyInsightsV2 as unknown[]).length > 0 ? e.keyInsightsV2 : null) ||
    null;
  const keyInsightsV2Status =
    safeStr(s.keyInsightsV2Status as string) || safeStr(e.keyInsightsV2Status as string) || null;

  // ── Draft & Published ──
  const { draft, draftSource } = resolveDraft(expertDoc ? e : null, summaryDoc ? s : null);
  const draftStatus = safeStr(s.draftStatus as string) || safeStr(e.draftStatus as string) || null;
  const publishedArticle = safeStr(s.publishedArticle as string) || null;
  const publishedStatus: PublishedStatus =
    (safeStr(s.status as string) as PublishedStatus) ||
    (safeStr(e.status as string) as PublishedStatus) ||
    null;

  // ── Summary ID ──
  const summaryId = summaryDoc?._id ? String(summaryDoc._id) : null;

  // ── Expert metadata ──
  const expertName = safeStr(e.expert_name as string) || safeStr(e.expertName as string) || safeStr(s.expertName as string) || null;
  const expertOrg = safeStr(e.expert_org as string) || safeStr(e.expert_institution as string) || null;
  const expertRole = safeStr(e.expert_role as string) || safeStr(e.expert_title as string) || null;
  const ticker = safeStr(e.ticker as string) || safeStr(s.ticker as string) || null;
  const topic = safeStr(e.topic as string) || safeStr(s.topic as string) || null;
  const tags = (Array.isArray(s.tags) ? s.tags : Array.isArray(e.tags) ? e.tags : []) as string[];

  // ── Coverage & V2 meta (from summaries preferably) ──
  const transcriptCharLength = (s.transcriptCharLength ?? e.transcriptCharLength ?? null) as number | null;
  const totalChunks = (s.totalChunks ?? e.totalChunks ?? null) as number | null;
  const processedChunks = (s.processedChunks ?? null) as number | null;
  const failedChunks = (s.failedChunks ?? null) as number | null;
  const coveragePercent = (s.coveragePercent ?? null) as number | null;
  const insightsCount = (s.insightsCount ?? null) as number | null;
  const modelUsed = safeStr(s.modelUsed as string) || null;
  const keyInsightsV2StartedAt = safeStr(s.keyInsightsV2StartedAt as string) || null;
  const keyInsightsV2CompletedAt = safeStr(s.keyInsightsV2CompletedAt as string) || null;
  const keyInsightsV2GeneratedAt = safeStr(s.keyInsightsV2GeneratedAt as string) || null;

  // ── Lint errors ──
  const lintErrors = (Array.isArray(s.lintErrors) ? s.lintErrors : []) as string[];

  // ── Raw Content (Source Material) ──
  const rawContentOriginal =
    safeStr(e.rawContentOriginal as string) ||
    safeStr(e.rawText as string) ||
    safeStr(s.rawContentOriginal as string) ||
    null;

  const rawContentZh =
    safeStr(e.rawContentZh as string) ||
    safeStr(s.rawContentZh as string) ||
    null;

  const rawContentStatus: RawContentStatus =
    (safeStr(e.rawContentStatus as string) as RawContentStatus) ||
    (safeStr(s.rawContentStatus as string) as RawContentStatus) ||
    null;

  // ── Compute _missing ──
  const _missing: string[] = [];
  if (!transcript) _missing.push('transcript');
  if (!sourceUrl) _missing.push('sourceUrl');
  if (keyInsights.length === 0) _missing.push('keyInsights');
  if (!keyInsightsV2 || keyInsightsV2.length === 0) _missing.push('keyInsightsV2');
  if (!draft) _missing.push('draft');
  if (!sourceTitle || sourceTitle === '(無標題)') _missing.push('title');
  if (!sourceName) _missing.push('sourceName');
  if (!rawContentOriginal) _missing.push('rawContentOriginal');
  if (!rawContentZh) _missing.push('rawContentZh');

  return {
    id,
    sourceDocId,
    sourceType,
    sourceTitle,
    sourceUrl,
    sourceName,
    sourcePublishedAt,
    rawContentOriginal,
    rawContentZh,
    rawContentStatus,
    transcript,
    transcriptType,
    transcriptSource,
    transcriptLength: transcript?.length ?? null,
    keyInsights,
    keyInsightsV2: keyInsightsV2 as Record<string, unknown>[] | null,
    keyInsightsV2Status,
    draft,
    draftSource,
    draftStatus,
    publishedArticle,
    publishedStatus,
    summaryId,
    youtubeId,
    expertName,
    expertOrg,
    expertRole,
    ticker,
    topic,
    tags,
    transcriptCharLength,
    totalChunks,
    processedChunks,
    failedChunks,
    coveragePercent,
    insightsCount,
    modelUsed,
    keyInsightsV2StartedAt,
    keyInsightsV2CompletedAt,
    keyInsightsV2GeneratedAt,
    lintErrors,
    transcriptSample,
    _missing,
    _resolvedFrom: resolvedFrom,
  };
}
