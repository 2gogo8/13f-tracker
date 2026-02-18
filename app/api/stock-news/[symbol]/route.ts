import { NextResponse } from 'next/server';
import { trackApiCall, trackSymbolView } from '@/lib/api-stats';

export const maxDuration = 60;

const API_KEY = process.env.FMP_API_KEY || '';

// Well-known company name mappings for better article matching
const COMPANY_NAMES: Record<string, string[]> = {
  'AAPL': ['Apple'],
  'MSFT': ['Microsoft'],
  'GOOGL': ['Google', 'Alphabet'],
  'AMZN': ['Amazon'],
  'NVDA': ['Nvidia', 'NVIDIA'],
  'META': ['Meta Platforms', 'Facebook'],
  'TSLA': ['Tesla'],
  'BRK.B': ['Berkshire'],
  'JPM': ['JPMorgan', 'JP Morgan'],
  'V': ['Visa Inc'],
  'UNH': ['UnitedHealth'],
  'MA': ['Mastercard'],
  'HD': ['Home Depot'],
  'PG': ['Procter & Gamble', 'Procter and Gamble'],
  'JNJ': ['Johnson & Johnson', 'Johnson and Johnson'],
  'XOM': ['Exxon'],
  'AVGO': ['Broadcom'],
  'LLY': ['Eli Lilly', 'Lilly'],
  'COST': ['Costco'],
  'ABBV': ['AbbVie'],
  'MRK': ['Merck'],
  'WMT': ['Walmart'],
  'PEP': ['PepsiCo', 'Pepsi'],
  'KO': ['Coca-Cola', 'Coca Cola'],
  'ADBE': ['Adobe'],
  'CRM': ['Salesforce'],
  'NFLX': ['Netflix'],
  'AMD': ['Advanced Micro', 'AMD'],
  'ORCL': ['Oracle'],
  'INTC': ['Intel'],
  'TSM': ['TSMC', 'Taiwan Semi', 'Taiwan Semiconductor'],
  'BABA': ['Alibaba'],
  'QCOM': ['Qualcomm'],
  'ASML': ['ASML'],
  'MU': ['Micron'],
  'AMAT': ['Applied Materials'],
  'LRCX': ['Lam Research'],
};

// Translate text to Chinese, supports long text by chunking
async function translateToZh(text: string): Promise<string> {
  if (!text || text.length < 5) return text;
  try {
    // Split into ~450 char chunks at sentence boundaries
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= 450) {
        chunks.push(remaining);
        break;
      }
      // Find a sentence break near 450 chars
      let splitAt = remaining.lastIndexOf('. ', 450);
      if (splitAt < 200) splitAt = remaining.lastIndexOf(' ', 450);
      if (splitAt < 200) splitAt = 450;
      chunks.push(remaining.slice(0, splitAt + 1));
      remaining = remaining.slice(splitAt + 1).trim();
    }

    const translated = await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const res = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|zh-TW`,
            { signal: AbortSignal.timeout(8000) }
          );
          const data = await res.json();
          const t = data?.responseData?.translatedText;
          if (t && !t.includes('MYMEMORY WARNING')) return t;
          return chunk;
        } catch {
          return chunk;
        }
      })
    );
    return translated.join('');
  } catch {
    return text;
  }
}

// Clean HTML to readable text, removing links and tags
function cleanArticleContent(html: string): string {
  // Remove hyperlink tags (keep text inside only if it's not a URL)
  let text = html.replace(/<a[^>]*>([^<]*)<\/a>/gi, '');
  // Remove all other HTML tags
  text = text.replace(/<[^>]*>/g, '');
  // Remove URLs
  text = text.replace(/https?:\/\/\S+/g, '');
  // Clean whitespace
  text = text.replace(/\s+/g, ' ').trim();
  // Remove ticker references like (NASDAQ: XXXX) that add noise
  text = text.replace(/\(\s*(?:NASDAQ|NYSE|OTC)\s*:\s*[A-Z.]+\s*\)/gi, '');
  return text;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();

  const { symbol } = await params;
    trackSymbolView(symbol);
  const upperSymbol = symbol.toUpperCase();

  try {
    // Get company name from profile for matching
    let companyNames = COMPANY_NAMES[upperSymbol] || [];

    // If not in our map, fetch from profile API
    if (companyNames.length === 0) {
      try {
        const profileRes = await fetch(
          `https://financialmodelingprep.com/stable/profile?symbol=${upperSymbol}&apikey=${API_KEY}`
        );
        const profileData = await profileRes.json();
        const profile = Array.isArray(profileData) ? profileData[0] : null;
        if (profile?.companyName) {
          // Use first word(s) of company name for matching
          const name = profile.companyName;
          companyNames = [name];
          // Also add shortened versions
          const parts = name.split(' ');
          if (parts.length > 1) companyNames.push(parts[0]);
        }
      } catch { /* skip */ }
    }

    // Build search keywords: ticker + company names
    const keywords = [upperSymbol, ...companyNames.map(n => n.toUpperCase())];

    // Fetch articles
    const articlesRes = await fetch(
      `https://financialmodelingprep.com/stable/fmp-articles?limit=100&apikey=${API_KEY}`
    );
    const articles = await articlesRes.json();

    const matched: any[] = [];
    if (Array.isArray(articles)) {
      for (const article of articles) {
        const title = (article.title || '').toUpperCase();
        const tickers = (article.tickers || '').toUpperCase();

        // Match on title or tickers field
        const found = keywords.some(kw => title.includes(kw) || tickers.includes(kw));
        if (found) {
          matched.push(article);
          if (matched.length >= 5) break;
        }
      }
    }

    // Translate and format (limit to 5, translate up to 3 to save API quota)
    // Show up to 3 articles with full content translation
    const toTranslate = matched.slice(0, 3);
    const newsPromises = toTranslate.map(async (article) => {
      const rawTitle = (article.title || '').replace(/<[^>]*>/g, '');
      const rawContent = cleanArticleContent(article.content || '');

      const [titleZh, textZh] = await Promise.all([
        translateToZh(rawTitle),
        translateToZh(rawContent),
      ]);

      return {
        title: titleZh,
        text: textZh,
        url: article.link || '#',
        image: article.image || null,
        site: article.site || 'FMP',
        date: article.date || '',
      };
    });

    const news = await Promise.all(newsPromises);

    const response = NextResponse.json(news);


    response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');


    response.headers.set('CDN-Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');


    trackApiCall('/api/stock-news${symbol}', Date.now() - startTime, false);


    return response;
  } catch (error) {
    console.error(`Error fetching news for ${symbol}:`, error);
    const response = NextResponse.json([]);

    response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');

    response.headers.set('CDN-Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');

    trackApiCall('/api/stock-news${symbol}', Date.now() - startTime, false);

    return response;
  }
}
