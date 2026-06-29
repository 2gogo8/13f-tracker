import { NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import getClientPromise from '@/lib/mongodb';

export async function GET() {
  const auth = await checkAdminStatus();
  if (auth.status === 'unauthenticated')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.status === 'forbidden')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const client = await getClientPromise();
  const db = client.db('13f-tracker');

  const sources: Array<{
    source: string;
    available: boolean;
    count: number;
    reason?: string;
  }> = [];
  const keywords: Array<{
    type: string;
    value: string;
    aliases: string[];
    source: string;
    weight: number;
  }> = [];

  // Watchlist (field = symbol, has name)
  try {
    const watchlistDocs = await db.collection('watchlist').find({}).toArray();
    sources.push({
      source: 'watchlist',
      available: true,
      count: watchlistDocs.length,
    });
    for (const doc of watchlistDocs) {
      const ticker = ((doc.symbol || doc.ticker || '') as string).trim();
      const name = ((doc.name || doc.companyName || '') as string).trim();
      if (ticker) {
        keywords.push({
          type: 'ticker',
          value: ticker,
          aliases: name ? [name] : [],
          source: 'watchlist',
          weight: 90,
        });
      }
    }
  } catch {
    sources.push({
      source: 'watchlist',
      available: false,
      count: 0,
      reason: 'collection_error',
    });
  }

  // JG Picks Manual (field = symbol, no name)
  try {
    const picksDocs = await db
      .collection('jg_picks_manual')
      .find({})
      .toArray();
    sources.push({
      source: 'jg_picks_manual',
      available: true,
      count: picksDocs.length,
    });
    for (const doc of picksDocs) {
      const ticker = ((doc.symbol || doc.ticker || '') as string).trim();
      if (ticker && !keywords.find((k) => k.value === ticker)) {
        keywords.push({
          type: 'ticker',
          value: ticker,
          aliases: [],
          source: 'jg_picks_manual',
          weight: 85,
        });
      }
    }
  } catch {
    sources.push({
      source: 'jg_picks_manual',
      available: false,
      count: 0,
      reason: 'collection_error',
    });
  }

  // JG Picks Cache (field = symbol, aggregated picks)
  try {
    const cacheDocs = await db
      .collection('jg_picks_cache')
      .find({})
      .toArray();
    sources.push({
      source: 'jg_picks_cache',
      available: true,
      count: cacheDocs.length,
    });
    for (const doc of cacheDocs) {
      const ticker = ((doc.symbol || '') as string).trim();
      if (ticker && !keywords.find((k) => k.value === ticker)) {
        keywords.push({
          type: 'ticker',
          value: ticker,
          aliases: [],
          source: 'jg_picks_cache',
          weight: 70,
        });
      }
    }
  } catch {
    sources.push({
      source: 'jg_picks_cache',
      available: false,
      count: 0,
      reason: 'collection_error',
    });
  }

  // Sources not integrated (report only)
  sources.push({
    source: 'recently_viewed',
    available: false,
    count: 0,
    reason: 'not_found_in_db',
  });
  sources.push({
    source: 'drawdown_stats',
    available: false,
    count: 0,
    reason: 'not_found_in_db',
  });

  return NextResponse.json({
    ok: true,
    manualSupported: true,
    sources,
    keywords,
    totalKeywords: keywords.length,
  });
}
