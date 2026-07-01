/**
 * normalizeSummary.ts
 *
 * Single source of truth for resolving summary document fields.
 * Handles both new-style (editedArticleDraft/cleanArticleDraft/articleDraft/publishedArticle)
 * and old-style (article/body) documents.
 */

/**
 * 7-bucket classification for /experts CMS view (new flow).
 *
 * rawMaterial → needsData / inProgress → contentCandidate → published
 *
 * 1. rawMaterial      – catch-all: low relevance, no clear pipeline signal
 * 2. contentCandidate – ALL 5 conditions met (title + content + V2 + draft + meta)
 * 3. inProgress       – has title + content, but V2 or draft not yet done
 * 4. needsData        – missing title OR missing content (18 no-title articles here)
 * 5. needsReview      – has blocker phrases or status contradiction
 * 6. published        – status=published + alphaReady=true + publishedArticle present
 * 7. invalid          – no content at all, cannot process
 *
 * Legacy aliases kept for backward compat:
 * topicCandidate → inProgress, draftCandidate → contentCandidate
 */
export type SummaryBucket =
  | 'rawMaterial'
  | 'contentCandidate'
  | 'inProgress'
  | 'needsData'
  | 'needsReview'
  | 'published'
  | 'invalid'
  // legacy aliases (kept for backward compat only)
  | 'topicCandidate'
  | 'draftCandidate';

// ── Content Readiness ──────────────────────────────────────────────────────

export interface ContentReadiness {
  hasTitle: boolean;
  hasContent: boolean;   // youtube transcript or article/body > 100 chars
  hasV2: boolean;        // keyInsightsV2Status === 'completed'
  hasDraft: boolean;     // draftStatus === 'draft_ready' + has content field
  hasMeta: boolean;      // source or sourceDate or topic or ticker
  missingItems: string[];
  readyForCandidate: boolean; // all 5 true
  // extended normalize fields
  sourceType: 'youtube' | 'article' | 'podcast' | 'bloomberg' | 'expert-pipeline' | 'unknown';
  canRunV2: boolean;
  displayTitle: string;
}

export interface DocNormalized {
  displayTitle: string;
  sourceText: string;
  sourceTextLength: number;
  youtubeId: string | null;
  sourceType: 'youtube' | 'article' | 'podcast' | 'bloomberg' | 'expert-pipeline' | 'unknown';
  hasUsableContent: boolean;
  canRunV2: boolean;
  missingReasons: string[];
}

