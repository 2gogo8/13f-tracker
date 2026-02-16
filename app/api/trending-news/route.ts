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

// Extract ticker from article title like "(NASDAQ: NVDA)" or "(NYSE:LLY)"
function extractTicker(title: string): string {
  const match = title.match(/\((?:NASDAQ|NYSE|OTC)[:\s]+([A-Z.]+)\)/i);
  if (match) return match[1];
  const match2 = title.match(/\$([A-Z]{1,5})\b/);
  if (match2) return match2[1];
  return '';
}

export async function GET() {
  try {
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_DURATION) {
      return NextResponse.json(cachedData);
    }

    // Strategy: Get 3 diverse articles from fmp-articles
    // Pick articles about different stocks
    const articlesRes = await fetch(
      `https://financialmodelingprep.com/stable/fmp-articles?limit=30&apikey=${API_KEY}`
    );
    const articles = await articlesRes.json();

    if (!Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json([]);
    }

    // Pick 3 articles with different tickers
    const picked: any[] = [];
    const usedTickers = new Set<string>();

    for (const article of articles) {
      if (picked.length >= 3) break;
      const ticker = extractTicker(article.title || '');
      if (ticker && usedTickers.has(ticker)) continue;
      if (ticker) usedTickers.add(ticker);
      picked.push({ ...article, ticker: ticker || '市場' });
    }

    // Get quotes for picked tickers and translate
    const newsPromises = picked.map(async (article) => {
      const ticker = article.ticker;
      let price = 0;
      let changePct = 0;

      if (ticker && ticker !== '市場') {
        try {
          const quoteRes = await fetch(
            `https://financialmodelingprep.com/stable/quote?symbol=${ticker}&apikey=${API_KEY}`
          );
          const quoteData = await quoteRes.json();
          const quote = Array.isArray(quoteData) ? quoteData[0] : null;
          price = quote?.price ?? 0;
          changePct = quote?.changesPercentage ?? 0;
        } catch { /* skip */ }
      }

      const rawTitle = (article.title || '').replace(/<[^>]*>/g, '');
      const fullText = (article.content || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      const sentences = fullText.split(/(?<=[.!?。！？])\s+/).filter((s: string) => s.length > 15);
      const rawText = sentences.slice(0, 2).join(' ').slice(0, 150);

      const [titleZh, textZh] = await Promise.all([
        translateToZh(rawTitle),
        translateToZh(rawText),
      ]);

      let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
      if (changePct > 1) sentiment = 'positive';
      else if (changePct < -1) sentiment = 'negative';

      return {
        symbol: ticker,
        price,
        changesPercentage: changePct,
        newsTitle: titleZh,
        newsUrl: article.link || '#',
        newsImage: article.image || null,
        newsSite: article.site || 'FMP',
        newsText: textZh,
        publishedDate: article.date || '',
        sentiment,
      };
    });

    const results = await Promise.all(newsPromises);
    const trendingNews = results.filter((item) => item !== null);

    cachedData = trendingNews;
    cacheTimestamp = now;

    return NextResponse.json(trendingNews);
  } catch (error) {
    console.error('Error fetching trending news:', error);
    return NextResponse.json([]);
  }
}
