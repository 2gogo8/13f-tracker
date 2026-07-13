import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import getClientPromise from '@/lib/mongodb';

/**
 * GET /api/cron/stock-news
 *
 * Vercel Cron job — runs daily at 01:00 UTC (09:00 台灣時間).
 * For each tracked stock:
 *   1. Fetch latest 5 news from FMP
 *   2. Generate JG-style commentary via Claude Haiku
 *   3. Upsert into MongoDB `stock_news_commentary`
 *
 * Protected by CRON_SECRET bearer token.
 */

export const maxDuration = 300;

const SYMBOLS = [
  'AAPL', 'AEVA', 'ALLO', 'AMD', 'ANET', 'APLD', 'ARES', 'ARQT', 'ASML', 'ASTS',
  'AVGO', 'AXTI', 'BABA', 'BEAM', 'BEPC', 'BX', 'CACI', 'CCJ', 'CDNS', 'COIN',
  'CRDO', 'CRM', 'CRSP', 'CRWD', 'DDOG', 'DXYZ', 'EDIT', 'ETN', 'GEV', 'GOOGL',
  'HOOD', 'HUBS', 'IBRX', 'INTC', 'LEU', 'META', 'MP', 'MRVL', 'MSTR', 'MU',
  'MSFT', 'NFLX', 'NOC', 'NOW', 'NTLA', 'NVDA', 'OKLO', 'ORCL', 'PANW', 'PLTR',
  'PNR', 'QCOM', 'RKLB', 'RYTM', 'SERV', 'SMCI', 'SMR', 'SNPS', 'TSLA', 'TSM',
  'VRT', 'VRTX', 'XYL', 'ZS',
];

const FMP_KEY = process.env.FMP_API_KEY || '';

async function fetchNewsForSymbol(symbol: string): Promise<{ title: string; publishedDate: string; url: string }[]> {
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/news/stock?symbols=${symbol}&limit=5&apikey=${FMP_KEY}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.slice(0, 5).map((item: any) => ({
      title: item.title || '',
      publishedDate: item.publishedDate || item.date || '',
      url: item.url || item.link || '',
    }));
  } catch {
    return [];
  }
}

async function generateCommentary(symbol: string, news: { title: string; publishedDate: string; url: string }[]): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const newsList = news
    .map(n => `- [${n.publishedDate?.split('T')[0] || ''}] ${n.title}`)
    .join('\n');

  const prompt = `你是 JG，台灣財經 YouTuber，用白話文解釋美股給台灣投資人看。

股票：${symbol}
近期新聞：
${newsList}

請用 JG 口吻寫「今日點評」給會員（繁體中文，150字以內，直接有觀點，最後附 1-2 個追蹤重點）：`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  return content.type === 'text' ? content.text : '';
}

export async function GET(req: NextRequest) {
  // 1. Verify CRON_SECRET
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');
  const collection = db.collection('stock_news_commentary');

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const results: { symbol: string; status: string }[] = [];

  for (const symbol of SYMBOLS) {
    try {
      // Fetch news
      const news = await fetchNewsForSymbol(symbol);
      if (news.length === 0) {
        results.push({ symbol, status: 'no-news' });
        continue;
      }

      // Generate commentary
      const commentary = await generateCommentary(symbol, news);

      // Upsert into MongoDB
      await collection.updateOne(
        { symbol, date: today },
        {
          $set: {
            symbol,
            date: today,
            news,
            commentary,
            generated_at: new Date().toISOString(),
          },
        },
        { upsert: true }
      );

      results.push({ symbol, status: 'ok' });
    } catch (err) {
      console.error(`[stock-news cron] Error for ${symbol}:`, (err as Error).message);
      results.push({ symbol, status: `error: ${(err as Error).message}` });
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const errors = results.filter(r => r.status.startsWith('error'));

  return NextResponse.json({
    ok: true,
    date: today,
    processed: results.length,
    succeeded: ok,
    noNews: results.filter(r => r.status === 'no-news').length,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  });
}
