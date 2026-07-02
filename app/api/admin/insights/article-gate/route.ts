import { NextRequest, NextResponse } from 'next/server'
import { checkAdminStatus } from '@/lib/admin'
import getClientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  const auth = await checkAdminStatus()
  if (auth.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { expertInsightId } = await req.json()
  if (!expertInsightId) return NextResponse.json({ error: 'expertInsightId required' }, { status: 400 })

  const client = await getClientPromise()
  const db = client.db('13f-tracker')

  const doc = await db.collection('expert_insights').findOne({ _id: new ObjectId(expertInsightId) })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 必須已 enriched（相容新 worker 的 status:'ready'）
  if (doc.enrichmentStatus !== 'enriched' && doc.status !== 'ready') {
    return NextResponse.json({ error: '素材尚未完整整理，請先讀取影片內容', status: doc.enrichmentStatus }, { status: 400 })
  }

  // 讀取 JG Keyword Pool（watchlist + jg_picks_manual + jg_picks_cache）
  const watchlistDocs = await db.collection('watchlist').find({}).toArray()
  const picksDocs = await db.collection('jg_picks_manual').find({}).toArray()
  const cachePicksDocs = await db.collection('jg_picks_cache').find({}).limit(30).toArray()

  const watchlistTickers = watchlistDocs.map(d => d.symbol || d.ticker || '').filter(Boolean)
  const picksAllTickers = [...picksDocs, ...cachePicksDocs].map(d => d.symbol || d.ticker || '').filter(Boolean)
  const keywordPool = [...new Set([...watchlistTickers, ...picksAllTickers])]

  // 組 prompt
  const kiText = (doc.key_insights as string[] || []).slice(0, 8).map((k, i) => `${i+1}. ${k}`).join('\n')
  const MODEL = 'claude-sonnet-4-5'
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: '你是 JG 的財經編輯助理。你必須只回傳 valid JSON object，不加任何解釋文字或 markdown。',
    messages: [{
      role: 'user',
      content: `你的任務是判斷以下財經影片素材是否值得成為 JG（台灣財經 YouTuber）的正式候選文章。

JG 的關注標的（Keyword Pool）：
${keywordPool.slice(0, 40).join(', ')}

影片資訊：
- 標題：${(doc.video_title || doc.title || '') as string}
- 頻道：${doc.channel as string || ''}
- 日期：${doc.publish_date as string || ''}
- 主題：${doc.topic as string || ''}

Key Insights（來自完整逐字稿）：
${kiText}

JG 的核心關注方向：
- 美股選股：AI相關（NVDA、MSTR、PLTR等）、高成長科技、回檔機會
- 投資哲學：數據驅動、反市場觀點、長期持有的判斷依據
- 會員轉化：能讓會員看完後覺得「這值得」、「這幫我節省了研究時間」
- 產業主線：AI基礎設施、能源、太空、網路安全、比特幣相關

請評估並回傳 JSON：
{
  "articleWorthinessScore": 0-100,
  "articleDecision": "draft_candidate" | "material_only" | "reject",
  "articleReason": "具體說明判斷理由（繁體中文，3-5句）",
  "matchedStocks": ["命中的 JG keyword pool 股票，若無則 []"],
  "matchedThemes": ["命中的主題方向，若無則 []"],
  "matchedPhilosophy": "是否延伸 JG 的投資哲學（1句）",
  "matchedBusinessIdeas": "是否能連到 JG 的經營理念（1句）",
  "suggestedUse": "建議如何使用這個素材（1-2句）"
}

評分標準：
- >= 75 → draft_candidate（強關聯，可直接成文）
- 50-74 → material_only（有研究價值，但不是現在要寫的文章）
- < 50 → reject（投資相關性弱，或與 JG 主線距離太遠）

注意：
- 不要因為影片整理品質好就給高分
- 要看的是：這個素材跟 JG 現在的選股主線、回檔標的、投資哲學有多強的關聯
- GameStop / Ryan Cohen / eBay 是資本配置故事，但跟 JG 目前的 AI/科技/能源主線距離較遠
- 有資本配置價值但不是 JG 現在要寫的文章 → material_only`
    }]
  })

  const rawText = (msg.content[0] as { text: string }).text.trim()
  let result: Record<string, unknown>
  try {
    result = JSON.parse(rawText)
  } catch {
    return NextResponse.json({ ok: false, error: 'llm_json_parse_failed' }, { status: 502 })
  }

  const score = result.articleWorthinessScore as number || 0
  const decision = score >= 75 ? 'draft_candidate' : score >= 50 ? 'material_only' : 'reject'

  const now = new Date()
  await db.collection('expert_insights').updateOne(
    { _id: new ObjectId(expertInsightId) },
    {
      $set: {
        articleWorthinessScore: score,
        articleDecision: decision,
        articleReason: result.articleReason || '',
        matchedStocks: result.matchedStocks || [],
        matchedThemes: result.matchedThemes || [],
        matchedPhilosophy: result.matchedPhilosophy || '',
        matchedBusinessIdeas: result.matchedBusinessIdeas || '',
        suggestedUse: result.suggestedUse || '',
        articleGateCheckedAt: now,
        articleGateModel: MODEL,
      }
    }
  )

  return NextResponse.json({
    ok: true,
    expertInsightId,
    articleWorthinessScore: score,
    articleDecision: decision,
    articleReason: result.articleReason,
    matchedStocks: result.matchedStocks,
    matchedThemes: result.matchedThemes,
    matchedPhilosophy: result.matchedPhilosophy,
    matchedBusinessIdeas: result.matchedBusinessIdeas,
    suggestedUse: result.suggestedUse,
  })
}
