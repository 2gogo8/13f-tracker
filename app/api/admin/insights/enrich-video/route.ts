import { NextRequest, NextResponse } from 'next/server'
import { checkAdminStatus } from '@/lib/admin'
import getClientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import Anthropic from '@anthropic-ai/sdk'
import { YoutubeTranscript } from 'youtube-transcript'

// 投資相關關鍵詞判斷（寬鬆，只過濾明確無關）
const INVESTMENT_KEYWORDS = ['market', 'stock', 'invest', 'fund', 'capital', 'finance', 'economy', 'startup', 'vc', 'ai', 'tech', 'inflation', 'fed', 'bitcoin', 'crypto', 'revenue', 'ipo', 'merger', 'acquisition', 'valuation', 'profit', 'earnings', 'portfolio', 'asset', 'bond', 'equity', 'trading', 'hedge', 'venture', 'enterprise', 'growth', 'disruption', 'competition', 'regulation', 'policy']
const IRRELEVANT_KEYWORDS = ['recipe', 'cooking', 'fitness', 'workout', 'makeup', 'fashion', 'celebrity', 'sports team', 'gaming', 'anime']

function isInvestmentRelevant(title: string, channel: string): boolean {
  const combined = (title + ' ' + channel).toLowerCase()
  const hasIrrelevant = IRRELEVANT_KEYWORDS.some(k => combined.includes(k))
  if (hasIrrelevant) return false
  const hasInvestment = INVESTMENT_KEYWORDS.some(k => combined.includes(k))
  // 對已知投資頻道（All-In, ARK, a16z, Odd Lots, Sequoia, Norges）寬鬆通過
  const knownChannels = ['all-in', 'ark', 'a16z', 'odd lots', 'sequoia', 'norges', 'bloomberg', 'ark invest']
  const isKnownChannel = knownChannels.some(c => combined.includes(c))
  return hasInvestment || isKnownChannel
}

