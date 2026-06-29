import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-5';

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function POST(req: NextRequest) {
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { marketContextRaw } = body as { marketContextRaw?: string };

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  // 查詢最近 30 天的待處理影片
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const videos = await db.collection('expert_insights').find({
    source_type: 'video_queue',
    enrichmentStatus: { $in: ['needs_transcript_or_insights', 'transcript_too_short', null] },
    status: 'new',
    youtube_id: { $exists: true, $nin: [null, ''] },
    $or: [
      { video_title: { $exists: true, $ne: '' } },
      { title: { $exists: true, $ne: '' } },
    ],
    $and: [{
      $or: [
        { publish_date: { $gte: thirtyDaysAgo.toISOString().split('T')[0] } },
        { createdAt: { $gte: thirtyDaysAgo } },
      ],
    }],
  }).toArray();

  if (videos.length === 0) {
    return NextResponse.json({ ok: true, total: 0, results: { recommended: 0, needs_review: 0, low_priority: 0, irrelevant: 0 }, top5: [] });
  }

  // 整理成列表，一次送 LLM 評分
  const videoListText = videos.map((v, i) => {
    const title = v.video_title || v.title || '';
    const channel = v.channel || '';
    const pubDate = v.publish_date || '';
    return `${i + 1}. [${channel}] "${title}" (${pubDate})`;
  }).join('\n');

  const systemPrompt = '你是一個財經編輯助理。你必須只回傳 valid JSON array，不加任何解釋文字。';

  const userPrompt = `你是一個財經編輯，需要從最近的頻道影片中挑選值得深入閱讀的投資內容。

近期市場方向（管理者輸入）：
${marketContextRaw || '（未提供，請根據一般投資價值判斷）'}

以下是最近 30 天的頻道影片清單（格式：序號. [頻道名] "標題" (日期)）：
${videoListText}

請對每支影片評分，回傳 JSON array（長度與輸入一致，順序一致）：
[
  {
    "index": 1,
    "priorityScore": 0-100,
    "triageStatus": "recommended" | "needs_review" | "low_priority" | "irrelevant",
    "priorityReason": "一句話說明為什麼這個分數（繁體中文，不超過 60 字）",
    "matchedMarketThemes": ["主題1", "主題2"]
  },
  ...
]

評分標準：
- priorityScore >= 75 → recommended（標題明確相關市場/公司/產業，且能連結到 marketContextRaw）
- 50-74 → needs_review（有些相關但不夠明確，或頻道優質但標題不夠聚焦）
- 30-49 → low_priority（一般財經內容，與 marketContextRaw 連結弱）
- < 30 → irrelevant（明顯不相關，或是 short/clip/trailer 類型）

注意：
- 不要因為頻道是 a16z/All-In/ARK 就全部打高分
- 標題是 short/clip/highlight/trailer/teaser 的打低分
- 與 marketContextRaw 明確相關的打高分
- 不確定的打 50-60`;

  const anthropic = getAnthropicClient();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  type RankingItem = {
    index: number;
    priorityScore: number;
    triageStatus: string;
    priorityReason: string;
    matchedMarketThemes: string[];
  };

  let rankings: RankingItem[] = [];
  try {
    let raw = (msg.content[0] as { text: string }).text.trim();
    // Strip markdown code fences if present
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    rankings = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'llm_json_parse_failed' }, { status: 502 });
  }

  const now = new Date();
  const results: Record<string, number> = { recommended: 0, needs_review: 0, low_priority: 0, irrelevant: 0 };

  for (const r of rankings) {
    const video = videos[r.index - 1];
    if (!video) continue;

    const triageStatus = r.priorityScore >= 75 ? 'recommended'
      : r.priorityScore >= 50 ? 'needs_review'
      : r.priorityScore >= 30 ? 'low_priority' : 'irrelevant';

    results[triageStatus]++;

    await db.collection('expert_insights').updateOne(
      { _id: video._id },
      {
        $set: {
          triageStatus,
          priorityScore: r.priorityScore,
          priorityReason: r.priorityReason,
          matchedMarketThemes: r.matchedMarketThemes || [],
          rankedAt: now,
          rankingModel: MODEL,
          rankingInput: marketContextRaw || '',
        },
      }
    );
  }

  const top5 = videos
    .map((v, i) => ({
      ...rankings[i],
      title: v.video_title || v.title,
      channel: v.channel,
      publishedAt: v.publish_date,
    }))
    .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
    .slice(0, 5);

  return NextResponse.json({
    ok: true,
    total: videos.length,
    results,
    top5,
  });
}
