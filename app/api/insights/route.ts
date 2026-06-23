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
      .toArray();

    return NextResponse.json(summaries);
  } catch (error) {
    console.error('GET /api/insights error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
