import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import getClientPromise from '@/lib/mongodb';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const client = await getClientPromise();
    const db = client.db('13f-tracker');
    const { searchParams } = new URL(request.url);
    const tag = searchParams.get('tag');

    const filter = tag ? { tags: tag } : {};
    const experts = await db
      .collection('experts')
      .find(filter)
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json(experts);
  } catch (error) {
    console.error('GET /api/experts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, title, organization, bio, tags, interviews } = body;

    if (!name || !title || !organization) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const client = await getClientPromise();
    const db = client.db('13f-tracker');
    const now = new Date();

    const doc = {
      name,
      title,
      organization,
      bio: bio || '',
      tags: tags || [],
      interviews: interviews || [],
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('experts').insertOne(doc);

    return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 });
  } catch (error) {
    console.error('POST /api/experts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
