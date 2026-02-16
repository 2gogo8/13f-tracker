import { NextResponse } from 'next/server';

const API_KEY = process.env.FMP_API_KEY || '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';

// Cache for 30 minutes
let cachedData: any = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

export async function GET() {
  try {
    // Check cache
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_DURATION) {
      return NextResponse.json(cachedData);
    }

    // Step 1: Try to get most active stocks
    let topSymbols: string[] = ['NVDA', 'TSLA', 'AAPL']; // Default fallback

    try {
      const mostActiveResponse = await fetch(
        `https://financialmodelingprep.com/stable/market-most-active?apikey=${API_KEY}`
      );
      const mostActiveData = await mostActiveResponse.json();

      if (Array.isArray(mostActiveData) && mostActiveData.length > 0) {
        topSymbols = mostActiveData.slice(0, 3).map((stock: { symbol: string }) => stock.symbol);
      }
    } catch (error) {
      console.log('Using fallback stocks (holiday or API error)');
    }

    // Step 2: For each symbol, get quote and news
    const newsPromises = topSymbols.map(async (symbol) => {
      try {
        // Get quote for price and change
        const quoteResponse = await fetch(
          `https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${API_KEY}`
        );
        const quoteData = await quoteResponse.json();
        const quote = Array.isArray(quoteData) ? quoteData[0] : null;

        if (!quote) return null;

        // Get news
        const newsResponse = await fetch(
          `https://financialmodelingprep.com/stable/news/stock?symbol=${symbol}&limit=1&apikey=${API_KEY}`
        );
        const newsData = await newsResponse.json();
        const news = Array.isArray(newsData) && newsData.length > 0 ? newsData[0] : null;

        if (!news) return null;

        // Determine sentiment based on change percentage
        let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
        if (quote.changesPercentage > 1) {
          sentiment = 'positive';
        } else if (quote.changesPercentage < -1) {
          sentiment = 'negative';
        }

        return {
          symbol: quote.symbol,
          price: quote.price,
          changesPercentage: quote.changesPercentage,
          newsTitle: news.title,
          newsUrl: news.url,
          newsImage: news.image,
          newsSite: news.site,
          newsText: news.text,
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

    // Update cache
    cachedData = trendingNews;
    cacheTimestamp = now;

    return NextResponse.json(trendingNews);
  } catch (error) {
    console.error('Error fetching trending news:', error);
    return NextResponse.json([]);
  }
}
