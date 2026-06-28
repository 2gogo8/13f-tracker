import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

type Action = 'unpublish' | 'archive' | 'reject' | 'restore' | 'updateMetadata';
type TargetType = 'summary' | 'expert_insight';

export async function POST(req: NextRequest) {
  const authResult = await checkAdminStatus();
  if (authResult.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authResult.status === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { id, type = 'summary', action, reviewNote, metadata } = body as {
    id: string;
    type?: TargetType;
    action: Action;
    reviewNote?: string;
    metadata?: Record<string, unknown>;
  };

  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  const colName = type === 'expert_insight' ? 'expert_insights' : 'summaries';
  const now = new Date().toISOString();

  let update: Record<string, unknown> = {};

  switch (action) {
    case 'unpublish':
      update = { status: 'unpublished', alphaReady: false, unpublishedAt: now, updatedAt: now };
      break;
    case 'archive':
      update = { status: 'archived', alphaReady: false, archivedAt: now, updatedAt: now };
      break;
    case 'reject':
      update = {
        status: 'rejected',
        alphaReady: false,
        rejectedAt: now,
        updatedAt: now,
        ...(reviewNote ? { reviewNote } : {}),
      };
      break;
    case 'restore':
      // restore → candidate, clear status dates
      break;
    case 'updateMetadata': {
      if (!metadata) return NextResponse.json({ error: 'metadata required for updateMetadata' }, { status: 400 });
      const allowed = ['displaySection', 'sortOrder', 'isPinned', 'articleType', 'tags', 'jgTitle', 'reviewNote'];
      const filtered: Record<string, unknown> = { updatedAt: now };
      for (const key of allowed) {
        if (key in metadata) filtered[key] = metadata[key];
      }
      update = filtered;
      break;
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  let updateOp: Record<string, unknown>;

  if (action === 'restore') {
    updateOp = {
      $set: { status: 'candidate', alphaReady: false, updatedAt: now },
      $unset: { rejectedAt: '', archivedAt: '', unpublishedAt: '' },
    };
  } else {
    updateOp = { $set: update };
  }

  const result = await db.collection(colName).updateOne({ _id: objectId }, updateOp);

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, action, id });
}
