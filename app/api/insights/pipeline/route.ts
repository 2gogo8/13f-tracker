import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import Anthropic from '@anthropic-ai/sdk';

const ADMIN_KEY = process.env.ADMIN_KEY;

// ── Types ────────────────────────────────────────────────────────────────────
interface TopicInput {
  label: string;
  symbols: string[];
  headlines: string[];
  score: number;
}
interface TranscriptInput {
  videoId: string; title: string; channel: string; topic: string; transcript: string;
}
interface VideoSummaryInput {
  videoId: string; title: string; channel: string; short: string;
  published: string; transcript: string;
}

// ── Shared Claude client ─────────────────────────────────────────────────────
function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ── Hot-topic article generator ──────────────────────────────────────────────
async function generateHotTopicArticle(
  topic: string, symbols: string[], headlines: string[],
  transcripts: TranscriptInput[]
): Promise<{ title: string; article: string }> {
  const client = getClient();
  const headlineText = headlines.slice(0, 8).map((h, i) => `${i + 1}. ${h}`).join('\n');
  const transcriptText = transcripts.length > 0
    ? transcripts.map(t => `【${t.channel} - ${t.title}】\n${t.transcript.slice(0, 3000)}`).join('\n\n---\n\n')
    : '（本次無專家逐字稿，依新聞標題分析）';

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `你是 JG，台灣財經 YouTuber，用白話文解釋美股話題。

今日熱議話題：**${topic}**
相關股票：${symbols.join('、') || '（見文章）'}

今日新聞標題：
${headlineText}

專家內容：
${transcriptText}

請寫一篇繁體中文消費者文章：

# 文章標題（吸引人，30字以內）

結構：
1. Hook：今天發生什麼（數字開場）
2. 這波在嗨什麼（背景原因）
3. 現在還能買嗎（有根據的判斷）
4. 買了要盯什麼（三個追蹤訊號）

語氣直接有觀點，**粗體**標關鍵數字，股票用$格式。`,
    }],
  });

  const text = (msg.content[0] as { text: string }).text.trim();
  const lines = text.split('\n');
  let title = topic; let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('# ')) { title = lines[i].replace(/^# /, '').trim(); bodyStart = i + 1; break; }
  }
  return { title, article: lines.slice(bodyStart).join('\n').trim() };
}

// ── Channel video summary generator ─────────────────────────────────────────
async function generateVideoSummary(
  video: VideoSummaryInput
): Promise<{ topic: string; title: string; article: string }> {
  const client = getClient();

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `你是 JG，台灣財經 YouTuber。

頂級財經頻道「${video.channel}」最新影片：
標題：${video.title}
日期：${video.published}

逐字稿節錄：
${video.transcript.slice(0, 6000)}

請用 JG 口吻寫「每日好文」給台灣投資人：

# 文章標題（吸引人，點出核心洞見，30字以內）

## 這集在討論什麼
一段話說清楚背景

## 專家的核心論點
**時間軸**：這個議題怎麼發展到今天（附具體時間點）
**關鍵數字**：重要數據（用 **粗體** 標示）
**核心邏輯**：為什麼這樣判斷

## 對投資人的意義
影響投資思維的關鍵點，具體追蹤信號

語氣白話直接，股票用$格式。`,
    }],
  });

  const text = (msg.content[0] as { text: string }).text.trim();
  const lines = text.split('\n');
  let title = video.title; let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('# ')) { title = lines[i].replace(/^# /, '').trim(); bodyStart = i + 1; break; }
  }
  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
  const topic = `${video.short}·${today}`;
  return { topic, title, article: lines.slice(bodyStart).join('\n').trim() };
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (!ADMIN_KEY || auth !== `Bearer ${ADMIN_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: {
    topics?: TopicInput[];
    transcripts?: TranscriptInput[];
    video_summaries?: VideoSummaryInput[];
  } = await req.json();

  const { topics = [], transcripts = [], video_summaries = [] } = body;
  const client = await getClientPromise();
  const db = client.db('13f-tracker');
  const col = db.collection('summaries');

  const topicResults = [];
  const videoResults = [];

  // ── Process hot topics ───────────────────────────────────────────────────
  for (const topic of topics.slice(0, 4)) {
    const relevantTx = transcripts.filter(t => t.topic === topic.label);
    try {
      const { title, article } = await generateHotTopicArticle(
        topic.label, topic.symbols, topic.headlines, relevantTx
      );
      const doc = {
        topic: topic.label,
        tags: [topic.label, ...topic.symbols.slice(0, 3)],
        articleTitle: title, article,
        summary: { timelineAnalysis: '', keyNumbers: '', predictionVsReality: '' },
        source: 'auto',
        expertCount: relevantTx.length,
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        articleType: 'hot_topic',
        pipeline: { symbols: topic.symbols, score: topic.score, headlines: topic.headlines.slice(0, 5) },
      };
      await col.updateOne({ topic: topic.label }, { $set: doc }, { upsert: true });
      topicResults.push({ topic: topic.label, title, ok: true });
    } catch (err) {
      topicResults.push({ topic: topic.label, ok: false, error: String(err) });
    }
  }

  // ── Process video summaries ──────────────────────────────────────────────
  for (const video of video_summaries.slice(0, 6)) {
    try {
      const { topic, title, article } = await generateVideoSummary(video);
      const doc = {
        topic,
        tags: [video.short, video.channel],
        articleTitle: title, article,
        summary: { timelineAnalysis: '', keyNumbers: '', predictionVsReality: '' },
        source: 'video',
        expertCount: 1,
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        articleType: 'channel_summary',
        videoMeta: { videoId: video.videoId, channel: video.channel, originalTitle: video.title },
      };
      // Use videoId as unique key (one article per video)
      await col.updateOne(
        { 'videoMeta.videoId': video.videoId },
        { $set: doc },
        { upsert: true }
      );
      videoResults.push({ channel: video.channel, title, ok: true });
    } catch (err) {
      videoResults.push({ channel: video.channel, ok: false, error: String(err) });
    }
  }

  return NextResponse.json({ ok: true, results: topicResults, video_results: videoResults });
}
