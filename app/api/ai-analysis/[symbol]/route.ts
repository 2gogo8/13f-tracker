import { NextRequest, NextResponse } from 'next/server';

const FMP_KEY = process.env.FMP_API_KEY || '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

export const maxDuration = 30;

// Cache for 6 hours
const cache = new Map<string, { data: string; timestamp: number }>();
const CACHE_DURATION = 6 * 60 * 60 * 1000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase();

  // Check cache
  const cached = cache.get(sym);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return NextResponse.json({ analysis: cached.data });
  }

  if (!GEMINI_KEY) {
    return NextResponse.json({ analysis: null, error: 'Gemini API key not configured' });
  }

  try {
    // Gather data from FMP
    const [quoteRes, profileRes, consensusRes] = await Promise.allSettled([
      fetch(`https://financialmodelingprep.com/stable/quote?symbol=${sym}&apikey=${FMP_KEY}`).then(r => r.json()),
      fetch(`https://financialmodelingprep.com/stable/profile?symbol=${sym}&apikey=${FMP_KEY}`).then(r => r.json()),
      fetch(`https://financialmodelingprep.com/stable/price-target-consensus?symbol=${sym}&apikey=${FMP_KEY}`).then(r => r.json()),
    ]);

    const quote = quoteRes.status === 'fulfilled' && Array.isArray(quoteRes.value) ? quoteRes.value[0] : null;
    const profile = profileRes.status === 'fulfilled' && Array.isArray(profileRes.value) ? profileRes.value[0] : null;
    const consensus = consensusRes.status === 'fulfilled' && Array.isArray(consensusRes.value) ? consensusRes.value[0] : null;

    if (!quote) {
      return NextResponse.json({ analysis: null, error: 'No quote data' });
    }

    // Build context for Gemini
    const context = `
股票: ${sym} - ${profile?.companyName || quote.name || sym}
產業: ${profile?.sector || 'N/A'} / ${profile?.industry || 'N/A'}
現價: $${quote.price}
漲跌: ${quote.change >= 0 ? '+' : ''}${quote.change} (${(quote.changesPercentage ?? 0).toFixed(2)}%)
市值: $${(quote.marketCap / 1e9).toFixed(1)}B
52週: $${quote.yearLow} - $${quote.yearHigh}
50日均: $${quote.priceAvg50?.toFixed(2) || 'N/A'}
200日均: $${quote.priceAvg200?.toFixed(2) || 'N/A'}
本益比(PE): ${quote.pe?.toFixed(1) || 'N/A'}
EPS: $${quote.eps?.toFixed(2) || 'N/A'}
${consensus ? `分析師目標價共識: $${consensus.targetConsensus} (低 $${consensus.targetLow} / 高 $${consensus.targetHigh} / 中位 $${consensus.targetMedian})` : ''}
${profile?.description ? `公司簡介: ${profile.description.slice(0, 200)}` : ''}
`.trim();

    // Call Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `你是一位華爾街資深分析師，用繁體中文撰寫簡潔的投資分析報告。

根據以下數據，提供 150-200 字的分析觀點，包含：
1. 當前估值是否合理（用 PE、目標價對比）
2. 技術面判斷（50MA/200MA 相對位置）
3. 一句話結論（看多/看空/中性）

語氣要專業但直白，像在跟基金經理做 morning briefing。不要用表情符號。

${context}`
            }]
          }],
          generationConfig: {
            maxOutputTokens: 400,
            temperature: 0.7,
          }
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const geminiData = await geminiRes.json();
    const analysis = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (analysis) {
      cache.set(sym, { data: analysis, timestamp: Date.now() });
    }

    return NextResponse.json({
      analysis,
      consensus: consensus || null,
    });
  } catch (error) {
    console.error('AI analysis error:', error);
    return NextResponse.json({ analysis: null, error: 'Failed to generate analysis' });
  }
}