/**
 * Single source of truth for normalizing raw summary doc fields.
 * Used by getContentReadiness() and anywhere else that needs canonical field values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDocNormalized(doc: Record<string, any>): DocNormalized {
  // 1. displayTitle — priority chain (includes articleTitle for article sources)
  const displayTitle =
    doc.jgTitle?.trim() ||
    doc.title?.trim() ||
    doc.video_title?.trim() ||
    doc.articleTitle?.trim() ||
    doc.rawExpertInsight?.title?.trim() ||
    doc.topic?.trim() ||
    '';

  // 2. sourceText — static article/body fields (transcript is fetched in worker)
  const rawSourceText =
    (doc.article && typeof doc.article === 'string' && doc.article.trim().length > 100 ? doc.article : null) ||
    (doc.body && typeof doc.body === 'string' && doc.body.trim().length > 100 ? doc.body : null) ||
    (doc.rawText && typeof doc.rawText === 'string' && doc.rawText.trim().length > 100 ? doc.rawText : null) ||
    (doc.sourceText && typeof doc.sourceText === 'string' && doc.sourceText.trim().length > 100 ? doc.sourceText : null) ||
    null;
  const sourceText = rawSourceText ?? '';
  const sourceTextLength = sourceText.length;

  // 3. youtubeId
  const youtubeId: string | null = doc.youtube_id || doc.rawExpertInsight?.youtube_id || null;

  // 4. sourceType
  const sourceType: DocNormalized['sourceType'] =
    youtubeId ? 'youtube' :
    (doc.source === 'Bloomberg' || doc.source === 'bloomberg') ? 'bloomberg' :
    doc.source === 'expert-pipeline' ? 'expert-pipeline' :
    (doc.source === 'podcast' || (typeof doc.source === 'string' && doc.source.toLowerCase().includes('podcast'))) ? 'podcast' :
    sourceText.length > 100 ? 'article' :
    'unknown';

  // 5. hasUsableContent
  const hasUsableContent =
    (sourceType === 'youtube' && !!youtubeId) ||
    sourceText.length > 100;

  // 6. canRunV2
  const canRunV2 = !!displayTitle && hasUsableContent;

  // 7. missingReasons
  const missingReasons: string[] = [];
  if (!displayTitle) missingReasons.push('缺標題');
  if (!hasUsableContent) {
    if (sourceType === 'youtube' && !youtubeId) missingReasons.push('缺 youtube_id');
    else missingReasons.push('缺正文（article content < 100 字）');
  }
  if (!doc.source && !doc.rawExpertInsight?.channel) missingReasons.push('缺來源資訊');

  return { displayTitle, sourceText, sourceTextLength, youtubeId, sourceType, hasUsableContent, canRunV2, missingReasons };
}

/**
 * Evaluate whether a summary document meets all 5 content-candidate entry conditions.
 * Uses getDocNormalized() as single source of truth for title/content resolution.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getContentReadiness(doc: Record<string, any>): ContentReadiness {
  const norm = getDocNormalized(doc);

  // 1. Has title — from normalized displayTitle (includes articleTitle)
  const hasTitle = !!norm.displayTitle;

  // 2. Has usable content — from normalized hasUsableContent
  const hasContent = norm.hasUsableContent;

  // 3. V2 洞察完成
  const hasV2 = doc.keyInsightsV2Status === 'completed';

  // 4. 草稿已備 (draftStatus=draft_ready + actual content)
  const hasDraftContent = !!(
    doc.cleanArticleDraft || doc.editedArticleDraft || doc.articleDraft ||
    doc.article || doc.body
  );
  const hasDraft = doc.draftStatus === 'draft_ready' && hasDraftContent;

  // 5. 基本溯源 (source / sourceDate / topic / ticker)
  const hasMeta = !!(
    doc.source || doc.sourceDate || doc.topic || doc.ticker ||
    (Array.isArray(doc.tickers) && doc.tickers.length > 0)
  );

  const missing = [...norm.missingReasons];
  if (!hasV2) missing.push('缺V2洞察');
  if (!hasDraft) missing.push('缺草稿');
  if (!hasMeta) missing.push('缺來源資訊');

  const readyForCandidate = hasTitle && hasContent && hasV2 && hasDraft && hasMeta;

  return {
    hasTitle,
    hasContent,
    hasV2,
    hasDraft,
    hasMeta,
    missingItems: missing,
    readyForCandidate,
    sourceType: norm.sourceType,
    canRunV2: norm.canRunV2,
    displayTitle: norm.displayTitle,
  };
}

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

// ── 7-Bucket Classifier (new flow) ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function classifySummaryBucket(doc: Record<string, any>): SummaryBucket {
  const status = doc.status || 'unknown';

  // 1. Published — strict gate
  if (status === 'published' && doc.alphaReady === true &&
      typeof doc.publishedArticle === 'string' && doc.publishedArticle.trim().length > 0) {
    return 'published';
  }

  // 2. Blocker phrases / contradiction → needsReview
  const editableText = (doc.editedArticleDraft || '') + ' ' + (doc.cleanArticleDraft || '');
  const BLOCK_PHRASES = [
    '【JG 觀點待補】', '《JG 觀點待補》', 'TODO', 'reviewer note',
    'internal instruction', '請 JG', '請從上面候選方向', '改寫成正式 JG 判斷', '後台操作指令',
  ];
  const hasBlockerPhrase = BLOCK_PHRASES.some(p => editableText.includes(p));
  const hasExplicitBlocker = !!doc.blocker;
  const isContradiction =
    status === 'published' && (!doc.alphaReady || !(doc.publishedArticle?.trim()));

  if (hasBlockerPhrase || hasExplicitBlocker || isContradiction) {
    return 'needsReview';
  }

  // 3. Evaluate per-condition readiness
  const readiness = getContentReadiness(doc);

  // Check for truly empty docs
  const hasDraftContent = !!(doc.editedArticleDraft || doc.cleanArticleDraft || doc.articleDraft);
  const hasKI = !!(
    (Array.isArray(doc.key_insights) && doc.key_insights.length > 0) ||
    (Array.isArray(doc.keyInsights) && doc.keyInsights.length > 0)
  );
  const hasTranscriptStored = !!(doc.transcriptStored || doc.transcriptRef ||
    (typeof doc.transcriptLength === 'number' && doc.transcriptLength > 0));
  const hasAnyUsable = readiness.hasTitle || readiness.hasContent || hasDraftContent || hasKI || hasTranscriptStored;

  // 4. Invalid — truly nothing usable
  if (!hasAnyUsable) {
    return 'invalid';
  }

  // 5. contentCandidate — ALL 5 conditions met → 內容候選
  if (readiness.readyForCandidate) {
    return 'contentCandidate';
  }

  // 6. inProgress — has title + content, pipeline incomplete
  if (readiness.hasTitle && readiness.hasContent) {
    return 'inProgress';
  }

  // 7. needsData — missing title OR missing content (has some data)
  if (readiness.hasTitle || readiness.hasContent || hasDraftContent || hasKI || hasTranscriptStored) {
    return 'needsData';
  }

  // 8. rawMaterial — catch-all
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
