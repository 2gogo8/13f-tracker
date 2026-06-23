import { NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    const client = await getClientPromise();
    const db = client.db('13f-tracker');

    const summaries = await db
      .collection('summaries')
      .find({})
      .sort({ publishedAt: -1 })
      .limit(limit)
      .project({
        tags: 1,
        source: 1,
        topic: 1,
        summary: 1,
        article: 1,
        articleTitle: 1,
        expertCount: 1,
        publishedAt: 1,
        createdAt: 1,
      })
      .toArray();

    const res = NextResponse.json(summaries);
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    return res;
  } catch (error) {
    console.error('GET /api/insights error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
