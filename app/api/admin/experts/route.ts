import { NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

function checkAdminKey(request: Request): boolean {
  const auth = request.headers.get('Authorization') || '';
  const key = auth.replace('Bearer ', '').trim();
  return key === process.env.ADMIN_KEY;
}

export async function POST(request: Request) {
  if (!checkAdminKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const experts = Array.isArray(body) ? body : [body];

    const client = await getClientPromise();
    const db = client.db('13f-tracker');

    const docs = experts.map((e: Record<string, unknown>) => ({
      ...e,
      interviews: e.interviews || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await db.collection('experts').insertMany(docs);
    return NextResponse.json({ inserted: result.insertedCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('POST /api/admin/experts error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
