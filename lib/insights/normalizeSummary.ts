/**
 * normalizeSummary.ts
 *
 * Single source of truth for resolving summary document fields.
 * Handles both new-style (editedArticleDraft/cleanArticleDraft/articleDraft/publishedArticle)
 * and old-style (article/body) documents.
 */

/**
 * 6-bucket classification for /experts CMS view.
 *
 * 1. rawMaterial  – legacy article/body, unknown-status docs, video_queue/expert_insights summaries
 * 2. candidate    – status=candidate, has editedDraft/cleanDraft/articleDraft, no blocker phrase
 * 3. needsReview  – blocker phrase in editable drafts, explicit blocker field, status contradiction
 * 4. published    – status=published + alphaReady=true + publishedArticle present
 * 5. unpublished  – status=unpublished (retains publishedArticle)
 * 6. invalid      – no content at all, cannot publish
 */
export type SummaryBucket = 'rawMaterial' | 'candidate' | 'needsReview' | 'published' | 'unpublished' | 'invalid';

export interface NormalizedSummary {
  id: string
  displayTitle: string
  displayStatus: string
  displaySourceDate: string | null
  displaySource: string | null
  displayChannel: string | null
  youtubeId: string | null

  displayDraft: string        // Preview 草稿 tab 顯示
  displayDraftSource: string | null

  editableContent: string     // textarea 編輯器
  editableContentSource: string | null

  publishedContent: string    // 只用 publishedArticle
  publishedContentSource: string | null

  isCandidate: boolean
  isPublished: boolean
  isUnpublished: boolean

  canEdit: boolean
  canPublish: boolean
  canUnpublish: boolean

  publishBlockedReasons: string[]
  warnings: string[]

  keyInsights: any[]          // eslint-disable-line @typescript-eslint/no-explicit-any
  keyInsightsSource: string | null

  transcriptAvailable: boolean
  transcriptLength: number | null
  transcriptSource: string | null
  transcriptMetadataWarnings: string[]
}

// ── 6-Bucket Classifier ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function classifySummaryBucket(doc: Record<string, any>): SummaryBucket {
  const status = doc.status || 'unknown';

  // 4. Published — strict gate
  if (status === 'published' && doc.alphaReady === true &&
      typeof doc.publishedArticle === 'string' && doc.publishedArticle.trim().length > 0) {
    return 'published';
  }

  // 5. Unpublished
  if (status === 'unpublished') {
    return 'unpublished';
  }

  // Content availability
  const hasDraftContent = !!(doc.editedArticleDraft || doc.cleanArticleDraft || doc.articleDraft);
  const hasLegacyContent = !!(doc.article || doc.body);
  const hasAnyContent = hasDraftContent || hasLegacyContent;

  // 6. Invalid — no content at all
  if (!hasAnyContent) {
    return 'invalid';
  }

  // Blocker phrase check — only in editable drafts (editedArticleDraft / cleanArticleDraft)
  const editableText = (doc.editedArticleDraft || '') + ' ' + (doc.cleanArticleDraft || '');
  const BLOCK_PHRASES = [
    '【JG 觀點待補】', '《JG 觀點待補》', 'TODO', 'reviewer note',
    'internal instruction', '請 JG', '請從上面候選方向', '改寫成正式 JG 判斷', '後台操作指令',
  ];
  const hasBlockerPhrase = BLOCK_PHRASES.some(p => editableText.includes(p));
  const hasExplicitBlocker = !!doc.blocker;

  // Status contradiction: claims published but gate fails
  const isContradiction =
    status === 'published' && (!doc.alphaReady || !(doc.publishedArticle?.trim()));

  // 3. NeedsReview — blocker phrases, explicit blocker, or status contradiction
  if (hasBlockerPhrase || hasExplicitBlocker || isContradiction) {
    return 'needsReview';
  }

  // 2. Candidate — status=candidate with actual draft content (not only legacy)
  if (status === 'candidate' && hasDraftContent) {
    return 'candidate';
  }

  // 1. RawMaterial — everything else: legacy-only content, unknown status, etc.
  return 'rawMaterial';
}

// Warning / block phrases that prevent publishing
const PUBLISH_BLOCK_PHRASES = [
  '【JG 觀點待補】',
  '《JG 觀點待補》',
  'TODO',
  'reviewer note',
  'internal instruction',
  '請 JG',
  '請從上面候選方向',
  '改寫成正式 JG 判斷',
  '後台操作指令',
];

/**
 * Resolve the best available content from a summary document using the
 * canonical fallback chain:
 *   editedArticleDraft → cleanArticleDraft → articleDraft → publishedArticle → article → body
 */
