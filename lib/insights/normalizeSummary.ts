/**
 * normalizeSummary.ts
 *
 * Single source of truth for resolving summary document fields.
 * Handles both new-style (editedArticleDraft/cleanArticleDraft/articleDraft/publishedArticle)
 * and old-style (article/body) documents.
 */

/**
 * 6-bucket classification for /experts CMS view (new flow).
 *
 * rawMaterial     → topicCandidate → draftCandidate → published
 *
 * 1. rawMaterial      – investmentRelevanceScore < 30 and no substantial content
 * 2. topicCandidate   – investmentRelevanceScore >= 60 (investment-related)
 * 3. draftCandidate   – status=candidate + alphaReady=false + has cleanArticleDraft/editedArticleDraft
 * 4. needsReview      – has blocker phrases, or investmentRelevanceScore 30-59, or status contradiction
 * 5. published        – status=published + alphaReady=true + publishedArticle present
 * 6. invalid          – no content at all, cannot process
 */
export type SummaryBucket = 'rawMaterial' | 'topicCandidate' | 'draftCandidate' | 'needsReview' | 'published' | 'invalid';

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

// ── 6-Bucket Classifier (new flow) ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function classifySummaryBucket(doc: Record<string, any>): SummaryBucket {
  const status = doc.status || 'unknown';

  // 5. Published — strict gate
  if (status === 'published' && doc.alphaReady === true &&
      typeof doc.publishedArticle === 'string' && doc.publishedArticle.trim().length > 0) {
    return 'published';
  }

  // Content availability
  const hasDraftContent = !!(doc.editedArticleDraft || doc.cleanArticleDraft || doc.articleDraft);
  const hasLegacyContent = !!(doc.article || doc.body);
  const hasAnyContent = hasDraftContent || hasLegacyContent;
  const hasKI = !!((
    Array.isArray(doc.key_insights) && doc.key_insights.length > 0) ||
    (Array.isArray(doc.keyInsights) && doc.keyInsights.length > 0));
  const hasTranscript = !!(doc.transcriptStored || doc.transcriptRef ||
    (typeof doc.transcriptLength === 'number' && doc.transcriptLength > 0));
  const hasTitle = !!(doc.jgTitle || doc.video_title || doc.title || doc.articleTitle || doc.topic);
  const hasDate = !!(doc.sourceDate || doc.createdAt || doc.publish_date);

  // 6. Invalid — no content at all
  if (!hasAnyContent && !hasKI && !hasTranscript) {
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

  // Hard blockers → needsReview (always takes priority over topicCandidate)
  if (hasBlockerPhrase || hasExplicitBlocker || isContradiction) {
    return 'needsReview';
  }

  // 3. DraftCandidate — status=candidate + alphaReady=false + actual clean/edited draft (or legacy draft_ready)
  if (status === 'candidate' && doc.alphaReady !== true &&
      (doc.editedArticleDraft || doc.cleanArticleDraft || doc.draftStatus === 'draft_ready')) {
    return 'draftCandidate';
  }

  // 2. TopicCandidate — investmentRelevanceScore >= 60
  const irScore = typeof doc.investmentRelevanceScore === 'number' ? doc.investmentRelevanceScore : null;

  if (irScore !== null && irScore >= 60) {
    return 'topicCandidate';
  }

  // needsReview: borderline investment relevance (30-59)
  if (irScore !== null && irScore >= 30) {
    return 'needsReview';
  }

  // Fallback for untriaged docs: use legacy signals
  if (irScore === null) {
    // Legacy: has title + date, or KI/transcript, or articleDecision set
    const articleDecision = doc.articleDecision;
    const hasArticleDecision = !!(articleDecision &&
      ['draft_candidate', 'material_only', 'needs_review'].includes(articleDecision));
    if ((hasTitle && hasDate) || hasKI || hasTranscript || hasArticleDecision) {
      return 'topicCandidate';
    }
  }

  // 1. RawMaterial — investmentRelevanceScore < 30 or no triage signal
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
  const youtubeId = doc.youtube_id || doc.rawExpertInsight?.youtube_id || null;

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
    doc.transcriptLength ?? doc.transcriptCharLength ??
    doc.rawExpertInsight?.transcriptLength ?? doc.rawExpertInsight?.transcript_length ?? null;

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

// ── Content Workbench helpers ─────────────────────────────────────────────────

/**
 * Determine if a summary doc has usable content for V2 / draft generation.
 * Rules:
 *  - YouTube source (youtube_id present): need transcript stored/referenced.
 *  - Bloomberg/article: summaries.article or body/article field > 100 chars.
 *  - rawExpertInsight.key_insights: non-empty array.
 *  - editedArticleDraft / cleanArticleDraft / articleDraft also counts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hasUsableContent(doc: Record<string, any>): boolean {
  // Draft content already exists → definitely usable
  if (doc.editedArticleDraft || doc.cleanArticleDraft || doc.articleDraft) return true;
  // YouTube source: need transcript
  if (doc.youtube_id || doc.rawExpertInsight?.youtube_id) {
    return !!(
      doc.transcriptStored ||
      doc.transcriptRef ||
      (typeof doc.transcriptLength === 'number' && doc.transcriptLength > 0) ||
      (typeof doc.transcriptCharLength === 'number' && doc.transcriptCharLength > 0) ||
      (typeof doc.rawExpertInsight?.transcriptLength === 'number' && doc.rawExpertInsight.transcriptLength > 0)
    );
  }
  // Article / Bloomberg / expert-pipeline source
  const articleText: string =
    (typeof doc.summaries?.article === 'string' ? doc.summaries.article : '') ||
    (typeof doc.body === 'string' ? doc.body : '') ||
    (typeof doc.article === 'string' ? doc.article : '');
  if (articleText.trim().length > 100) return true;
  // rawExpertInsight.key_insights
  if (
    doc.rawExpertInsight?.key_insights &&
    Array.isArray(doc.rawExpertInsight.key_insights) &&
    doc.rawExpertInsight.key_insights.length > 0
  ) return true;
  // Other content fields
  if (typeof doc.content === 'string' && doc.content.trim().length > 0) return true;
  if (typeof doc.sourceText === 'string' && doc.sourceText.trim().length > 0) return true;
  return false;
}

export type WorkbenchCardStatus = 'publishable' | 'needs_draft' | 'v2_processing' | 'needs_v2' | 'no_content';

export interface WorkbenchCardInfo {
  status: WorkbenchCardStatus;
  priority: number;
  label: string;
  color: string;
  bg: string;
  border: string;
}

/**
 * Get the workbench card status for the unified 📋 內容候選 tab.
 * Priority: 1=publishable > 2=needs_draft > 3=v2_processing > 4=needs_v2 > 5=no_content
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getWorkbenchCardInfo(doc: Record<string, any>): WorkbenchCardInfo {
  // 1. 🚀 可發佈
  if (doc.draftStatus === 'draft_ready') {
    return { status: 'publishable', priority: 1, label: '🚀 可發佈', color: '#16a34a', bg: '#f0fff4', border: '#86efac' };
  }
  // 2. ✍️ 待草稿 (V2 completed + no draft)
  const hasDraft = !!(doc.editedArticleDraft || doc.cleanArticleDraft || doc.articleDraft);
  if (doc.keyInsightsV2Status === 'completed' && !hasDraft) {
    return { status: 'needs_draft', priority: 2, label: '✍️ 待草稿', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' };
  }
  // 3. 🔬 V2 處理中
  if (doc.keyInsightsV2Status === 'partial' || doc.keyInsightsV2Status === 'running') {
    return { status: 'v2_processing', priority: 3, label: '🔬 V2 處理中', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' };
  }
  // 4 vs 5: depends on content availability
  if (hasUsableContent(doc)) {
    return { status: 'needs_v2', priority: 4, label: '📭 待 V2', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' };
  }
  return { status: 'no_content', priority: 5, label: '⚠️ 無可用內容', color: '#ef4444', bg: '#fff5f5', border: '#fecaca' };
}
