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

請分兩步驟：

**步驟一：辨識受訪者**
從逐字稿中找出受訪者的全名和職稱/身份（不是主持人）。

**步驟二：用以下格式生成繁體中文語錄文章：**

# [受訪者全名]（*[職稱/身份，例如：Benchmark Capital 合夥人]*）

> 本集主題：[15字以內核心主題]

---

## 語錄一
**[受訪者姓（名字最後一個姓）]說：**
「[從逐字稿挑出最有洞見的段落，翻譯成流暢中文，3-5句，保留說話語氣，像他本人在說話]」

**這段話的意思：**
[白話解釋這段話的核心洞見，2-3句]

**對投資人的意義：**
[具體啟示，1-2句，有觀點不廢話]

---

## 語錄二
**[受訪者姓]說：**
「[第二段有力原話]」

**這段話的意思：**
[解釋]

**對投資人的意義：**
[啟示]

---

## 語錄三
**[受訪者姓]說：**
「[第三段]」

**這段話的意思：**
[解釋]

**對投資人的意義：**
[啟示]

---

## 話題時間軸
**[話題名稱] 發展脈絡：**
- [年份]：[關鍵事件]
- [年份]：[關鍵事件]
- [年份]：[關鍵事件]
- 2026年至今：[目前狀態與重要性]

**格式規則：**
- 受訪者全名必須從逐字稿辨識，不要用頻道名稱
- 每次「XXX說：」前面的名字用粗體
- 職稱用斜體（Markdown *斜體*）
- 語錄翻中文但保留說話感
- 文章不超過1000字`;

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
