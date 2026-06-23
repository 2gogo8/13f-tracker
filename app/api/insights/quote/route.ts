import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import getClientPromise from '@/lib/mongodb';

const ADMIN_KEY = process.env.ADMIN_KEY;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (!ADMIN_KEY || auth !== `Bearer ${ADMIN_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { videoId, title, channel, transcript } = await req.json();
  if (!transcript) return NextResponse.json({ error: 'transcript required' }, { status: 400 });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `這是來自頂級財經 Podcast「${channel}」的逐字稿：

標題：${title}
逐字稿（節錄）：
${transcript.slice(0, 8000)}

請用繁體中文，以「語錄」格式生成一篇文章。格式嚴格如下：

# [受訪者姓名]說：（副標：[本集核心主題，15字以內]）

## 語錄一
「[從逐字稿挑出最有洞見的段落，翻譯成中文，3-5句，保留說話的語氣和溫度，像是他本人在說話]」

**這段話什麼意思？**
[用2-3句白話解釋核心洞見]

**結論：**
[對投資人的實際意義，1-2句，要有觀點]

---

## 語錄二
「[第二段有力的原話]」

**這段話什麼意思？**
[解釋]

**結論：**
[投資意義]

---

## 語錄三
「[第三段]」

**這段話什麼意思？**
[解釋]

**結論：**
[投資意義]

---

## 話題時間軸
**[話題名稱] 的發展脈絡：**
- [年份]：[關鍵事件]
- [年份]：[關鍵事件]
- [年份]：[關鍵事件]
- 現在（2026）：[目前狀態與意義]

**注意：**
- 受訪者姓名從逐字稿中辨識
- 語錄翻成中文但保留說話感
- 時間軸要有具體年份
- 文章整體不超過1000字`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  });

  const article = (msg.content[0] as { text: string }).text.trim();

  // Extract title from first line
  const firstLine = article.split('\n')[0];
  const articleTitle = firstLine.replace(/^#+\s*/, '').trim();

  // Save to summaries collection
  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
  const topic = `${channel.split(' ').pop()}·語錄·${today}`;

  const dbClient = await getClientPromise();
  const db = dbClient.db('13f-tracker');
  await db.collection('summaries').updateOne(
    { 'videoMeta.videoId': videoId },
    {
      $set: {
        topic,
        tags: [channel, '語錄'],
        articleTitle,
        article,
        summary: { timelineAnalysis: '', keyNumbers: '', predictionVsReality: '' },
        source: 'video',
        articleType: 'quote',
        expertCount: 1,
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        videoMeta: { videoId, channel, originalTitle: title },
      }
    },
    { upsert: true }
  );

  return NextResponse.json({ ok: true, topic, articleTitle, preview: article.slice(0, 300) });
}
