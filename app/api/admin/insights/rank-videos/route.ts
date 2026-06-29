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
  const {
    marketContextRaw,
    manualKeywordsRaw,
    useKeywordPool = false,
    topN = 5,
  } = body as {
    marketContextRaw?: string;
    manualKeywordsRaw?: string;
    useKeywordPool?: boolean;
    topN?: number;
  };

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  // ── Build keyword pool ──────────────────────────────────
  let poolKeywords: string[] = [];
  if (useKeywordPool) {
    const watchlistDocs = await db
      .collection('watchlist')
      .find({})
      .toArray();
    const picksDocs = await db
      .collection('jg_picks_manual')
      .find({})
      .toArray();
    const cacheDocs = await db
      .collection('jg_picks_cache')
      .find({})
      .toArray();
    poolKeywords = [...watchlistDocs, ...picksDocs, ...cacheDocs]
      .map((d) => [d.symbol, d.ticker, d.name, d.companyName])
      .flat()
      .filter(Boolean) as string[];
  }

  // Manual keywords
  const manualKeywords = manualKeywordsRaw
    ? manualKeywordsRaw
        .split(/[,\n]/)
        .map((s: string) => s.trim())
        .filter(Boolean)
    : [];

  const allKeywords = [...new Set([...poolKeywords, ...manualKeywords])];

  // ── Fetch videos ────────────────────────────────────────
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const videos = await db
    .collection('expert_insights')
    .find({
      source_type: 'video_queue',
      enrichmentStatus: {
        $in: ['needs_transcript_or_insights', 'transcript_too_short', null],
      },
      status: 'new',
      youtube_id: { $exists: true, $nin: [null, ''] },
      $or: [
        { video_title: { $exists: true, $ne: '' } },
        { title: { $exists: true, $ne: '' } },
      ],
      $and: [
        {
          $or: [
            {
              publish_date: {
                $gte: thirtyDaysAgo.toISOString().split('T')[0],
              },
            },
            { createdAt: { $gte: thirtyDaysAgo } },
          ],
        },
      ],
    })
    .toArray();

  if (videos.length === 0) {
    return NextResponse.json({
      ok: true,
      total: 0,
      results: {
        recommended: 0,
        needs_review: 0,
        low_priority: 0,
        irrelevant: 0,
      },
      top5: [],
    });
  }

  // ── Build video list text ───────────────────────────────
  const videoListText = videos
    .map((v, i) => {
      const title = v.video_title || v.title || '';
      const channel = v.channel || '';
      const pubDate = v.publish_date || '';
      return `${i + 1}. [${channel}] "${title}" (${pubDate})`;
    })
    .join('\n');

  // ── LLM prompt ──────────────────────────────────────────
  const systemPrompt =
    '你是一個財經編輯助理。你必須只回傳 valid JSON array，不加任何解釋文字。';

  const userPrompt = `你是財經編輯，需要評估影片是否值得深入閱讀。

近期市場方向：
${marketContextRaw || '（未提供）'}

關鍵字池（股票/公司/主題）：
${allKeywords.slice(0, 50).join(', ') || '（未提供）'}

影片清單（格式：序號. [頻道] "標題" (日期)）：
${videoListText}

請對每支影片評分，回傳 JSON array（長度與輸入一致，順序一致）：
[
  {
    "index": 1,
    "investmentRelevanceScore": 0-100,
    "keywordMatchScore": 0-100,
    "freshnessScore": 0-100,
    "channelQualityScore": 0-100,
    "triageStatus": "recommended" | "needs_review" | "low_priority" | "irrelevant",
    "priorityReason": "具體說明命中哪些股票/主題（繁體中文，<80字）",
    "matchedTickers": ["RKLB", "MSTR"],
    "matchedThemes": ["AI infrastructure", "bitcoin treasury"]
  },
  ...
]

評分規則：
- investmentRelevanceScore：純投資相關性（0=娛樂, 100=高度財經/市場/公司/產業）
- keywordMatchScore：與關鍵字池的具體命中程度（0=沒命中, 100=直接命中多個重要股票）
- freshnessScore：新鮮度（1天內=100, 7天=70, 14天=50, 30天=30）
- channelQualityScore：頻道品質（知名投資頻道=80-100, 一般=50-70）
- priorityScore = investmentRelevanceScore * 0.4 + keywordMatchScore * 0.5 + freshnessScore * 0.05 + channelQualityScore * 0.05
- priorityScore >= 75 → recommended
- 50-74 → needs_review
- 30-49 → low_priority
- < 30 → irrelevant

注意：
- 沒命中任何關鍵字的影片，keywordMatchScore 應該 < 30
- 即使是優質頻道，若標題與關鍵字無關，不能 recommended
- matchedTickers 和 matchedThemes 必須具體，不能空泛
- 標題是 short/clip/highlight/trailer/teaser 的打低分`;

  const anthropic = getAnthropicClient();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  type RankingItem = {
    index: number;
    investmentRelevanceScore: number;
    keywordMatchScore: number;
    freshnessScore: number;
    channelQualityScore: number;
    triageStatus: string;
    priorityReason: string;
    matchedTickers: string[];
    matchedThemes: string[];
  };

  let rankings: RankingItem[] = [];
  try {
    let raw = (msg.content[0] as { text: string }).text.trim();
    raw = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    rankings = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { ok: false, error: 'llm_json_parse_failed' },
      { status: 502 }
    );
  }

  const now = new Date();
  const results: Record<string, number> = {
    recommended: 0,
    needs_review: 0,
    low_priority: 0,
    irrelevant: 0,
  };

  for (const r of rankings) {
    const video = videos[r.index - 1];
    if (!video) continue;

    const priorityScore = Math.round(
      r.investmentRelevanceScore * 0.4 +
        r.keywordMatchScore * 0.5 +
        r.freshnessScore * 0.05 +
        r.channelQualityScore * 0.05
    );

    const triageStatus =
      priorityScore >= 75
        ? 'recommended'
        : priorityScore >= 50
          ? 'needs_review'
          : priorityScore >= 30
            ? 'low_priority'
            : 'irrelevant';

    results[triageStatus]++;

    await db.collection('expert_insights').updateOne(
      { _id: video._id },
      {
        $set: {
          triageStatus,
          priorityScore,
          investmentRelevanceScore: r.investmentRelevanceScore,
          keywordMatchScore: r.keywordMatchScore,
          freshnessScore: r.freshnessScore,
          channelQualityScore: r.channelQualityScore,
          priorityReason: r.priorityReason,
          matchedTickers: r.matchedTickers || [],
          matchedThemes: r.matchedThemes || [],
          rankedAt: now,
          rankingModel: MODEL,
          rankingInput: {
            marketContextRaw: marketContextRaw || '',
            manualKeywordsRaw: manualKeywordsRaw || '',
            useKeywordPool,
          },
        },
      }
    );
  }

  const top5 = videos
    .map((v, i) => {
      const r = rankings[i];
      if (!r) return null;
      const ps = Math.round(
        r.investmentRelevanceScore * 0.4 +
          r.keywordMatchScore * 0.5 +
          r.freshnessScore * 0.05 +
          r.channelQualityScore * 0.05
      );
      return {
        index: r.index,
        title: v.video_title || v.title,
        channel: v.channel,
        publishedAt: v.publish_date,
        priorityScore: ps,
        investmentRelevanceScore: r.investmentRelevanceScore,
        keywordMatchScore: r.keywordMatchScore,
        triageStatus:
          ps >= 75
            ? 'recommended'
            : ps >= 50
              ? 'needs_review'
              : ps >= 30
                ? 'low_priority'
                : 'irrelevant',
        priorityReason: r.priorityReason,
        matchedTickers: r.matchedTickers || [],
        matchedThemes: r.matchedThemes || [],
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) => ((b as any).priorityScore || 0) - ((a as any).priorityScore || 0)
    )
    .slice(0, topN);

  return NextResponse.json({
    ok: true,
    total: videos.length,
    keywordsUsed: allKeywords.length,
    results,
    top5,
  });
}
