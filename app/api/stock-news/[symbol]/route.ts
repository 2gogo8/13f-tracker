import { NextResponse } from 'next/server';

export const maxDuration = 30;

const API_KEY = process.env.FMP_API_KEY || '';

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  try {
    // Try fmp-articles first (more reliable)
    const articlesRes = await fetch(
      `https://financialmodelingprep.com/stable/fmp-articles?limit=80&apikey=${API_KEY}`
    );
    const articles = await articlesRes.json();

    const matched: any[] = [];
    if (Array.isArray(articles)) {
      for (const article of articles) {
        const title = (article.title || '').toUpperCase();
        const content = (article.content || '').toUpperCase();
        if (
          title.includes(`(${upperSymbol})`) ||
          title.includes(`$${upperSymbol}`) ||
          title.includes(`:${upperSymbol})`) ||
          title.includes(`${upperSymbol} `) ||
          title.includes(` ${upperSymbol}:`) ||
          title.includes(` ${upperSymbol},`) ||
          content.includes(`(${upperSymbol})`) ||
          content.includes(`$${upperSymbol}`)
        ) {
          matched.push(article);
          if (matched.length >= 5) break;
        }
      }
    }

    // Translate and format
    const newsPromises = matched.map(async (article) => {
      const rawTitle = (article.title || '').replace(/<[^>]*>/g, '');
      const rawText = (article.content || '').replace(/<[^>]*>/g, '').slice(0, 300);

      const [titleZh, textZh] = await Promise.all([
        translateToZh(rawTitle),
        translateToZh(rawText),
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

    return NextResponse.json(news);
  } catch (error) {
    console.error(`Error fetching news for ${symbol}:`, error);
    return NextResponse.json([]);
  }
}
