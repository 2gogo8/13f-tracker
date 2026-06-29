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
  const raw = summary.rawExpertInsight as Record<string, any> | null | undefined;

  // 可生成條件驗證
  const ki: string[] = raw?.key_insights || [];
  const ts: string = raw?.transcript_sample || '';
  const topic: string = raw?.topic || summary.topic || '';
  const expertName: string = raw?.expert_name || summary.expertName || '';
  const expertRole: string = raw?.expert_role || raw?.expert_title || '';
  const expertOrg: string = raw?.expert_org || raw?.expert_institution || '';
  const channel: string = raw?.channel || raw?.source_channel || '';
  const sourceType: string = raw?.source_type || '';
  const ticker: string = raw?.ticker || summary.ticker || '';
  const title: string = raw?.title || raw?.video_title || summary.title || '';
  const publishDate: string = raw?.publish_date || raw?.sourceDate || summary.sourceDate || '';
  const sourceUrl: string = raw?.source_url || raw?.url || summary.sourceUrl || '';

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
  if (!hasTopic) {
    return NextResponse.json({ error: 'topic 空白' }, { status: 400 });
  }
  if (!hasSource) {
    return NextResponse.json({ error: '缺少 expert_name / channel / source' }, { status: 400 });
  }
  if (isNoMatch) {
    return NextResponse.json({ error: 'source_type=no_match，此素材不適合成稿' }, { status: 400 });
  }

  // 建構 Prompt
  const kiText = validKI.map((k, i) => `${i + 1}. ${k}`).join('\n');
  const tsSection = ts.length > 50 ? `\n訪談片段：\n${ts.slice(0, 800)}` : '';

  const expertLine = [expertName, expertRole, expertOrg].filter(Boolean).join('，');
  const prompt = `你是一個財經研究助理，負責整理專家訪談素材成短研究筆記。

素材資訊：
- 標題：${title || topic}
- 專家：${expertLine || '（未知）'}
- 頻道：${channel || '（未知）'}
- 日期：${publishDate || '（未知）'}
- 主題標的：${ticker ? ticker + ' / ' : ''}${topic}
- 來源連結：${sourceUrl || '（未提供）'}

專家關鍵觀點：
${kiText}
${tsSection}

---

請生成一篇 600-900 中文字的短研究筆記，格式如下，不要偏離：

# {建議標題}

## 一、這則素材在講什麼

（根據素材整理這位專家說了什麼，只整理，不評論，不新增原文沒有的數字）

## 二、為什麼這件事對投資人重要

（從市場角度說明這則訊息的意義，不給買賣建議）

## 三、【JG 觀點待補】

請補上你對這則素材的反市場觀點：市場忽略了什麼？共識哪裡可能太滿？這件事跟資本流向有什麼關係？

## 四、接下來觀察什麼

（列出 2-3 個後續值得追蹤的觀察指標或事件）

---
限制：
- 不要新增原文沒有的公司財務數字
- 不要給買賣建議
- 不要寫影片口吻（大家好、歡迎回來、記得按讚、訂閱）
- 第三段只放 placeholder 文字「【JG 觀點待補】」，不要自行補 JG 觀點
- 只用以上素材資訊，不要外部知識補充`;

  // 呼叫 Anthropic LLM
  const anthropic = getAnthropicClient();
  const MODEL = 'claude-sonnet-4-5';

  let draftTitle = title || topic;
  let draftBody = '';

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = (msg.content[0] as { text: string }).text.trim();

  // 解析 title (# 開頭的第一行)
  const lines = rawText.split('\n');
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('# ')) {
      draftTitle = lines[i].replace(/^# /, '').trim();
      bodyStart = i + 1;
      break;
    }
  }
  draftBody = lines.slice(bodyStart).join('\n').trim();

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
        promptVersion: 'v1.0',
        updatedAt: generatedAt.toISOString(),
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
    generatedAt: generatedAt.toISOString(),
    model: MODEL,
  });
}
