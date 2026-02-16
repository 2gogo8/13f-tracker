import { NextResponse } from 'next/server';

export const maxDuration = 60;

const API_KEY = process.env.FMP_API_KEY || '';

let cachedData: any = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30 * 60 * 1000;

// Translate to Traditional Chinese via MyMemory (free)
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

// Popular stocks to look for news about
const TARGET_SYMBOLS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'AMD', 'NFLX', 'JPM'];

export async function GET() {
  try {
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_DURATION) {
      return NextResponse.json(cachedData);
    }

    // Fetch a large batch of FMP articles (these actually have varied stocks)
    const articlesRes = await fetch(
      `https://financialmodelingprep.com/stable/fmp-articles?limit=50&apikey=${API_KEY}`
    );
    const articles = await articlesRes.json();

    // Find articles that mention our target symbols
    const symbolNews: Record<string, any> = {};

    if (Array.isArray(articles)) {
      for (const article of articles) {
        const title = (article.title || '').toUpperCase();
        // Check which symbol this article is about
        for (const sym of TARGET_SYMBOLS) {
          if (symbolNews[sym]) continue; // already found one for this symbol
          // Look for ticker in title like "NVDA", "NASDAQ:NVDA", "(NVDA)", "$NVDA"
          if (
            title.includes(`(${sym})`) ||
            title.includes(`$${sym}`) ||
            title.includes(`:${sym})`) ||
            title.includes(`${sym} `) ||
            title.includes(` ${sym}:`) ||
            title.includes(` ${sym},`)
          ) {
            symbolNews[sym] = article;
          }
        }
        if (Object.keys(symbolNews).length >= 3) break;
      }
    }

    // If not enough from articles, also try stock news endpoint for remaining
    const foundSymbols = Object.keys(symbolNews);
    const remaining = TARGET_SYMBOLS.filter(s => !foundSymbols.includes(s)).slice(0, 3 - foundSymbols.length);

    for (const sym of remaining) {
      if (Object.keys(symbolNews).length >= 3) break;
      try {
        const newsRes = await fetch(
          `https://financialmodelingprep.com/stable/news/stock?symbol=${sym}&limit=5&apikey=${API_KEY}`
        );
        const newsData = await newsRes.json();
        if (Array.isArray(newsData)) {
          // Find one that actually mentions this symbol
          const match = newsData.find((n: any) =>
            (n.title || '').toUpperCase().includes(sym) ||
            (n.symbol || '').toUpperCase() === sym
          );
          if (match) {
            symbolNews[sym] = {
              title: match.title,
              date: match.publishedDate,
              content: match.text,
              link: match.url,
              image: match.image,
              site: match.site,
            };
          }
        }
      } catch { /* skip */ }
    }

    // Build final news items with quotes and translation
    const symbols = Object.keys(symbolNews).slice(0, 3);
    
    const newsPromises = symbols.map(async (symbol) => {
      try {
        const article = symbolNews[symbol];
        
        // Get quote
        const quoteRes = await fetch(
          `https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${API_KEY}`
        );
        const quoteData = await quoteRes.json();
        const quote = Array.isArray(quoteData) ? quoteData[0] : null;

        // Clean title (strip HTML if from fmp-articles)
        const rawTitle = (article.title || '').replace(/<[^>]*>/g, '');
        // Clean text
        const rawText = (article.content || article.text || '').replace(/<[^>]*>/g, '').slice(0, 200);

        // Translate
        const [titleZh, textZh] = await Promise.all([
          translateToZh(rawTitle),
          translateToZh(rawText),
        ]);

        const changePct = quote?.changesPercentage ?? 0;
        let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
        if (changePct > 1) sentiment = 'positive';
        else if (changePct < -1) sentiment = 'negative';

        return {
          symbol,
          price: quote?.price ?? 0,
          changesPercentage: changePct,
          newsTitle: titleZh,
          newsUrl: article.link || article.url || '#',
          newsImage: article.image || null,
          newsSite: article.site || 'FMP',
          newsText: textZh,
          publishedDate: article.date || article.publishedDate || '',
          sentiment,
        };
      } catch {
        return null;
      }
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
