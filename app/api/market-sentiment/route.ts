import { NextResponse } from 'next/server';

const FMP_KEY = process.env.FMP_API_KEY || '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';

export const maxDuration = 30;

// Calculate market sentiment from multiple signals
export async function GET() {
  try {
    const signals: { name: string; score: number; label: string }[] = [];

    // Signal 1: Market breadth from sector performance
    try {
      const sectorRes = await fetch(
        `https://financialmodelingprep.com/stable/sector-performance?apikey=${FMP_KEY}`,
        { next: { revalidate: 7200 } }
      );
      const sectors = await sectorRes.json();
      if (Array.isArray(sectors) && sectors.length > 0) {
        const changes = sectors.map((s: { changesPercentage: string }) =>
          parseFloat(s.changesPercentage)
        ).filter((v: number) => !isNaN(v));
        const positive = changes.filter((c: number) => c > 0).length;
        const avg = changes.reduce((a: number, b: number) => a + b, 0) / changes.length;
        // Breadth: % of sectors positive (0-100)
        const breadthScore = (positive / changes.length) * 100;
        // Momentum: avg change mapped to 0-100 (±3% range)
        const momentumScore = Math.max(0, Math.min(100, 50 + (avg / 3) * 50));
        signals.push({ name: '板塊廣度', score: Math.round(breadthScore), label: `${positive}/${changes.length} 板塊上漲` });
        signals.push({ name: '板塊動能', score: Math.round(momentumScore), label: `平均 ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%` });
      }
    } catch { /* skip */ }

    // Signal 2: Market gainers vs losers
    try {
      const [gainersRes, losersRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/stable/gainers?apikey=${FMP_KEY}`, { next: { revalidate: 7200 } }),
        fetch(`https://financialmodelingprep.com/stable/losers?apikey=${FMP_KEY}`, { next: { revalidate: 7200 } }),
      ]);
      const gainers = await gainersRes.json();
      const losers = await losersRes.json();
      if (Array.isArray(gainers) && Array.isArray(losers)) {
        const gAvg = gainers.slice(0, 10).reduce((a: number, g: { changesPercentage?: number }) => a + (g.changesPercentage ?? 0), 0) / Math.max(1, gainers.slice(0, 10).length);
        const lAvg = Math.abs(losers.slice(0, 10).reduce((a: number, l: { changesPercentage?: number }) => a + (l.changesPercentage ?? 0), 0) / Math.max(1, losers.slice(0, 10).length));
        // If gainers are stronger than losers, bullish
        const ratio = gAvg / Math.max(0.01, gAvg + lAvg);
        const score = Math.round(ratio * 100);
        signals.push({ name: '漲跌力道', score, label: `漲 ${gAvg.toFixed(1)}% vs 跌 ${lAvg.toFixed(1)}%` });
      }
    } catch { /* skip */ }

    // Signal 3: Most active stocks sentiment
    try {
      const activeRes = await fetch(
        `https://financialmodelingprep.com/stable/actives?apikey=${FMP_KEY}`,
        { next: { revalidate: 7200 } }
      );
      const actives = await activeRes.json();
      if (Array.isArray(actives) && actives.length > 0) {
        const top20 = actives.slice(0, 20);
        const positive = top20.filter((s: { changesPercentage?: number }) => (s.changesPercentage ?? 0) > 0).length;
        const score = Math.round((positive / top20.length) * 100);
        signals.push({ name: '熱門股情緒', score, label: `${positive}/${top20.length} 檔上漲` });
      }
    } catch { /* skip */ }

    // Calculate overall score
    const overall = signals.length > 0
      ? Math.round(signals.reduce((a, s) => a + s.score, 0) / signals.length)
      : 50;

    // Determine label
    let overallLabel: string;
    let overallEmoji: string;
    if (overall >= 80) { overallLabel = '極度貪婪'; overallEmoji = '🔥'; }
    else if (overall >= 65) { overallLabel = '貪婪'; overallEmoji = '😎'; }
    else if (overall >= 45) { overallLabel = '中性'; overallEmoji = '😐'; }
    else if (overall >= 25) { overallLabel = '恐懼'; overallEmoji = '😰'; }
    else { overallLabel = '極度恐懼'; overallEmoji = '💀'; }

    return NextResponse.json({
      overall,
      label: overallLabel,
      emoji: overallEmoji,
      signals,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Market sentiment error:', error);
    return NextResponse.json({ overall: 50, label: '中性', emoji: '😐', signals: [], updatedAt: new Date().toISOString() });
  }
}
