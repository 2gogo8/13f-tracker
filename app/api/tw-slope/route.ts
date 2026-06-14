import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import supplyChainDB from '@/data/supply-chain';
import { twStocks } from '@/data/tw-stocks';
import twSectorMapRaw from '@/data/tw_sector_map.json';

// Comprehensive sector map from TWSE ISIN (1969 stocks)
const TW_SECTOR_MAP: Record<string, string> = twSectorMapRaw as Record<string, string>;

// Also include tw-stocks.ts sector map as fallback with Chinese names
const SECTOR_MAP: Record<string, string> = { ...TW_SECTOR_MAP };
for (const s of twStocks) {
  if (!SECTOR_MAP[s.symbol] && s.sector) SECTOR_MAP[s.symbol] = s.sector;
}

export const maxDuration = 30;

interface PriceRecord {
  date: string;
  close: number;
}

interface TWPriceCacheData {
  updated_at: string;
  taiex: PriceRecord[];
  symbols: string[];
  prices: Record<string, PriceRecord[]>;
  metadata: Record<string, { name: string; sector: string; exchange: string }>;
}

interface USPriceCacheData {
  updated_at: string;
  symbols: string[];
  prices: Record<string, PriceRecord[]>;
}

interface Type1Result {
  twSymbol: string;
  twName: string;
  usParent: string;
  role: string;
  twSlope: number;
  usSlope: number;
}

interface Type2Result {
  twSymbol: string;
  twName: string;
  sector: string;
  twSlope: number;
  taiexSlope: number;
}

function findClosestPrice(prices: PriceRecord[], targetDate: string): number | null {
  let closest: PriceRecord | null = null;
  let closestDiff = Infinity;

  for (const p of prices) {
    if (p.date <= targetDate) {
      const diff = new Date(targetDate).getTime() - new Date(p.date).getTime();
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = p;
      }
    }
  }
  // Allow up to 10 days gap
  if (closest && closestDiff <= 10 * 24 * 60 * 60 * 1000) {
    return closest.close;
  }
  return null;
}

function calcSlope(prices: PriceRecord[], date1: string, date2: string): number | null {
  const p1 = findClosestPrice(prices, date1);
  const p2 = findClosestPrice(prices, date2);
  if (p1 === null || p2 === null || p1 === 0) return null;
  return ((p2 - p1) / p1) * 100;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date1, date2 } = body as { date1?: string; date2?: string };

    if (!date1 || !date2) {
      return NextResponse.json(
        { error: 'missing_dates', message: '請提供 date1 和 date2' },
        { status: 400 }
      );
    }

    const dataDir = path.join(process.cwd(), 'data');

    // Load TW price cache
    const twCachePath = path.join(dataDir, 'tw_price_cache.json');
    if (!fs.existsSync(twCachePath)) {
      return NextResponse.json(
        { error: 'tw_data_not_ready', message: '請先執行 scripts/update_tw_slope_cache.py' },
        { status: 503 }
      );
    }

    const twCache: TWPriceCacheData = JSON.parse(fs.readFileSync(twCachePath, 'utf-8'));

    // Calculate TAIEX slope
    const taiexSlope = calcSlope(twCache.taiex, date1, date2);
    if (taiexSlope === null) {
      return NextResponse.json(
        { error: 'date_range_error', message: '找不到指定日期的 TAIEX 價格' },
        { status: 400 }
      );
    }

    // Load US price cache for explosive stocks
    const usCachePath = path.join(dataDir, 'price_cache.json');
    let benchSlopeUS = 0;
    let explosiveThreshold = 0;
    const explosiveUSStocks: Map<string, number> = new Map(); // symbol -> slope

    if (fs.existsSync(usCachePath)) {
      const usCache: USPriceCacheData = JSON.parse(fs.readFileSync(usCachePath, 'utf-8'));

      // Calculate QQQ benchmark slope
      const qqPrices = usCache.prices['QQQ'];
      if (qqPrices) {
        const qqSlope = calcSlope(qqPrices, date1, date2);
        if (qqSlope !== null) {
          benchSlopeUS = Math.round(qqSlope * 100) / 100;
        }
      }

      explosiveThreshold = benchSlopeUS * 10;

      // Find explosive US stocks (slope >= benchSlope * 10)
      for (const sym of usCache.symbols) {
        if (sym === 'QQQ' || sym === 'SPY' || sym === 'IWM') continue;
        const prices = usCache.prices[sym];
        if (!prices || prices.length === 0) continue;
        const slope = calcSlope(prices, date1, date2);
        if (slope !== null && slope >= explosiveThreshold) {
          explosiveUSStocks.set(sym, Math.round(slope * 100) / 100);
        }
      }
    }

    // Pre-compute TW stock slopes
    const twSlopeMap: Map<string, number> = new Map();
    for (const sym of twCache.symbols) {
      const prices = twCache.prices[sym];
      if (!prices || prices.length === 0) continue;
      const slope = calcSlope(prices, date1, date2);
      if (slope !== null) {
        twSlopeMap.set(sym, Math.round(slope * 100) / 100);
      }
    }

    // ===== Type 1: 供應鏈補漲型 =====
    const type1: Type1Result[] = [];
    const seenType1: Set<string> = new Set();

    for (const [usSymbol, usSlope] of explosiveUSStocks) {
      const suppliers = supplyChainDB[usSymbol];
      if (!suppliers) continue;

      for (const supplier of suppliers) {
        if (supplier.market !== 'TW' || !supplier.ticker) continue;

        const twTicker = supplier.ticker; // e.g. "2330.TW"
        const twSlope = twSlopeMap.get(twTicker);

        // Filter: TW slope <= -15% (回檔15%以上)
        if (twSlope === undefined || twSlope > -15) continue;

        const key = `${twTicker}-${usSymbol}`;
        if (seenType1.has(key)) continue;
        seenType1.add(key);

        const meta = twCache.metadata[twTicker];
        type1.push({
          twSymbol: twTicker,
          twName: meta?.name || supplier.name,
          usParent: usSymbol,
          role: supplier.role,
          twSlope,
          usSlope,
        });
      }
    }

    // Sort Type1 by twSlope ascending (most pullback first)
    type1.sort((a, b) => a.twSlope - b.twSlope);

    // ===== Type 2: 跟盤型 =====
    const type2: Type2Result[] = [];
    const roundedTaiex = Math.round(taiexSlope * 100) / 100;

    for (const [twTicker, twSlope] of twSlopeMap) {
      // TW slope >= TAIEX slope
      if (twSlope < roundedTaiex) continue;

      const meta = twCache.metadata[twTicker];
      // Look up sector from tw-stocks.ts static map
      const code = twTicker.replace('.TW', '').replace('.TWO', '');
      const sector = SECTOR_MAP[code] || meta?.sector || '';
      type2.push({
        twSymbol: twTicker,
        twName: meta?.name || twTicker,
        sector,
        twSlope,
        taiexSlope: roundedTaiex,
      });
    }

    // Sort Type2 by twSlope descending
    type2.sort((a, b) => b.twSlope - a.twSlope);

    return NextResponse.json({
      taiex_slope: roundedTaiex,
      bench_slope_us: benchSlopeUS,
      explosive_threshold: explosiveThreshold,
      data_updated_at: twCache.updated_at,
      type1,
      type2,
    });
  } catch (error) {
    console.error('TW slope scanner error:', error);
    return NextResponse.json(
      { error: 'server_error', message: String(error) },
      { status: 500 }
    );
  }
}
