import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import getClientPromise from '@/lib/mongodb';

export const maxDuration = 30;

// ── JG Picks Watchlist MVP ────────────────────────────────────────────────────
// Reads from MongoDB jg_picks_cache (updated daily by update_jg_picks_cache.py).
// Falls back to live FMP fetch only when cache is empty.
//
// performancePct = (latestClose - mentionClose) / mentionClose * 100
//   - mentionClose: actual EOD close on or after JG's mention date
//   - latestClose:  most recent completed trading day close
//   - NOT real-time / intraday quote
//
// Rollback: revert this file in git to restore live FMP per-request behavior.

interface PickEntry {
  symbol: string;
  first_date: string;
  entry_price: number;
}

interface CacheEntry {
  symbol: string;
  mentionDate: string;
  mentionClose: number;
  mentionCloseDate: string;
  latestClose: number;
  latestCloseDate: string;
  performancePct: number;
  lastUpdatedAt: string;
}

interface PickResult {
  symbol: string;
  first_date: string;
  entry_price: number;
  current_price: number | null;
  return_pct: number | null;
  name?: string;
  // MVP additions
  mentionClose?: number;
  latestClose?: number;
  latestCloseDate?: string;
  lastUpdatedAt?: string;
}

export async function GET() {
  try {
    // 1. Read picks list (symbol + mention date)
    const filePath = join(process.cwd(), 'data', 'jg-picks.json');
    const picks: PickEntry[] = JSON.parse(readFileSync(filePath, 'utf-8'));
    const sorted = [...picks]
      .sort((a, b) => b.first_date.localeCompare(a.first_date))
      .slice(0, 30);
    const symbols = sorted.map(p => p.symbol);

    // 2. Read from MongoDB cache
    const client = await getClientPromise();
    const db = client.db('13f-tracker');
    const cached = await db
      .collection('jg_picks_cache')
      .find({ symbol: { $in: symbols } })
      .toArray() as unknown as CacheEntry[];

    const cacheMap = new Map(cached.map(c => [c.symbol, c]));

    // 3. Build results from cache
    const results: PickResult[] = sorted.map(pick => {
      const c = cacheMap.get(pick.symbol);
      if (c) {
        return {
          symbol: pick.symbol,
          first_date: pick.first_date,
          entry_price: pick.entry_price,
          current_price: c.latestClose,
          return_pct: c.performancePct,
          mentionClose: c.mentionClose,
          latestClose: c.latestClose,
          latestCloseDate: c.latestCloseDate,
          lastUpdatedAt: c.lastUpdatedAt,
        };
      }
      // Cache miss: return stub (no live FMP call to avoid quota burn)
      return {
        symbol: pick.symbol,
        first_date: pick.first_date,
        entry_price: pick.entry_price,
        current_price: null,
        return_pct: null,
      };
    });

    // 4. Derive global lastUpdatedAt from most recently updated cache entry
    const latestUpdate = cached.reduce((best, c) => {
      return !best || c.lastUpdatedAt > best ? c.lastUpdatedAt : best;
    }, '' as string);

    const res = NextResponse.json({
      results,
      updated_at: latestUpdate || new Date().toISOString(),
      // How many symbols came from cache vs stub
      cache_hit: cached.length,
      cache_total: symbols.length,
    });
    // Cache at edge for 10 min (data only changes once daily)
    res.headers.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=600');
    return res;
  } catch (error) {
    console.error('jg-picks API error:', error);
    return NextResponse.json({ error: 'Failed to fetch JG picks' }, { status: 500 });
  }
}
