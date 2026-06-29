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

  // Ensure TTL index on video_transcripts（idempotent）
  try {
    const col = db.collection('video_transcripts')
    const indexes = await col.indexes()
    const hasTTL = indexes.some(idx => (idx.key as Record<string, unknown>)?.expiresAt === 1 || idx.expireAfterSeconds !== undefined)
    if (!hasTTL) {
      await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'video_transcripts_ttl' })
      console.log('[enrich-video] Created TTL index on video_transcripts.expiresAt')
    }
  } catch (e) {
    console.warn('[enrich-video] TTL index check skipped:', e)
  }

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

  const fullTranscript = transcriptLines.map((l: { text: string }) => l.text).join(' ')
  const transcriptLength = fullTranscript.length
  const transcriptSegments = transcriptLines.length
  const transcriptSample = fullTranscript.slice(0, 600)

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

  // 保存完整 transcript 到 video_transcripts
  const fetchedAt = new Date()
  const expiresAt = new Date(fetchedAt.getTime() + 30 * 24 * 60 * 60 * 1000) // +30 days

  const transcriptDoc = {
    youtube_id: youtubeId,
    video_title: title,
    channel: channel,
    publish_date: (doc.publish_date as string) || null,
    sourceExpertInsightId: expertInsightId,
    fullTranscript,
    transcriptSegments,
    transcriptLength,
    transcriptSource: 'youtube-transcript',
    fetchedAt,
    expiresAt,
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
  }

  // 去重：youtube_id 已存在就 reuse（updateOne with upsert）
  await db.collection('video_transcripts').updateOne(
    { youtube_id: youtubeId },
    { $set: transcriptDoc },
    { upsert: true }
  )

  const transcriptRef = `video_transcripts/${youtubeId}`
  const transcriptExpiresAt = expiresAt

  // Chunked key_insights 抽取
  const CHUNK_SIZE = 7000
  // 動態計算 totalChunks：transcript <= 80,000 字 → 100% coverage；> 80,000 字 → partial with warning
  const MAX_CHARS_FULL = 80000
  const totalChunks = Math.ceil(fullTranscript.length / CHUNK_SIZE)
  const isPartial = transcriptLength > MAX_CHARS_FULL
  const maxChunks = isPartial ? Math.ceil(MAX_CHARS_FULL / CHUNK_SIZE) : totalChunks
  const coverageMode = isPartial ? 'partial_with_warning' : 'full'
  const coverageWarning = isPartial
    ? `⚠️ 本次 key insights 僅覆蓋 ${Math.round((maxChunks / totalChunks) * 100)}% 逐字稿，可能遺漏後段內容`
    : null
  const chunks: string[] = []
  for (let i = 0; i < fullTranscript.length && chunks.length < maxChunks; i += CHUNK_SIZE) {
    chunks.push(fullTranscript.slice(i, i + CHUNK_SIZE))
  }
  const chunksProcessed = chunks.length
  const transcriptCoverageRatio = Math.min(1, Math.round((chunksProcessed / totalChunks) * 100) / 100)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const MODEL = 'claude-sonnet-4-5'

  // 每個 chunk 抽 partial insights（2-4 條）
  const allPartialInsights: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    try {
      const chunkMsg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 600,
        system: '你是財經分析助理，只回傳 JSON array，不加解釋文字。',
        messages: [{
          role: 'user',
          content: `這是逐字稿第 ${i + 1}/${chunks.length} 段：\n${chunks[i]}\n\n請從這段抽出 2-4 條投資/商業/產業相關的具體觀點。\n去除：[music]、like/subscribe、寒暄、空泛句。\n只回傳 JSON array：["觀點1", "觀點2", ...]`
        }]
      })
      const raw = (chunkMsg.content[0] as { text: string }).text.trim()
      const parsed: string[] = JSON.parse(raw.startsWith('[') ? raw : raw.replace(/^```json\n?/, '').replace(/```$/, ''))
      allPartialInsights.push(...parsed.filter(k => typeof k === 'string' && k.length > 20))
    } catch { /* skip failed chunk */ }
  }

  // 彙總成 6-8 條 final key_insights
  let keyInsights: string[] = []
  try {
    const summaryMsg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: '你是財經分析助理，只回傳 JSON array，不加解釋文字。',
      messages: [{
        role: 'user',
        content: `以下是從逐字稿各段抽出的觀點（共 ${allPartialInsights.length} 條）：\n${allPartialInsights.map((k, i) => `${i + 1}. ${k}`).join('\n')}\n\n請整合成 6-8 條最重要的 final key_insights。\n去除重複、空泛、非投資相關的內容。\n只回傳 JSON array：["final insight 1", ...]`
      }]
    })
    const raw = (summaryMsg.content[0] as { text: string }).text.trim()
    keyInsights = JSON.parse(raw.startsWith('[') ? raw : raw.replace(/^```json\n?/, '').replace(/```$/, ''))
    keyInsights = keyInsights.filter(k => typeof k === 'string' && k.length > 20 && !/\[music\]/i.test(k))
  } catch {
    // If summary fails but we have partial insights, use them
    if (allPartialInsights.length > 0) {
      keyInsights = allPartialInsights.slice(0, 8)
    }
  }

  if (keyInsights.length === 0 && allPartialInsights.length === 0) {
    await db.collection('expert_insights').updateOne(
      { _id: new ObjectId(expertInsightId) },
      { $set: { enrichmentStatus: 'error', enrichmentError: 'llm_no_insights_extracted', enrichedAt: now } }
    )
    return NextResponse.json({ ok: false, enrichmentStatus: 'error', reason: 'llm_no_insights_extracted' }, { status: 500 })
  }

  // 寫回 expert_insights
  await db.collection('expert_insights').updateOne(
    { _id: new ObjectId(expertInsightId) },
    {
      $set: {
        key_insights: keyInsights,
        transcript_sample: transcriptSample,
        transcriptRef,
        transcriptStored: true,
        transcriptFetchedAt: fetchedAt,
        transcriptLength,
        transcriptSegments,
        transcriptExpiresAt: transcriptExpiresAt.toISOString(),
        enrichmentStatus: 'enriched',
        enrichedAt: fetchedAt,
        enrichmentModel: MODEL,
        sourceQuality: 'youtube_transcript',
        insightExtractionMode: 'chunked_full_transcript',
        chunksProcessed,
        totalChunks,
        chunkSize: CHUNK_SIZE,
        transcriptCoverageRatio,
        coverageMode,
        coverageWarning,
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
    transcriptStored: true,
    insightExtractionMode: 'chunked_full_transcript',
    chunksProcessed,
    transcriptCoverageRatio: Math.round(transcriptCoverageRatio * 100) / 100,
    keyInsightsSample: keyInsights.slice(0, 2),
  })
}