function resolveContentChain(doc: Record<string, any>): { content: string; source: string } | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const chain: [string, string][] = [
    ['editedArticleDraft', 'editedArticleDraft'],
    ['cleanArticleDraft', 'cleanArticleDraft'],
    ['articleDraft', 'articleDraft'],
    ['publishedArticle', 'publishedArticle'],
    ['article', 'article'],
    ['body', 'body'],
  ];

  for (const [field, label] of chain) {
    const val = doc[field];
    if (typeof val === 'string' && val.trim().length > 0) {
      return { content: val, source: label };
    }
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeSummary(doc: Record<string, any>): NormalizedSummary {
  const id = String(doc._id ?? '');

  // ── Display metadata ──
  const displayTitle =
    doc.jgTitle || doc.video_title || doc.title || doc.articleTitle || doc.topic || doc.expert_name || '(無標題)';

  const status = doc.status || 'unknown';
  const displayStatus = status;

  const displaySourceDate = doc.sourceDate || doc.publish_date || null;
  const displaySource = doc.source || doc.source_type || null;
  const displayChannel = doc.channel || doc.sourceChannel || null;
  const youtubeId = doc.youtube_id || null;

  // ── Content resolution ──
  const resolved = resolveContentChain(doc);

  const displayDraft = resolved?.content ?? '';
  const displayDraftSource = resolved?.source ?? null;

  // Editable content uses same chain
  const editableContent = resolved?.content ?? '';
  const editableContentSource = resolved?.source ?? null;

  // Published content: strictly publishedArticle only
  const pubVal = doc.publishedArticle;
  const publishedContent = (typeof pubVal === 'string' && pubVal.trim().length > 0) ? pubVal : '';
  const publishedContentSource = publishedContent ? 'publishedArticle' : null;

  // ── Status flags ──
  const isCandidate = status === 'candidate';
  const isPublished = status === 'published' && doc.alphaReady === true;
  const isUnpublished = status === 'unpublished';

  // ── Editability & publishability ──
  const canEdit = editableContent.length > 0;

  const warnings: string[] = [];
  const publishBlockedReasons: string[] = [];

  if (!editableContent) {
    warnings.push('找不到可編輯正文');
  }

  // Check for publish-blocking phrases
  const contentToCheck = doc.editedArticleDraft || doc.cleanArticleDraft || doc.articleDraft || '';
  for (const phrase of PUBLISH_BLOCK_PHRASES) {
    if (contentToCheck.includes(phrase)) {
      publishBlockedReasons.push(`草稿含後台提示：「${phrase}」`);
      break; // one is enough
    }
  }

  if (!editableContent) {
    publishBlockedReasons.push('無可發佈正文');
  }

  const canPublish = !isPublished && publishBlockedReasons.length === 0 && editableContent.length > 0;
  const canUnpublish = isPublished;

  // ── Key Insights ──
  let keyInsights: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  let keyInsightsSource: string | null = null;

  if (Array.isArray(doc.key_insights) && doc.key_insights.length > 0) {
    keyInsights = doc.key_insights;
    keyInsightsSource = 'key_insights';
  } else if (
    doc.rawExpertInsight &&
    Array.isArray(doc.rawExpertInsight.key_insights) &&
    doc.rawExpertInsight.key_insights.length > 0
  ) {
    keyInsights = doc.rawExpertInsight.key_insights;
    keyInsightsSource = 'rawExpertInsight.key_insights';
  }

  // ── Transcript ──
  const transcriptLength: number | null =
    doc.transcriptLength ?? doc.rawExpertInsight?.transcriptLength ?? null;

  const transcriptStored = doc.transcriptStored === true;
  const transcriptRef = doc.transcriptRef || null;

  const transcriptAvailable = transcriptStored || !!transcriptRef || (transcriptLength != null && transcriptLength > 0);

  let transcriptSource: string | null = null;
  if (transcriptStored && transcriptRef) {
    transcriptSource = 'transcriptRef';
  } else if (transcriptLength != null && transcriptLength > 0) {
    transcriptSource = doc.transcriptLength != null ? 'transcriptLength' : 'rawExpertInsight.transcriptLength';
  }

  const transcriptMetadataWarnings: string[] = [];
  if (transcriptLength != null && transcriptLength > 0) {
    if (!transcriptStored) {
      transcriptMetadataWarnings.push('transcript metadata inconsistent: transcriptLength > 0 but transcriptStored is false');
    }
    if (!transcriptRef) {
      transcriptMetadataWarnings.push('transcript metadata inconsistent: transcriptLength > 0 but transcriptRef is missing');
    }
  }

  return {
    id,
    displayTitle,
    displayStatus,
    displaySourceDate,
    displaySource,
    displayChannel,
    youtubeId,
    displayDraft,
    displayDraftSource,
    editableContent,
    editableContentSource,
    publishedContent,
    publishedContentSource,
    isCandidate,
    isPublished,
    isUnpublished,
    canEdit,
    canPublish,
    canUnpublish,
    publishBlockedReasons,
    warnings,
    keyInsights,
    keyInsightsSource,
    transcriptAvailable,
    transcriptLength,
    transcriptSource,
    transcriptMetadataWarnings,
  };
}
