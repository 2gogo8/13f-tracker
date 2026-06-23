import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import getClientPromise from '@/lib/mongodb';

interface InterviewData {
  date: string;
  topic: string;
  keyPoint: string;
}

interface ExpertData {
  name: string;
  title: string;
  organization: string;
  tags: string[];
  interviews: InterviewData[];
}

async function callClaude(tags: string[], experts: ExpertData[]): Promise<{
  timelineAnalysis: string;
  keyNumbers: string;
  predictionVsReality: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Prepare interview data
  const interviewsJson = experts.map((e) => ({
    expert: `${e.name} (${e.title}, ${e.organization})`,
    interviews: e.interviews.map((i) => ({
      date: i.date,
      topic: i.topic,
      keyPoint: i.keyPoint,
    })),
  }));

  if (!apiKey) {
    // Mock response when no API key
    return {
      timelineAnalysis: `## ⏱ 時間推論\n\n根據 ${experts.length} 位專家的訪談資料，以下是關於「${tags.join('、')}」議題的發展脈絡：\n\n` +
        experts.map((e) =>
          e.interviews.map((i) =>
            `- **${e.name}**（${i.date}）：${i.keyPoint}`
          ).join('\n')
        ).join('\n') +
        '\n\n> ⚠️ 此為模擬摘要。設定 ANTHROPIC_API_KEY 後將使用 AI 生成更深入的分析。',
      keyNumbers: `## 📊 關鍵數字\n\n從專家訪談中提取的數據點：\n\n` +
        '- 涉及專家數：' + experts.length + ' 位\n' +
        '- 訪談紀錄數：' + experts.reduce((sum, e) => sum + e.interviews.length, 0) + ' 筆\n' +
        '- 相關標籤：' + tags.join('、') + '\n\n' +
        '> ⚠️ 此為模擬摘要。設定 ANTHROPIC_API_KEY 後將使用 AI 提取具體數字。',
      predictionVsReality: `## 🎯 預測 vs 現實\n\n` +
        '基於專家們的觀點，以下是預測與現實的比對：\n\n' +
        experts.map((e) =>
          `**${e.name}（${e.organization}）**\n` +
          e.interviews.map((i) => `- 觀點（${i.date}）：${i.keyPoint}`).join('\n')
        ).join('\n\n') +
        '\n\n> ⚠️ 此為模擬摘要。設定 ANTHROPIC_API_KEY 後將使用 AI 進行深度比對分析。',
    };
  }

  const prompt = `你是一位金融分析師，根據以下專家訪談觀點，生成一份結構化摘要。

關鍵字：${tags.join('、')}
專家訪談資料：${JSON.stringify(interviewsJson, null, 2)}

請生成包含以下三個部分的摘要（繁體中文），每個部分直接輸出內容，不要包含標題：

部分一：時間推論
根據各專家發言時間，說明這個議題的發展脈絡。每個專家的觀點要標注是何時說的。

部分二：關鍵數字
列出所有專家提到的具體數字、比例、時間節點。

部分三：預測 vs 現實
比對專家當時的預測與目前的實際發展，評估準確度與現在處於哪個階段。

請用以下 JSON 格式回應：
{
  "timelineAnalysis": "時間推論內容（markdown 格式）",
  "keyNumbers": "關鍵數字內容（markdown 格式）",
  "predictionVsReality": "預測 vs 現實內容（markdown 格式）"
}

只回傳 JSON，不要包含其他文字。`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Claude API error:', res.status, errText);
    throw new Error(`Claude API error: ${res.status}`);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text || '';

  try {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    return JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback: split content into sections
    return {
      timelineAnalysis: content,
      keyNumbers: '',
      predictionVsReality: '',
    };
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tags, source = 'manual', topic } = body as {
      tags: string[];
      source: 'manual' | 'auto';
      topic?: string;
    };

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return NextResponse.json({ error: 'tags is required and must be a non-empty array' }, { status: 400 });
    }

    const client = await getClientPromise();
    const db = client.db('13f-tracker');

    // Search experts matching tags
    const searchRegexes = tags.map((t) => new RegExp(t, 'i'));
    const experts = await db.collection('experts').find({
      $or: [
        { tags: { $in: searchRegexes } },
        { bio: { $in: searchRegexes } },
        { 'interviews.topic': { $in: searchRegexes } },
        { 'interviews.keyPoint': { $in: searchRegexes } },
      ],
    }).toArray();

    if (experts.length === 0) {
      return NextResponse.json({ error: '找不到符合這些關鍵字的專家資料' }, { status: 404 });
    }

    // Filter interviews that match tags
    const relevantExperts: ExpertData[] = experts.map((e) => ({
      name: e.name,
      title: e.title,
      organization: e.organization,
      tags: e.tags,
      interviews: e.interviews.filter((int: InterviewData) => {
        const text = `${int.topic} ${int.keyPoint}`.toLowerCase();
        return tags.some((t) => text.includes(t.toLowerCase())) || true; // Include all interviews from matching experts
      }),
    }));

    // Call Claude (or mock)
    const summary = await callClaude(tags, relevantExperts);

    const now = new Date();
    const doc = {
      tags,
      source,
      topic: topic || undefined,
      summary,
      expertCount: experts.length,
      publishedAt: now,
      createdAt: now,
    };

    const result = await db.collection('summaries').insertOne(doc);

    return NextResponse.json({ ...doc, _id: result.insertedId });
  } catch (error) {
    console.error('POST /api/insights/generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
