import { NextResponse } from 'next/server';

export const maxDuration = 60;

const API_KEY = process.env.FMP_API_KEY || '';

let cachedData: any = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30 * 60 * 1000;

async function translateToZh(text: string): Promise<string> {
  try {
    const truncated = text.length > 500 ? text.slice(0, 500) : text;
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(truncated)}&langpair=en|zh-TW`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (translated && !translated.includes('MYMEMORY WARNING')) return translated;
    return text;
  } catch {
    return text;
  }
}

export async function GET() {
  try {
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_DURATION) {
      return NextResponse.json(cachedData);
    }

    // Fetch top picks (oversold stocks) to get their symbols
    // We'll use the same logic: fetch from /api/top-picks internally won't work on Vercel,
    // so fetch the oversold scanner data directly
    const scannerRes = await fetch(
      `https://financialmodelingprep.com/stable/technical-indicator/stock-screener?indicator=under_valued&apikey=${API_KEY}`
    ).catch(() => null);

    // Fallback: use curated oversold-watch symbols
    const OVERSOLD_SYMBOLS = [
      'CTSH', 'TTWO', 'BKNG', 'IQV', 'SPGI', 'JKHY', 'FOXA', 'FOX', 'NFLX', 'MSFT',
      'AAPL', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'V', 'UNH', 'MA'
    ];

    // Get general news, then filter/prioritize those mentioning our oversold stocks
    const articlesRes = await fetch(
      `https://financialmodelingprep.com/stable/fmp-articles?limit=50&apikey=${API_KEY}`
    );
    const articles = await articlesRes.json();

    if (!Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json([]);
    }

    // Extract ticker from article
    function extractTicker(title: string, content: string): string {
      const text = title + ' ' + content;
      const match = text.match(/\((?:NASDAQ|NYSE|OTC)[:\s]+([A-Z.]+)\)/i);
      if (match) return match[1];
      const match2 = title.match(/\$([A-Z]{1,5})\b/);
      if (match2) return match2[1];
      // Check if any oversold symbol is mentioned in title
      for (const sym of OVERSOLD_SYMBOLS) {
        if (title.includes(sym) || title.includes(`$${sym}`)) return sym;
      }
      return '';
    }

    // Score articles: prioritize oversold stocks
    const scored = articles.map((a: any) => {
      const ticker = extractTicker(a.title || '', a.content || '');
      const isOversold = OVERSOLD_SYMBOLS.includes(ticker);
      return { ...a, ticker: ticker || '', score: isOversold ? 10 : 0 };
    });

    scored.sort((a: any, b: any) => b.score - a.score);

    // Pick up to 6 unique-ticker articles, prioritizing oversold stocks
    const picked: any[] = [];
    const usedTickers = new Set<string>();
    for (const article of scored) {
      if (picked.length >= 6) break;
      const t = article.ticker;
      if (t && usedTickers.has(t)) continue;
      if (t) usedTickers.add(t);
      picked.push(article);
    }

    // Fetch quote + profile (for logo) in parallel
    const newsPromises = picked.map(async (article) => {
      const ticker = article.ticker;
      let price = 0, changePct = 0, logo = '';

      if (ticker) {
        try {
          const [quoteRes, profileRes] = await Promise.all([
            fetch(`https://financialmodelingprep.com/stable/quote?symbol=${ticker}&apikey=${API_KEY}`),
            fetch(`https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${API_KEY}`),
          ]);
          const quoteData = await quoteRes.json();
          const profileData = await profileRes.json();
          const quote = Array.isArray(quoteData) ? quoteData[0] : null;
          const profile = Array.isArray(profileData) ? profileData[0] : null;
          price = quote?.price ?? 0;
          changePct = quote?.changesPercentage ?? 0;
          logo = profile?.image || '';
        } catch { /* skip */ }
      }

      const rawTitle = (article.title || '').replace(/<[^>]*>/g, '');
      const titleZh = await translateToZh(rawTitle);

      let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
      if (changePct > 1) sentiment = 'positive';
      else if (changePct < -1) sentiment = 'negative';

      return {
        symbol: ticker || '市場',
        price,
        changesPercentage: changePct,
        newsTitle: titleZh,
        newsUrl: article.link || '#',
        newsImage: logo, // company logo instead of article image
        newsSite: article.site || 'FMP',
        newsText: '',
        publishedDate: article.date || '',
        sentiment,
      };
    });

    const results = await Promise.all(newsPromises);
    cachedData = results;
    cacheTimestamp = now;

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error fetching trending news:', error);
    return NextResponse.json([]);
  }
}
