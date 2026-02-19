export const maxDuration = 30;
import { NextResponse } from 'next/server';
import { trackApiCall } from '@/lib/api-stats';

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com';

// Map SIC industry titles to broad Chinese sector categories
function categorize(title: string): string {
  const t = title.toUpperCase();
  if (['SEMICONDUCTOR','ELECTRONIC COMPUTER','ELECTRONIC','COMPUTER'].some(k => t.includes(k)))
    return '科技 / 半導體';
  if (['PHARMA','BIOLOGICAL','MEDICAL','DRUG','SURGICAL','DENTAL','HEALTH'].some(k => t.includes(k)))
    return '醫療保健';
  if (['BANK','FINANCE','INSURANCE','INVEST','LOAN','SAVINGS','SECURITY BROKER','CREDIT','REAL ESTATE'].some(k => t.includes(k)))
    return '金融 / 保險';
  if (['PETROLEUM','OIL','GAS','NATURAL GAS','MINING','COAL','ENERGY'].some(k => t.includes(k)))
    return '能源 / 礦業';
  if (['ELECTRIC','POWER','UTILITY','WATER SUPPLY','SANITARY','COGENERATION'].some(k => t.includes(k)))
    return '公用事業';
  if (['RETAIL','STORE','RESTAURANT','EATING','HOTEL','CATALOG','VARIETY'].some(k => t.includes(k)))
    return '零售 / 消費';
  if (['FOOD','BEVERAGE','TOBACCO','CIGARETTE','DAIRY','BOTTLED','CANNED'].some(k => t.includes(k)))
    return '食品 / 飲料';
  if (['AIRCRAFT','AUTO','VEHICLE','RAILROAD','TRUCKING','TRANSPORT','SHIPPING','AIR COURIER'].some(k => t.includes(k)))
    return '運輸 / 航太';
  if (['COMMUNICATION','CABLE','TELEVISION','RADIO','TELEPHONE','BROADCAST'].some(k => t.includes(k)))
    return '通訊 / 媒體';
  if (['SOFTWARE','PROGRAMMING','DATA PROCESSING','INFORMATION','PREPACKAGED'].some(k => t.includes(k)))
    return '軟體 / 資訊服務';
  if (['CONSTRUCTION','CEMENT','STEEL','METAL','IRON','STRUCTURAL'].some(k => t.includes(k)))
    return '營建 / 鋼鐵';
  if (['CHEMICAL','PLASTIC','RUBBER'].some(k => t.includes(k)))
    return '化工 / 塑膠';
  return '其他產業';
}

export async function GET() {
  const startTime = Date.now();

  try {
    const res = await fetch(
      `${FMP_BASE_URL}/stable/institutional-ownership/industry-summary?year=2025&quarter=4&apikey=${FMP_API_KEY}`,
      { next: { revalidate: 86400 } } // Cache 24h
    );

    if (!res.ok) throw new Error('Failed to fetch industry summary');

    const data = await res.json();
    
    // Aggregate by broad sector
    const sectors: Record<string, number> = {};
    for (const item of data) {
      const cat = categorize(item.industryTitle);
      sectors[cat] = (sectors[cat] || 0) + item.industryValue;
    }

    // Sort by value descending
    const result = Object.entries(sectors)
      .map(([sector, value]) => ({ sector, value }))
      .sort((a, b) => b.value - a.value);

    const total = result.reduce((sum, r) => sum + r.value, 0);

    const response = NextResponse.json({
      quarter: 'Q4 2025',
      date: '2025-12-31',
      total,
      sectors: result.map(r => ({
        ...r,
        percentage: Number(((r.value / total) * 100).toFixed(1)),
      })),
    });


    response.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');


    response.headers.set('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');


    trackApiCall('/api/industry-summary', Date.now() - startTime, false);


    return response;
  } catch (error) {
    console.error('Error fetching industry summary:', error);
    const response = NextResponse.json({ error: 'Failed to fetch industry summary' }, { status: 500 });

    response.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');

    response.headers.set('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');

    trackApiCall('/api/industry-summary', Date.now() - startTime, false);

    return response;
  }
}