export async function POST(req: NextRequest) {
  // Admin-only
  const auth = await checkAdminStatus()
  if (auth.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { expertInsightId } = await req.json()
  if (!expertInsightId) return NextResponse.json({ error: 'expertInsightId required' }, { status: 400 })

  const client = await getClientPromise()
  const db = client.db('13f-tracker')
  const doc = await db.collection('expert_insights').findOne({ _id: new ObjectId(expertInsightId) })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const youtubeId = doc.youtube_id as string || ''
  const title = doc.video_title as string || doc.title as string || ''
  const channel = doc.channel as string || ''
  const now = new Date()

  // youtube_id 必須存在且不是 manual_ 開頭
  if (!youtubeId || youtubeId.startsWith('manual_')) {
    await db.collection('expert_insights').updateOne(
      { _id: new ObjectId(expertInsightId) },
      { $set: { enrichmentStatus: 'transcript_unavailable', enrichmentError: 'no_valid_youtube_id', enrichedAt: now } }
    )
    return NextResponse.json({ ok: false, enrichmentStatus: 'transcript_unavailable', reason: 'no_valid_youtube_id' }, { status: 400 })
  }

  // title 前置判斷
  if (!isInvestmentRelevant(title, channel)) {
    await db.collection('expert_insights').updateOne(
      { _id: new ObjectId(expertInsightId) },
      { $set: { enrichmentStatus: 'irrelevant', skippedReason: 'title_not_investment_related', enrichedAt: now } }
    )
    return NextResponse.json({ ok: false, enrichmentStatus: 'irrelevant', reason: 'title_not_investment_related' }, { status: 400 })
  }

  // 抓 transcript
  let transcriptLines: { text: string }[] = []
  try {
    transcriptLines = await YoutubeTranscript.fetchTranscript(youtubeId, { lang: 'en' })
  } catch {
    // 嘗試不指定語言
    try {
      transcriptLines = await YoutubeTranscript.fetchTranscript(youtubeId)
    } catch (e2) {
      await db.collection('expert_insights').updateOne(
        { _id: new ObjectId(expertInsightId) },
        { $set: { enrichmentStatus: 'transcript_unavailable', enrichmentError: String(e2), enrichedAt: now } }
      )
      return NextResponse.json({ ok: false, enrichmentStatus: 'transcript_unavailable', reason: 'transcript_fetch_failed' }, { status: 400 })
    }
  }

  const fullTranscript = transcriptLines.map(l => l.text).join(' ')
  const transcriptSample = fullTranscript.slice(0, 600)
  const transcriptForLLM = fullTranscript.slice(0, 7000)
  const transcriptLength = fullTranscript.length
  const transcriptSegments = transcriptLines.length

  // 短內容 gate
  const titleLower = title.toLowerCase()
  const isTitleShort = /\b(shorts?|clip|highlight|trailer|teaser)\b/.test(titleLower)
  const isUrlShort = (doc.source_url as string || '').includes('/shorts/')

  const isTooShort =
    isUrlShort ||
    isTitleShort ||
    transcriptSegments < 50 ||
    transcriptLength < 3000

  if (isTooShort) {
    await db.collection('expert_insights').updateOne(
      { _id: new ObjectId(expertInsightId) },
      {
        $set: {
          enrichmentStatus: 'transcript_too_short',
          transcriptLength,
          transcriptSegments,
          skippedReason: 'transcript_too_short',
          enrichedAt: now,
          transcriptFetchedAt: now,
        }
      }
    )
    return NextResponse.json(
      {
        ok: false,
        enrichmentStatus: 'transcript_too_short',
        reason: 'transcript_too_short',
        transcriptLength,
        transcriptSegments,
      },
      { status: 400 }
    )
  }

  // LLM 抽 key_insights
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const MODEL = 'claude-sonnet-4-5'

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: '你是一個財經分析助理，只回傳 JSON，不加任何解釋文字。',
    messages: [{
      role: 'user',
      content: `頻道：${channel}
影片標題：${title}
逐字稿節錄：
${transcriptForLLM}

請從逐字稿中抽取 6-8 條 key_insights。
每條必須：
- 具體，跟投資/市場/公司/產業有關
- 不含 [music]、like、subscribe、寒暄、空泛句
- 說話者的實質觀點或數據

只回傳 JSON array：
["insight 1", "insight 2", ...]`
    }]
  })

  let keyInsights: string[] = []
  try {
    const raw = (msg.content[0] as { text: string }).text.trim()
    keyInsights = JSON.parse(raw)
    // 過濾無效
    keyInsights = keyInsights.filter(k =>
      typeof k === 'string' &&
      k.length > 20 &&
      !k.match(/\[music\]/i) &&
      !k.match(/\b(like|subscribe|subscrib)\b/i)
    )
  } catch {
    // JSON parse 失敗，寫 error
    await db.collection('expert_insights').updateOne(
      { _id: new ObjectId(expertInsightId) },
      { $set: { enrichmentStatus: 'error', enrichmentError: 'llm_json_parse_failed', enrichedAt: now } }
    )
    return NextResponse.json({ ok: false, enrichmentStatus: 'error', reason: 'llm_json_parse_failed' }, { status: 500 })
  }

  // 寫回
  await db.collection('expert_insights').updateOne(
    { _id: new ObjectId(expertInsightId) },
    {
      $set: {
        key_insights: keyInsights,
        transcript_sample: transcriptSample,
        transcriptFetchedAt: now,
        enrichmentStatus: 'enriched',
        enrichedAt: now,
        enrichmentModel: MODEL,
        sourceQuality: 'youtube_transcript',
        transcriptLength,
        keyInsightsCount: keyInsights.length,
        enrichmentError: null,
      }
    }
  )

  return NextResponse.json({
    ok: true,
    expertInsightId,
    enrichmentStatus: 'enriched',
    keyInsightsCount: keyInsights.length,
    transcriptAvailable: true,
    transcriptLength,
    keyInsightsSample: keyInsights.slice(0, 2),
  })
}
