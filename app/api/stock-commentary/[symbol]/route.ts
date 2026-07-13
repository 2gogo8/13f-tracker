import { NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

/**
 * GET /api/stock-commentary/[symbol]
 *
 * Returns today's AI commentary for the given symbol from MongoDB.
 * Returns null if no commentary found for today.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();
  const today = new Date().toISOString().split('T')[0];

  try {
    const client = await getClientPromise();
    const db = client.db('13f-tracker');
    const doc = await db.collection('stock_news_commentary').findOne(
      { symbol: upperSymbol, date: today },
      { projection: { _id: 0, symbol: 1, date: 1, news: 1, commentary: 1, generated_at: 1 } }
    );

    if (!doc) {
      return NextResponse.json(null, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' },
      });
    }

    return NextResponse.json(doc, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=1800' },
    });
  } catch (error) {
    console.error(`[stock-commentary] Error for ${upperSymbol}:`, error);
    return NextResponse.json(null);
  }
}
