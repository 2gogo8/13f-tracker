import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import Anthropic from '@anthropic-ai/sdk';

const ADMIN_KEY = process.env.ADMIN_KEY;

interface PipelineRequest {
  topics: Array<{
    label: string;          // e.g. "半導體賣壓"
    symbols: string[];      // e.g. ["MU","SNDK"]
    headlines: string[];    // source headlines
    score: number;          // mention count
  }>;
  transcripts?: Array<{
    videoId: string;
    title: string;
    channel: string;
    topic: string;
    transcript: string;
  }>;
}

async function generateArticle(
  topic: string,
  symbols: string[],
  headlines: string[],
  transcripts: Array<{ title: string; channel: string; transcript: string }>
): Promise<{ title: string; article: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const headlineText = headlines.slice(0, 8).map((h, i) => `${i + 1}. ${h}`).join('\n');
  const transcriptText = transcripts.length > 0
    ? transcripts.map(t => `【${t.channel} - ${t.title}】\n${t.transcript.slice(0, 3000)}`).join('\n\n---\n\n')
    : '（本次無專家逐字稿，依新聞標題分析）';

  const prompt = `你是 JG，一位台灣財經 YouTuber，擅長用白話文解釋美股複雜話題。

今天的市場熱議話題：**${topic}**
相關股票：${symbols.join('、')}

今天的主要新聞標題：
${headlineText}

專家/媒體原始內容：
${transcriptText}

請用 JG 的口吻寫一篇繁體中文消費者文章，格式如下：

# 文章標題（吸引人，點出話題核心，30字以內）

（文章本文，約 800-1000 字）

結構要包含：
1. Hook：今天發生了什麼（用數字或衝突感開頭）
2. 這波到底在嗨什麼？（解釋背景和原因）
3. 現在還能買嗎？（給出有根據的判斷）
4. 進場了要盯什麼？（三個具體追蹤訊號）

語氣：直接、有觀點、不廢話。不要用「首先」「其次」這種生硬詞。
用 **粗體** 標出關鍵數字和結論。
股票代碼保留英文（$MU、$IONQ 等格式）。`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const fullText = (msg.content[0] as { text: string }).text.trim();
  
  // Extract title (first # line) and body
  const lines = fullText.split('\n');
  let title = topic;
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('# ')) {
      title = lines[i].replace(/^# /, '').trim();
      bodyStart = i + 1;
      break;
    }
  }
  const article = lines.slice(bodyStart).join('\n').trim();

  return { title, article };
}

export async function POST(req: NextRequest) {
  // Auth
  const auth = req.headers.get('authorization') || '';
  if (!ADMIN_KEY || auth !== `Bearer ${ADMIN_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: PipelineRequest = await req.json();
  const { topics, transcripts = [] } = body;

  if (!topics || topics.length === 0) {
    return NextResponse.json({ error: 'No topics provided' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');
  const col = db.collection('summaries');

  const results = [];

  // Process top 2 topics max per run
  for (const topic of topics.slice(0, 4)) {
    const relevantTranscripts = transcripts.filter(t => t.topic === topic.label);

    try {
      const { title, article } = await generateArticle(
        topic.label,
        topic.symbols,
        topic.headlines,
        relevantTranscripts
      );

      // Upsert: same topic label → replace
      const doc = {
        topic: topic.label,
        tags: [topic.label, ...topic.symbols.slice(0, 3)],
        articleTitle: title,
        article,
        summary: { timelineAnalysis: '', keyNumbers: '', predictionVsReality: '' },
        source: 'auto' as const,
        expertCount: relevantTranscripts.length,
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        pipeline: {
          symbols: topic.symbols,
          score: topic.score,
          headlines: topic.headlines.slice(0, 5),
          hasTranscripts: relevantTranscripts.length > 0,
        },
      };

      await col.updateOne(
        { topic: topic.label },
        { $set: doc },
        { upsert: true }
      );

      results.push({ topic: topic.label, title, ok: true });
    } catch (err) {
      results.push({ topic: topic.label, ok: false, error: String(err) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
