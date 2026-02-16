import { NextResponse } from 'next/server';

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
};

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

// Extract first 1-2 key sentences as a brief summary
function extractSummary(html: string): string {
  // Strip HTML tags
  const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  // Split into sentences
  const sentences = text.split(/(?<=[.!?。！？])\s+/).filter(s => s.length > 15);
  // Take first 2 sentences, cap at 150 chars
  const summary = sentences.slice(0, 2).join(' ');
  return summary.length > 150 ? summary.slice(0, 147) + '...' : summary;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
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
        const content = (article.content || '').toUpperCase();
        const searchText = title + ' ' + content;

        const found = keywords.some(kw => searchText.includes(kw));
        if (found) {
          matched.push(article);
          if (matched.length >= 5) break;
        }
      }
    }

    // Translate and format (limit to 5, translate up to 3 to save API quota)
    const toTranslate = matched.slice(0, 5);
    const newsPromises = toTranslate.map(async (article, i) => {
      const rawTitle = (article.title || '').replace(/<[^>]*>/g, '');
      const rawSummary = extractSummary(article.content || '');

      // Only translate first 3 to save MyMemory quota
      let titleZh = rawTitle;
      let textZh = rawSummary;
      if (i < 3) {
        [titleZh, textZh] = await Promise.all([
          translateToZh(rawTitle),
          translateToZh(rawSummary),
        ]);
      }

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

    return NextResponse.json(news);
  } catch (error) {
    console.error(`Error fetching news for ${symbol}:`, error);
    return NextResponse.json([]);
  }
}
