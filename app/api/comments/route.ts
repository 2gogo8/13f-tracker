import { NextResponse } from 'next/server';

// In-memory store for comments (persists during warm function)
// For production, use Vercel KV or a database
const commentsStore: Map<string, Array<{
  id: string;
  name: string;
  text: string;
  symbol: string;
  timestamp: number;
}>> = new Map();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export async function POST(request: Request) {
  try {
    const comment = await request.json();
    const { id, name, text, symbol, timestamp } = comment;

    if (!name || !text || !symbol) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Store in memory
    const existing = commentsStore.get(symbol) || [];
    existing.unshift({ id, name, text, symbol, timestamp });
    // Keep max 100 per symbol
    if (existing.length > 100) existing.length = 100;
    commentsStore.set(symbol, existing);

    // Send to Discord webhook if configured
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Comment error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// GET: Retrieve comments for a symbol (from memory)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (symbol) {
    return NextResponse.json(commentsStore.get(symbol) || []);
  }

  // Admin: get all comments
  const all: Array<{ id: string; name: string; text: string; symbol: string; timestamp: number }> = [];
  commentsStore.forEach((comments) => {
    all.push(...comments);
  });
  all.sort((a, b) => b.timestamp - a.timestamp);

  return NextResponse.json(all);
}
