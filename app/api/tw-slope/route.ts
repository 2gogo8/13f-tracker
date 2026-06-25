import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import supplyChainDB from '@/data/supply-chain';
import { twStocks } from '@/data/tw-stocks';
import twSectorMapRaw from '@/data/tw_sector_map.json';
import usSectorMapRaw from '@/data/us_sector_map.json';

const US_SECTOR_MAP: Record<string, { sector_en: string; sector_zh: string; industry: string }> =
  usSectorMapRaw as Record<string, { sector_en: string; sector_zh: string; industry: string }>;

// Industry zh translation
const INDUSTRY_ZH: Record<string, string> = {
  'Semiconductors': '半導體',
  'Software - Infrastructure': '軟體基礎架構',
  'Software - Application': '應用軟體',
  'Consumer Electronics': '消費電子',
  'Internet Content & Information': '網路服務',
  'Auto - Manufacturers': '電動車',
  'Specialty Retail': '電商零售',
  'Entertainment': '娛樂媒體',
  'Banks - Diversified': '銀行',
  'Discount Stores': '量販零售',
  'Communication Equipment': '通訊設備',
  'Electronic Components': '電子元件',
  'Contract Manufacturers': '電子代工',
};

function getIndustryZh(usSymbol: string): string {
  const info = US_SECTOR_MAP[usSymbol];
  if (!info) return usSymbol;
  const industry = info.industry;
  return INDUSTRY_ZH[industry] || info.sector_zh || industry;
}

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

interface Type1Supplier {
  twSymbol: string;
  twName: string;
  usParent: string;
  usSlope: number;
  role: string;
  twSlope: number;
}

interface Type1Group {
  industry: string;
  usStocks: string[];
  usSlopes: number[];
  suppliers: Type1Supplier[];
}

interface Type2Result {
  twSymbol: string;
  twName: string;
  sector: string;
  twSlope: number;
  taiexSlope: number;
  explosiveParents: string[]; // 爆賺美股中，哪些是此台股的客戶
}

function findClosestPrice(prices: PriceRecord[], targetDate: string): number | null {
  if (!prices || prices.length === 0) return null;

  // Find all records on or before targetDate, most-recent-first
  const candidates = [...prices]
    .filter(p => p.date <= targetDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (candidates.length === 0) return null;

  const best = candidates[0];
  const diffDays =
    (new Date(targetDate).getTime() - new Date(best.date).getTime()) / 86400000;

  // Normal case: within 10 days (covers weekends, Taiwan holidays)
  if (diffDays <= 10) return best.close;

  // Stale cache: target date is beyond all available data — use latest available
  const maxDate = prices.reduce((a, b) => (a.date > b.date ? a : b)).date;
  if (targetDate > maxDate) return best.close;

  // Large gap within cache range (genuine data gap)
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
    const type1Groups: Map<string, Type1Group> = new Map();
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
        const industry = getIndustryZh(usSymbol);

        if (!type1Groups.has(industry)) {
          type1Groups.set(industry, { industry, usStocks: [], usSlopes: [], suppliers: [] });
        }
        const group = type1Groups.get(industry)!;
        if (!group.usStocks.includes(usSymbol)) {
          group.usStocks.push(usSymbol);
          group.usSlopes.push(usSlope);
        }
        group.suppliers.push({
          twSymbol: twTicker,
          twName: meta?.name || supplier.name,
          usParent: usSymbol,
          usSlope,
          role: supplier.role,
          twSlope,
        });
      }
    }

    // Convert groups map to array, sort each group's suppliers
    const type1: Type1Group[] = Array.from(type1Groups.values()).map(group => ({
      ...group,
      suppliers: group.suppliers.sort((a, b) => a.twSlope - b.twSlope),
    }));
    // Sort groups by number of suppliers desc
    type1.sort((a, b) => b.suppliers.length - a.suppliers.length);

    // Build reverse supply chain: TW ticker -> US parents
    const twToUSParents: Map<string, string[]> = new Map();
    for (const [usSymbol, suppliers] of Object.entries(supplyChainDB)) {
      if (!Array.isArray(suppliers)) continue;
      for (const supplier of suppliers as Array<{market: string; ticker?: string}>) {
        if (supplier.market !== 'TW' || !supplier.ticker) continue;
        const twTicker = supplier.ticker;
        if (!twToUSParents.has(twTicker)) twToUSParents.set(twTicker, []);
        twToUSParents.get(twTicker)!.push(usSymbol);
      }
    }

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
      // Find explosive US parents for this TW stock
      const allParents = twToUSParents.get(twTicker) || [];
      const explosiveParents = allParents.filter(us => explosiveUSStocks.has(us));

      type2.push({
        twSymbol: twTicker,
        twName: meta?.name || twTicker,
        sector,
        twSlope,
        taiexSlope: roundedTaiex,
        explosiveParents,
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
