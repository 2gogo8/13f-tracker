import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import getClientPromise from '@/lib/mongodb';

export const maxDuration = 30;

// ── JG Picks Watchlist ────────────────────────────────────────────────────────
//
// Data sources (in priority order):
//   1. jg_picks_manual (active=true) — manually added via /experts admin
//   2. data/jg-picks.json — static list (legacy)
//
// Rules:
//   - Manual picks are displayed FIRST, regardless of mentionDate
//   - Deactivated manual picks (active=false) are SUPPRESSED, even if present in JSON
//   - Duplicate symbols: manual always wins over JSON
//   - JSON picks: top 30 by date DESC (after excluding manual and deactivated)
//   - All prices from jg_picks_cache (FMP EOD, updated daily)

interface PickEntry {
  symbol: string;
  first_date: string;
  entry_price: number;
}

interface ManualDoc {
  _id: unknown;
  symbol: string;
  mentionDate: string;
  mentionClose?: number;
  mentionCloseDate?: string;
  latestClose?: number;
  latestCloseDate?: string;
  performancePct?: number;
  lastUpdatedAt?: string;
  source?: string;
  note?: string;
  active: boolean;
}

interface CacheEntry {
  symbol: string;
  mentionDate?: string;
  mentionClose?: number;
  mentionCloseDate?: string;
  latestClose?: number;
  latestCloseDate?: string;
  performancePct?: number;
  lastUpdatedAt?: string;
}

export interface PickResult {
  symbol: string;
  first_date: string;
  entry_price: number;
  current_price: number | null;
  return_pct: number | null;
  mentionClose?: number;
  latestClose?: number;
  latestCloseDate?: string;
  lastUpdatedAt?: string;
  isManual?: boolean;
  source?: string;
  note?: string;
}

export async function GET() {
  // Require login — any Google or Discord session. No isMember check.
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const client = await getClientPromise();
    const db = client.db('13f-tracker');

    // ── 1. Fetch all manual picks (active + deactivated) ────────────────────
    const allManualDocs = await db
      .collection('jg_picks_manual')
      .find({})
      .sort({ createdAt: -1 })
      .toArray() as unknown as ManualDoc[];

    const activeManual = allManualDocs.filter(m => m.active !== false);
    const manualSymbols = new Set(activeManual.map(m => m.symbol));
    // Symbols that were manually added but deactivated → suppress JSON fallback
    const deactivatedSymbols = new Set(
      allManualDocs.filter(m => m.active === false).map(m => m.symbol)
    );

    // ── 2. Build JSON pick list (excluding manual and deactivated) ──────────
    const filePath = join(process.cwd(), 'data', 'jg-picks.json');
    const jsonPicks: PickEntry[] = JSON.parse(readFileSync(filePath, 'utf-8'));
    const jsonSorted = [...jsonPicks]
      .sort((a, b) => b.first_date.localeCompare(a.first_date))
      .filter(p => !manualSymbols.has(p.symbol) && !deactivatedSymbols.has(p.symbol))
      .slice(0, 30);

    // ── 3. Fetch cache entries for all symbols ───────────────────────────────
    const allSymbols = [
      ...activeManual.map(m => m.symbol),
      ...jsonSorted.map(p => p.symbol),
    ];
    const cached = await db
      .collection('jg_picks_cache')
      .find({ symbol: { $in: allSymbols } })
      .toArray() as unknown as CacheEntry[];
    const cacheMap = new Map(cached.map(c => [c.symbol, c]));

    // ── 4. Build manual results (always first) ───────────────────────────────
    const manualResults: PickResult[] = activeManual.map(m => {
      const c = cacheMap.get(m.symbol);
      // Prefer cache for latest price; fall back to doc fields (set on insert)
      return {
        symbol: m.symbol,
        first_date: m.mentionDate,
        entry_price: m.mentionClose ?? 0,
        current_price: c?.latestClose ?? m.latestClose ?? null,
        return_pct: c?.performancePct ?? m.performancePct ?? null,
        mentionClose: m.mentionClose,
        latestClose: c?.latestClose ?? m.latestClose,
        latestCloseDate: c?.latestCloseDate ?? m.latestCloseDate,
        lastUpdatedAt: c?.lastUpdatedAt ?? m.lastUpdatedAt,
        isManual: true,
        source: m.source,
        note: m.note,
      };
    });

    // ── 5. Build JSON results (after manual) ─────────────────────────────────
    const jsonResults: PickResult[] = jsonSorted.map(pick => {
      const c = cacheMap.get(pick.symbol);
      if (c) {
        return {
          symbol: pick.symbol,
          first_date: pick.first_date,
          entry_price: pick.entry_price,
          current_price: c.latestClose ?? null,
          return_pct: c.performancePct ?? null,
          mentionClose: c.mentionClose,
          latestClose: c.latestClose,
          latestCloseDate: c.latestCloseDate,
          lastUpdatedAt: c.lastUpdatedAt,
          isManual: false,
        };
      }
      return {
        symbol: pick.symbol,
        first_date: pick.first_date,
        entry_price: pick.entry_price,
        current_price: null,
        return_pct: null,
        isManual: false,
      };
    });

    const results = [...manualResults, ...jsonResults];

    const latestUpdate = cached.reduce((best, c) => {
      return !best || (c.lastUpdatedAt ?? '') > best ? (c.lastUpdatedAt ?? '') : best;
    }, '');

    const res = NextResponse.json({
      results,
      updated_at: latestUpdate || new Date().toISOString(),
      cache_hit: cached.length,
      cache_total: allSymbols.length,
      manual_count: activeManual.length,
    });
    // No edge cache — manual picks must show immediately after add
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  } catch (error) {
    console.error('jg-picks API error:', error);
    return NextResponse.json({ error: 'Failed to fetch JG picks' }, { status: 500 });
  }
}
