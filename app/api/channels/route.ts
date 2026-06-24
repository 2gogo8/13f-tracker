import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import getClientPromise from '@/lib/mongodb';

// GET /api/channels — list all channels (no auth required, not sensitive)
export async function GET() {
  try {
    const client = await getClientPromise();
    const channels = await client
      .db('13f-tracker')
      .collection('channels')
      .find({})
      .sort({ addedAt: -1 })
      .toArray();
    return NextResponse.json({ ok: true, channels });
  } catch (error) {
    console.error('GET /api/channels error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/channels — add a channel (requires session)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

    const type =
      url.includes('youtube.com') || url.includes('youtu.be') ? 'youtube' : 'podcast';

    const client = await getClientPromise();
    const col = client.db('13f-tracker').collection('channels');

    const existing = await col.findOne({ url });
    if (existing) return NextResponse.json({ ok: true, channel: existing, duplicate: true });

    const doc = {
      name: url,
      short: '',
      type,
      url,
      channelId: '',
      rssUrl: '',
      active: true,
      lastProcessedId: null,
      lastProcessedAt: null,
      lastCheckedAt: null,
      addedAt: new Date().toISOString(),
      addedBy: 'web-backend',
      episodeCount: 0,
    };

    await col.insertOne(doc);
    return NextResponse.json({ ok: true, channel: doc, duplicate: false });
  } catch (error) {
    console.error('POST /api/channels error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/channels?url=... — soft delete (requires session)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

    const client = await getClientPromise();
    await client
      .db('13f-tracker')
      .collection('channels')
      .updateOne({ url }, { $set: { active: false } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/channels error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
