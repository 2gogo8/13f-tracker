import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import Anthropic from '@anthropic-ai/sdk';

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
  const { summaryId, marketDirections, marketDirectionsRaw } = body;
  // 支援 freeform string 或 string[]
  const originalMarketDirectionInput: string =
    marketDirectionsRaw ||
    (Array.isArray(marketDirections) ? marketDirections.join('\n') : (marketDirections ?? ''));
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

  // 3. 查 summaries document
  const summary = await db.collection('summaries').findOne({ _id: objectId });
  if (!summary) {
    return NextResponse.json({ error: 'Summary not found' }, { status: 404 });
  }

  // 4. 只接受 candidate
  if (summary.status !== 'candidate') {
    return NextResponse.json({ error: '只能對 candidate 生成草稿' }, { status: 400 });
  }

  // 5. 避免重複生成
  if (summary.draftStatus === 'draft_ready') {
    return NextResponse.json({ error: '已有草稿，不允許覆蓋' }, { status: 400 });
  }

  // 6. 取 rawExpertInsight
  const raw = summary.rawExpertInsight as Record<string, unknown> | null | undefined;

  // 可生成條件驗證
  const ki: string[] = (raw?.key_insights as string[]) || [];
  const ts: string = (raw?.transcript_sample as string) || '';
  const topic: string = (raw?.topic as string) || (summary.topic as string) || '';
  const expertName: string = (raw?.expert_name as string) || (summary.expertName as string) || '';
  const expertRole: string = (raw?.expert_role as string) || (raw?.expert_title as string) || '';
  const expertOrg: string = (raw?.expert_org as string) || (raw?.expert_institution as string) || '';
  const channel: string = (raw?.channel as string) || (raw?.source_channel as string) || '';
  const sourceType: string = (raw?.source_type as string) || '';
  const ticker: string = (raw?.ticker as string) || (summary.ticker as string) || '';
  const title: string = (raw?.title as string) || (raw?.video_title as string) || (summary.title as string) || '';
  const sourceUrl: string = (raw?.source_url as string) || (raw?.url as string) || (summary.sourceUrl as string) || '';

  // sourceDate 修正
  const sourceDate =
    (raw?.publish_date as string) ||
    (summary?.createdAt as string) ||
    new Date().toISOString().split('T')[0];
  const sourceDateFallback = !raw?.publish_date;

  // 過濾無效 key_insights
  const validKI = ki.filter((s: string) =>
    !s.match(/^\[music\]/i) &&
    !s.match(/^(welcome|hello|hi|大家好|歡迎)/i) &&
    s.length > 20
  );

  const hasContent = validKI.length > 0 || ts.length > 50;
  const hasTopic = !!topic;
  const hasSource = !!(expertName || channel);
  const isNoMatch = sourceType === 'no_match';

  if (!hasContent) {
    return NextResponse.json({ error: '缺少 key_insights 和 transcript_sample' }, { status: 400 });
  }

  // enrichmentStatus 防呆：如果標記為 needs_transcript_or_insights，不允許生成
  if ((raw as Record<string, unknown>)?.enrichmentStatus === 'needs_transcript_or_insights') {
    return NextResponse.json(
      { error: '此素材缺少 key_insights 和 transcript_sample，請先補充內容後再生成草稿', enrichmentBlock: true },
      { status: 400 }
    );
  }
  if (!hasTopic) {
    return NextResponse.json({ error: 'topic 空白' }, { status: 400 });
  }
  if (!hasSource) {
    return NextResponse.json({ error: '缺少 expert_name / channel / source' }, { status: 400 });
  }
  if (isNoMatch) {
    return NextResponse.json({ error: 'source_type=no_match，此素材不適合成稿' }, { status: 400 });
  }

  // sourceDate 新鮮度 gate
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

  if (daysOld !== null && daysOld > 90) {
    return NextResponse.json(
      { error: `這是歷史素材（${daysOld} 天前），請確認是否仍要使用`, freshnessBlock: true, daysOld },
      { status: 400 }
    );
  }

  const freshnessWarning = daysOld !== null && daysOld > 30
    ? `⚠️ 此素材為 ${daysOld} 天前的訪談，請確認資訊是否仍有效`
    : null;

  // 抓近期 5 篇已上架文章
  const recentArticles = await db.collection('summaries')
    .find(
      { alphaReady: true },
      { projection: { _id: 1, jgTitle: 1, title: 1, topic: 1, tags: 1, articleType: 1, publishedAt: 1 } }
    )
    .sort({ publishedAt: -1 })
    .limit(5)
    .toArray();

  // 建構 Prompt
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

## 三、可能的 JG 觀點方向

市場方向連結：
（說明這則素材與近期市場方向的關聯，若無明確關聯則說明為何）

近期文章聯想：
（說明與近期已上架文章的關聯，若無則說明）

JG 觀點候選：

1. （候選觀點 1）
2. （候選觀點 2）
3. （候選觀點 3）

【JG 觀點待補】
請從上面候選方向中選一個，改寫成正式 JG 判斷。

## 四、接下來觀察什麼
（列出 2-3 個後續值得追蹤的觀察指標或事件）

禁止出現於 articleDraft：「JG 認為」「我的觀點是」買賣建議、影片口吻（大家好、歡迎回來、記得按讚、訂閱）`;

  // 呼叫 Anthropic LLM
  const anthropic = getAnthropicClient();
  const MODEL = 'claude-sonnet-4-5';

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawLLMText = (msg.content[0] as { text: string }).text.trim();

  // JSON parse try/catch
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawLLMText);
  } catch {
    // 不覆蓋任何 DB 欄位
    return NextResponse.json(
      { ok: false, error: 'json_parse_failed', raw: rawLLMText.slice(0, 500) },
      { status: 502 }
    );
  }

  // 解析 title 和 body from JSON
  const draftTitle = (parsed.suggestedTitle as string) || title || topic;
  const articleDraft = (parsed.articleDraft as string) || '';

  // 從 articleDraft 解析 body（去掉第一行 # 標題）
  const draftLines = articleDraft.split('\n');
  let bodyStart = 0;
  for (let i = 0; i < draftLines.length; i++) {
    if (draftLines[i].startsWith('# ')) {
      bodyStart = i + 1;
      break;
    }
  }
  const draftBody = draftLines.slice(bodyStart).join('\n').trim();

  // 寫回 summaries
  const today = new Date().toISOString().split('T')[0];
  const tags = [ticker, topic, sourceType].filter(Boolean);
  const generatedAt = new Date();

  await db.collection('summaries').updateOne(
    { _id: objectId },
    {
      $set: {
        article: draftBody,
        body: draftBody,
        title: draftTitle,
        jgTitle: draftTitle,
        analysisDate: today,
        articleType: 'expert_note',
        tags,
        needsDraft: false,
        draftStatus: 'draft_ready',
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

  return NextResponse.json({
    ok: true,
    summaryId,
    draftTitle,
    draftBody,
    selectedMarketDirection: parsed.selectedMarketDirection ?? null,
    marketDirectionFitScore: parsed.marketDirectionFitScore ?? 0,
    jgAngleCandidates: parsed.jgAngleCandidates ?? [],
    relatedRecentArticles: parsed.relatedRecentArticles ?? [],
    generatedAt: generatedAt.toISOString(),
    model: MODEL,
    freshnessWarning,
    daysOld,
  });
}
