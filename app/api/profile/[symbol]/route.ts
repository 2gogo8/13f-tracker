import { NextResponse } from 'next/server';

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com';

async function translateToZh(text: string): Promise<string> {
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(text)}`,
      { next: { revalidate: 86400 } } // Cache translation for 24h
    );
    if (!res.ok) return text;
    const data = await res.json();
    // Google returns [[["translated text","original text",...],...],...]
    return data[0]?.map((s: string[]) => s[0]).join('') || text;
  } catch {
    return text;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  
  try {
    const response = await fetch(
      `${FMP_BASE_URL}/stable/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`,
      { next: { revalidate: 3600 } }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch company profile');
    }

    const data = await response.json();
    
    // Translate description to Chinese
    if (data[0]?.description) {
      data[0].descriptionZh = await translateToZh(data[0].description);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(`Error fetching profile for ${symbol}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch company profile' },
      { status: 500 }
    );
  }
}
