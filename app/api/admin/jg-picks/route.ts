import { NextRequest, NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';

const FMP_KEY = process.env.FMP_API_KEY || '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const FMP_BASE = 'https://financialmodelingprep.com';
const DB = '13f-tracker';
const MANUAL_COL = 'jg_picks_manual';
const CACHE_COL = 'jg_picks_cache';

// ── FMP helpers ───────────────────────────────────────────────────────────────
async function fmpEOD(symbol: string): Promise<Array<{ date: string; close: number }>> {
  const from = new Date(Date.now() - 600 * 86400000).toISOString().slice(0, 10);
  const url = `${FMP_BASE}/stable/historical-price-eod/full?symbol=${symbol}&from=${from}&apikey=${FMP_KEY}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data)
    ? data.filter((r: { date?: string; close?: number }) => r.date && r.close != null)
            .map((r: { date: string; close: number }) => ({ date: r.date, close: r.close }))
    : [];
}

function findClosestOnOrAfter(records: Array<{ date: string; close: number }>, targetDate: string) {
  // Find the earliest date >= targetDate (mention close)
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const hit = sorted.find(r => r.date >= targetDate);
  return hit ?? null;
}

function findLatest(records: Array<{ date: string; close: number }>) {
  if (!records.length) return null;
  return records.reduce((a, b) => (a.date > b.date ? a : b));
}

// ── GET: list all manual picks ────────────────────────────────────────────────
export async function GET() {
  const authGet = await checkAdminStatus();
  if (authGet.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (authGet.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const client = await getClientPromise();
    const picks = await client
      .db(DB)
      .collection(MANUAL_COL)
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    return NextResponse.json({ ok: true, picks });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── POST: add a new pick ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await checkAdminStatus();
  if (auth.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const symbol: string = (body.symbol || '').toUpperCase().trim();
  const mentionDate: string = (body.mentionDate || '').trim();
  const note: string = (body.note || '').trim();
  const source: string = (body.source || 'manual').trim();

  // Validate
  if (!symbol || !/^[A-Z0-9]{1,10}$/.test(symbol)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }
  if (!mentionDate || !/^\d{4}-\d{2}-\d{2}$/.test(mentionDate)) {
    return NextResponse.json({ error: 'Invalid mentionDate (YYYY-MM-DD required)' }, { status: 400 });
  }

  // Fetch EOD history from FMP
  const records = await fmpEOD(symbol);
  if (!records.length) {
    return NextResponse.json({ error: `No FMP data for ${symbol}` }, { status: 422 });
  }

  const mentionHit = findClosestOnOrAfter(records, mentionDate);
  if (!mentionHit) {
    return NextResponse.json({ error: `No price on or after ${mentionDate} for ${symbol}` }, { status: 422 });
  }

  const latest = findLatest(records);
  if (!latest) {
    return NextResponse.json({ error: 'No latest price' }, { status: 422 });
  }

  const performancePct = Math.round(((latest.close - mentionHit.close) / mentionHit.close) * 10000) / 100;
  const now = new Date().toISOString();

  const doc = {
    symbol,
    mentionDate,
    note,
    source,
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: auth.email || 'admin',
    mentionClose: mentionHit.close,
    mentionCloseDate: mentionHit.date,
    latestClose: latest.close,
    latestCloseDate: latest.date,
    performancePct,
    lastUpdatedAt: now,
    provider: 'FMP',
  };

  const client = await getClientPromise();
  const db = client.db(DB);

  // Save to jg_picks_manual
  const insertResult = await db.collection(MANUAL_COL).insertOne(doc);

  // Also upsert into jg_picks_cache so /insights shows it immediately
  await db.collection(CACHE_COL).updateOne(
    { symbol },
    {
      $set: {
        symbol,
        mentionDate,
        mentionClose: mentionHit.close,
        mentionCloseDate: mentionHit.date,
        latestClose: latest.close,
        latestCloseDate: latest.date,
        performancePct,
        lastUpdatedAt: now,
        source: 'manual',
        manualPickId: insertResult.insertedId,
      },
    },
    { upsert: true }
  );

  return NextResponse.json({ ok: true, pick: { _id: insertResult.insertedId, ...doc } });
}
