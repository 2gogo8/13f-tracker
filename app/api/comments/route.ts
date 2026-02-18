import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

const commentsStore: Map<string, Array<{
  id: string;
  name: string;
  text: string;
  symbol: string;
  timestamp: number;
}>> = new Map();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const comment = await request.json();
    const { id, name, text, symbol, timestamp } = comment;

    if (!name || !text || !symbol) {
      trackApiCall('/api/comments', Date.now() - startTime, true);
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const existing = commentsStore.get(symbol) || [];
    existing.unshift({ id, name, text, symbol, timestamp });
    if (existing.length > 100) existing.length = 100;
    commentsStore.set(symbol, existing);

    if (DISCORD_WEBHOOK_URL) {
      try {
        await fetch(DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: `💬 新留言 — ${symbol}`,
              description: text,
              color: 0xC41E3A,
              fields: [
                { name: '暱稱', value: name, inline: true },
                { name: '股票', value: `[${symbol}](https://13f-tracker-gyb2.vercel.app/stock/${symbol})`, inline: true },
              ],
              timestamp: new Date(timestamp).toISOString(),
              footer: { text: 'JG的反市場報告書' },
            }],
          }),
        });
      } catch (e) {
        console.error('Discord webhook error:', e);
      }
    }

    trackApiCall('/api/comments', Date.now() - startTime, false);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Comment error:', error);
    trackApiCall('/api/comments', Date.now() - startTime, true);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  const makeResponse = (data: unknown) => {
    const res = NextResponse.json(data);
    res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60');
    res.headers.set('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60');
    trackApiCall('/api/comments', Date.now() - startTime, false);
    return res;
  };

  if (symbol) {
    return makeResponse(commentsStore.get(symbol) || []);
  }

  const all: Array<{ id: string; name: string; text: string; symbol: string; timestamp: number }> = [];
  commentsStore.forEach((comments) => all.push(...comments));
  all.sort((a, b) => b.timestamp - a.timestamp);
  return makeResponse(all);
}
