import { NextResponse } from 'next/server';

export const maxDuration = 60;

const API_KEY = process.env.FMP_API_KEY || '';

// Cache for 30 minutes
let cachedData: any = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30 * 60 * 1000;

// Translate text to Traditional Chinese using MyMemory API (free, no key needed)
async function translateToZh(text: string): Promise<string> {
  try {
    // Truncate to 500 chars to stay within free API limits
    const truncated = text.length > 500 ? text.slice(0, 500) : text;
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(truncated)}&langpair=en|zh-TW`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    // MyMemory returns uppercase warning when quota exceeded
    if (translated && !translated.includes('MYMEMORY WARNING')) {
      return translated;
    }
    return text; // fallback to original
  } catch {
    return text; // fallback to original
  }
}

export async function GET() {
  try {
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_DURATION) {
      return NextResponse.json(cachedData);
    }

    // Step 1: Try to get most active stocks
    let topSymbols: string[] = ['NVDA', 'TSLA', 'AAPL'];

    try {
      const mostActiveResponse = await fetch(
        `https://financialmodelingprep.com/stable/market-most-active?apikey=${API_KEY}`
      );
      const mostActiveData = await mostActiveResponse.json();

      if (Array.isArray(mostActiveData) && mostActiveData.length > 0) {
        topSymbols = mostActiveData.slice(0, 3).map((stock: { symbol: string }) => stock.symbol);
      }
    } catch {
      console.log('Using fallback stocks (holiday or API error)');
    }

    // Step 2: For each symbol, get quote, news, and translate
    const newsPromises = topSymbols.map(async (symbol) => {
      try {
        const [quoteResponse, newsResponse] = await Promise.all([
          fetch(`https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${API_KEY}`),
          fetch(`https://financialmodelingprep.com/stable/news/stock?symbol=${symbol}&limit=1&apikey=${API_KEY}`),
        ]);

        const quoteData = await quoteResponse.json();
        const quote = Array.isArray(quoteData) ? quoteData[0] : null;
        if (!quote) return null;

        const newsData = await newsResponse.json();
        const news = Array.isArray(newsData) && newsData.length > 0 ? newsData[0] : null;
        if (!news) return null;

        // Translate title and text to Chinese
        const [titleZh, textZh] = await Promise.all([
          translateToZh(news.title || ''),
          translateToZh(news.text || ''),
        ]);

        let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
        if ((quote.changesPercentage ?? 0) > 1) sentiment = 'positive';
        else if ((quote.changesPercentage ?? 0) < -1) sentiment = 'negative';

        return {
          symbol: quote.symbol,
          price: quote.price ?? 0,
          changesPercentage: quote.changesPercentage ?? 0,
          newsTitle: titleZh,
          newsUrl: news.url,
          newsImage: news.image,
          newsSite: news.site,
          newsText: textZh,
          publishedDate: news.publishedDate,
          sentiment,
        };
      } catch (error) {
        console.error(`Error fetching news for ${symbol}:`, error);
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
