/**
 * Core draft generation logic, shared between:
 * - app/api/admin/insights/generate-draft/route.ts (API route, auth-guarded)
 * - scripts/insights-worker.mjs (CLI worker, via inline JS clone)
 * - scripts/draft-backfill.mjs (CLI batch script)
 */

import { Db, ObjectId } from 'mongodb';
import Anthropic from '@anthropic-ai/sdk';

// ── Publish blockers ──────────────────────────────────────────────────────────

export const PUBLISH_BLOCKERS = [
  '【JG 觀點待補】',
  '《JG 觀點待補》',
  '請從上面候選方向',
  '候選方向中選一個',
  '改寫成正式 JG 判斷',
  'reviewer note',
  'internal instruction',
  'TODO for JG',
  '請 JG',
  '後台操作指令',
  'TODO',
];

export function containsPublishBlocker(text: string): boolean {
  return PUBLISH_BLOCKERS.some(b => text.includes(b));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerateDraftOptions {
  /** Admin-supplied market direction text */
  marketDirections?: string;
  marketDirectionsRaw?: string;
  /** Overwrite existing draft_ready drafts */
  force?: boolean;
  /**
   * When called from worker/backfill we skip the freshness gate (> 90 days)
   * and the status === 'candidate' check; instead we just log and return ok: false.
   */
  workerMode?: boolean;
}

export interface GenerateDraftResult {
  ok: boolean;
  /** Set when ok: true */
  draftStatus?: 'draft_ready' | 'draft_needs_review';
  blocked?: boolean;
  draftTitle?: string;
  generatedAt?: Date;
  freshnessWarning?: string | null;
  daysOld?: number | null;
  /** Set when ok: false */
  error?: string;
  errorCode?: string;
  /** true when skipped (draft already exists) — ok: false but non-fatal */
  skipped?: boolean;
}

// ── Main function ─────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-5';

export async function generateDraft(
  db: Db,
  summaryId: string,
  options: GenerateDraftOptions = {}
): Promise<GenerateDraftResult> {
  const { marketDirections, marketDirectionsRaw, force = false, workerMode = false } = options;

  const originalMarketDirectionInput: string =
    marketDirectionsRaw ||
    (Array.isArray(marketDirections) ? (marketDirections as string[]).join('\n') : (marketDirections ?? ''));

  // ── 1. Resolve ObjectId ───────────────────────────────────────────────────

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(summaryId);
  } catch {
    return { ok: false, error: 'Invalid summaryId', errorCode: 'invalid_id' };
  }

  // ── 2. Fetch summary ──────────────────────────────────────────────────────

  const summary = await db.collection('summaries').findOne({ _id: objectId });
  if (!summary) {
    return { ok: false, error: 'Summary not found', errorCode: 'not_found' };
  }

  // ── 3. Status check (candidate only) ─────────────────────────────────────

  if (summary.status !== 'candidate') {
    if (workerMode) {
      return { ok: false, error: `status is '${summary.status}', not 'candidate'`, errorCode: 'not_candidate', skipped: true };
    }
    return { ok: false, error: '只能對 candidate 生成草稿', errorCode: 'not_candidate' };
  }

  // ── 4. Skip if draft already exists (unless force) ────────────────────────

  if ((summary.draftStatus === 'draft_ready' || summary.draftStatus === 'draft_needs_review') && !force) {
    return {
      ok: false,
      error: '已有草稿，不允許覆蓋。如需重新生成請傳入 force: true',
      errorCode: 'already_has_draft',
      skipped: true,
    };
  }

  // ── 5. Extract rawExpertInsight fields + V2 support ─────────────────────────

  const raw = summary.rawExpertInsight as Record<string, unknown> | null | undefined;

  // Try V2 format first (keyInsightsV2), fallback to old rawExpertInsight.key_insights
  interface KeyInsightV2Item {
    zhTitle?: string;
    zhSummary?: string;
    whyItMatters?: string;
    sourceExcerpt?: string;
    importanceScore?: number;
    investmentRelevanceScore?: number;
  }
  const v2Insights = Array.isArray(summary.keyInsightsV2) ? (summary.keyInsightsV2 as KeyInsightV2Item[]) : [];
  const oldKI: string[] = (raw?.key_insights as string[]) || [];

  // Convert V2 items to key insight strings for the prompt
  const v2KI: string[] = v2Insights
    .filter((item: KeyInsightV2Item) => item.zhTitle || item.zhSummary || item.whyItMatters)
    .map((item: KeyInsightV2Item) => {
      const parts: string[] = [];
      if (item.zhTitle) parts.push(item.zhTitle);
      if (item.zhSummary) parts.push(item.zhSummary);
      if (item.whyItMatters) parts.push(`投資意涵：${item.whyItMatters}`);
      if (item.sourceExcerpt) parts.push(`原文摘錄：${item.sourceExcerpt}`);
      return parts.join('。');
    });

  // Prefer V2, fallback to old format
  const ki: string[] = v2KI.length > 0 ? v2KI : oldKI;
  const isV2Source = v2KI.length > 0;

  const ts: string = (raw?.transcript_sample as string) || '';
  const topic: string = (raw?.topic as string) || (summary.topic as string) || '';
  const expertName: string = (raw?.expert_name as string) || (summary.expertName as string) || '';
  const expertRole: string = (raw?.expert_role as string) || (raw?.expert_title as string) || '';
  const expertOrg: string = (raw?.expert_org as string) || (raw?.expert_institution as string) || '';
  const channel: string = (raw?.channel as string) || (raw?.source_channel as string) || (summary.channel as string) || '';
  const sourceType: string = (raw?.source_type as string) || (summary.sourceType as string) || '';
  const ticker: string = (raw?.ticker as string) || (summary.ticker as string) || '';
  const title: string = (raw?.title as string) || (raw?.video_title as string) || (summary.title as string) || '';
  const sourceUrl: string = (raw?.source_url as string) || (raw?.url as string) || (summary.sourceUrl as string) || '';

  const sourceDate =
    (raw?.publish_date as string) ||
    (summary?.createdAt as string) ||
    new Date().toISOString().split('T')[0];
  const sourceDateFallback = !raw?.publish_date;

  const validKI = ki.filter((s: string) =>
    !s.match(/^\[music\]/i) &&
    !s.match(/^(welcome|hello|hi|大家好|歡迎)/i) &&
    s.length > 20
  );

  const hasContent = validKI.length > 0 || ts.length > 50;
  const hasTopic = !!topic;
  const hasSource = !!(expertName || channel);
  const isNoMatch = sourceType === 'no_match';

  // ── 6. Content / enrichment guards ───────────────────────────────────────

  if (!hasContent) {
    return { ok: false, error: '缺少 key_insights / keyInsightsV2 和 transcript_sample', errorCode: 'no_content' };
  }

  const enrichmentStatus = (raw as Record<string, unknown>)?.enrichmentStatus as string || '';
  if (enrichmentStatus === 'needs_transcript_or_insights') {
    return { ok: false, error: '此素材缺少 key_insights 和 transcript_sample', errorCode: 'enrichment_block' };
  }
  if (enrichmentStatus === 'transcript_too_short') {
    return { ok: false, error: '逐字稿太短，不適合成稿', errorCode: 'transcript_too_short' };
  }

  const isVideoQueueSource = ((raw as Record<string, unknown>)?.syncedFrom === 'video_queue' || sourceType === 'video_queue');
  const hasOldStyleContent = validKI.length > 0 || ts.length > 50;
  if (isVideoQueueSource && enrichmentStatus !== 'enriched' && !hasOldStyleContent) {
    return { ok: false, error: '此素材尚未補逐字稿 / key insights', errorCode: 'enrichment_block' };
  }

  if (!hasTopic) return { ok: false, error: 'topic 空白', errorCode: 'no_topic' };
  if (!hasSource) return { ok: false, error: '缺少 expert_name / channel / source', errorCode: 'no_source' };
  if (isNoMatch) return { ok: false, error: 'source_type=no_match，此素材不適合成稿', errorCode: 'no_match' };

  // ── 7. Freshness gate ─────────────────────────────────────────────────────

  const sourceDateValue = (raw?.publish_date as string) || (summary?.createdAt as string) || null;
  let daysOld: number | null = null;
  if (sourceDateValue) {
    try {
      const date = new Date(sourceDateValue);
      const now = new Date();
      daysOld = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      daysOld = null;
    }
  }

  if (daysOld !== null && daysOld > 90 && !workerMode) {
    return {
      ok: false,
      error: `這是歷史素材（${daysOld} 天前），請確認是否仍要使用`,
      errorCode: 'freshness_block',
    };
  }

  const freshnessWarning = daysOld !== null && daysOld > 30
    ? `⚠️ 此素材為 ${daysOld} 天前的訪談，請確認資訊是否仍有效`
    : null;

  // ── 8. Fetch recent articles for prompt context ───────────────────────────

  const recentArticles = await db.collection('summaries')
    .find(
      { alphaReady: true },
      { projection: { _id: 1, jgTitle: 1, title: 1, topic: 1, tags: 1, articleType: 1, publishedAt: 1 } }
    )
    .sort({ publishedAt: -1 })
    .limit(5)
    .toArray();

  // ── 9. Build prompt ───────────────────────────────────────────────────────

  const kiText = validKI.map((k, i) => `${i + 1}. ${k}`).join('\n');
  const tsSection = ts.length > 50 ? `\n訪談片段：\n${ts.slice(0, 800)}` : '';
  const expertLine = [expertName, expertRole, expertOrg].filter(Boolean).join('，');
  const mdirList = originalMarketDirectionInput;

  const systemPrompt = `你是一個財經研究助理。你必須只回傳一個 valid JSON object，不加任何解釋文字、markdown code block、或前後文。`;

  const userPrompt = `素材資訊：
- 標題：${title || topic}
- 專家：${expertLine || '（未知）'}
- 頻道：${channel || '（未知）'}
- 日期：${sourceDate || '（未知）'}
- 主題標的：${ticker ? ticker + ' / ' : ''}${topic}
- 來源連結：${sourceUrl || '（未提供）'}

專家關鍵觀點：
${kiText}
${tsSection}

近期市場感覺 / 方向（admin 原始輸入，請先整理成主題再進行連結）：
${mdirList?.trim() ? mdirList : '（未提供）'}

最近已上架文章（供聯想參考）：
${recentArticles.length > 0
  ? recentArticles.map(a => `- 標題：${(a.jgTitle as string) || (a.title as string) || '未知'} | 主題：${(a.topic as string) || '—'} | 標籤：${((a.tags as string[]) || []).join(', ') || '—'} | 日期：${(a.publishedAt as string) || '—'}`).join('\n')
  : '（無已上架文章）'}

---

請生成以下格式的 JSON object，只回傳 JSON，不加任何額外文字：

{
  "suggestedTitle": "建議標題（繁體中文）",
  "articleDraft": "完整文章草稿（markdown 格式，見下方格式說明）",
  "normalizedMarketThemes": ["整理後的市場主題 1", "整理後的市場主題 2"],
  "selectedMarketDirection": "最相關的整理後主題（字串），若 fitScore < 70 則為 null",
  "marketDirectionFitScore": 0,
  "marketDirectionReason": "為什麼這則素材符合或不符合此市場方向（1-2 句）",
  "relatedRecentArticles": [],
  "jgAngleCandidates": []
}

欄位規則：
- normalizedMarketThemes：將 admin 輸入的自由文字整理成清楚的市場主題陣列（1-5 個主題），若未提供則為 []
- marketDirectionFitScore 是 0-100 的數字
- marketDirectionFitScore < 70 → selectedMarketDirection 必須是 null
- relatedRecentArticles 中每個 item 格式：{"id": "文章 _id 字串", "title": "文章標題", "fitScore": 數字, "reason": "為什麼相關（1 句）"}
- 只有 fitScore >= 70 的 related articles 才放進 relatedRecentArticles
- 沒有明確關聯 → relatedRecentArticles: []
- jgAngleCandidates：3 條候選觀點（1-2 句），只能是候選，不是正式 JG 觀點
- 不可新增原文沒有的數字
- 不可給買賣建議

articleDraft 格式（固定格式，markdown，用 \\n 換行）：
# {標題}

## 一、這則素材在講什麼
（根據素材整理這位專家說了什麼，只整理，不評論，不新增原文沒有的數字）

## 二、為什麼這件事對投資人重要
（從市場角度說明這則訊息的意義，不給買賣建議）

## 三、投資判斷摘要

根據以上素材，請生成一段完整的投資判斷段落（3-5句），說明：
- 這則素材對投資人的意義是什麼
- 哪些結構性變化值得關注
- 相關公司或產業的潛在影響

請用中性分析語氣，不要留任何空白或後台提示。
不要寫「JG 認為」「我的觀點是」「買賣建議」。

## 四、接下來觀察什麼
（列出 2-3 個後續值得追蹤的觀察指標或事件）

禁止出現於 articleDraft：「JG 認為」「我的觀點是」買賣建議、影片口吻（大家好、歡迎回來、記得按讚、訂閱）`;

  // ── 10. Call Anthropic ────────────────────────────────────────────────────

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawLLMText = (msg.content[0] as { text: string }).text.trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawLLMText);
  } catch {
    return { ok: false, error: 'LLM JSON parse failed', errorCode: 'json_parse_failed' };
  }

  // ── 11. Parse draft ───────────────────────────────────────────────────────

  const draftTitle = (parsed.suggestedTitle as string) || title || topic;
  const articleDraft = (parsed.articleDraft as string) || '';

  const draftLines = articleDraft.split('\n');
  let bodyStart = 0;
  for (let i = 0; i < draftLines.length; i++) {
    if (draftLines[i].startsWith('# ')) {
      bodyStart = i + 1;
      break;
    }
  }
  const draftBody = draftLines.slice(bodyStart).join('\n').trim();

  const draftStatus: 'draft_ready' | 'draft_needs_review' = containsPublishBlocker(draftBody)
    ? 'draft_needs_review'
    : 'draft_ready';

  // ── 12. Write to DB ───────────────────────────────────────────────────────

  const tags = [ticker, topic, sourceType].filter(Boolean);
  const generatedAt = new Date();
  const today = generatedAt.toISOString().split('T')[0];

  await db.collection('summaries').updateOne(
    { _id: objectId },
    {
      $set: {
        article: draftBody,
        body: draftBody,
        hasJgPlaceholder: false,
        title: draftTitle,
        jgTitle: draftTitle,
        analysisDate: today,
        articleType: 'expert_note',
        tags,
        needsDraft: false,
        draftStatus,
        lintStatus: 'pending',
        lintErrors: [],
        generatedAt,
        generatedBy: 'ai',
        model: MODEL,
        promptVersion: 'v2.0',
        updatedAt: generatedAt.toISOString(),
        sourceDate,
        sourceDateFallback,
        marketDirectionInput: originalMarketDirectionInput || '',
        originalMarketDirectionInput: originalMarketDirectionInput || '',
        normalizedMarketThemes: parsed.normalizedMarketThemes ?? [],
        selectedMarketDirection: parsed.selectedMarketDirection ?? null,
        marketDirectionFitScore: parsed.marketDirectionFitScore ?? 0,
        marketDirectionReason: parsed.marketDirectionReason ?? '',
        relatedRecentArticles: parsed.relatedRecentArticles ?? [],
        jgAngleCandidates: parsed.jgAngleCandidates ?? [],
        // status: 'candidate' — 不改
        // alphaReady: false — 不改
      },
    }
  );

  return {
    ok: true,
    draftStatus,
    blocked: draftStatus === 'draft_needs_review',
    draftTitle,
    generatedAt,
    freshnessWarning,
    daysOld,
  };
}
