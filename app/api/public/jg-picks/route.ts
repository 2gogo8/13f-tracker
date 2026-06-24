import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const maxDuration = 60;

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com';

interface PickEntry {
  symbol: string;
  first_date: string;
  entry_price: number;
}

interface PickResult {
  symbol: string;
  first_date: string;
  entry_price: number;
  current_price: number | null;
  return_pct: number | null;
  name?: string;
}

export async function GET() {
  try {
    // 1. Read the data file
    const filePath = join(process.cwd(), 'data', 'jg-picks.json');
    const picks: PickEntry[] = JSON.parse(readFileSync(filePath, 'utf-8'));

    // 2. Sort by first_date DESC, limit to 30
    const sorted = [...picks]
      .sort((a, b) => b.first_date.localeCompare(a.first_date))
      .slice(0, 30);

    // 3. Batch fetch quotes from FMP — up to 10 symbols per call
    const symbols = sorted.map(p => p.symbol);
    const priceMap: Record<string, { price: number; name: string }> = {};

    // FMP /stable/quote accepts comma-separated symbols
    const BATCH_SIZE = 10;
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE).join(',');
      try {
        const res = await fetch(
          `${FMP_BASE_URL}/stable/quote?symbol=${encodeURIComponent(batch)}&apikey=${FMP_API_KEY}`,
          { next: { revalidate: 300 } }
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            for (const q of data) {
              if (q.symbol && q.price != null) {
                priceMap[q.symbol] = { price: q.price, name: q.name || q.symbol };
              }
            }
          }
        }
      } catch (err) {
        console.error('FMP batch fetch error:', err);
      }
    }

    // 4. Build result array
    const results: PickResult[] = sorted.map(pick => {
      const live = priceMap[pick.symbol];
      const current_price = live?.price ?? null;
      const return_pct =
        current_price != null && pick.entry_price
          ? parseFloat((((current_price - pick.entry_price) / pick.entry_price) * 100).toFixed(1))
          : null;
      return {
        symbol: pick.symbol,
        first_date: pick.first_date,
        entry_price: pick.entry_price,
        current_price,
        return_pct,
        name: live?.name,
      };
    });

    const response = NextResponse.json({
      results,
      updated_at: new Date().toISOString(),
    });
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    return response;
  } catch (error) {
    console.error('jg-picks API error:', error);
    return NextResponse.json({ error: 'Failed to fetch JG picks' }, { status: 500 });
  }
}
