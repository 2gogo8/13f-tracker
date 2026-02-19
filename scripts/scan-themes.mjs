// Scan stocks from the 3 investment themes:
// A. Physical AI & Defense  B. Energy Infrastructure  C. Monopoly Platforms  D. AI Agent/AGI
// Criteria: SMA20 negative deviation > 1x ATR30 (σ < -1) + R40 ≥ 40

const API_KEY = '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const BASE = 'https://financialmodelingprep.com';

const THEMES = {
  '物理AI＆國防': ['PLTR','LMT','RTX','NOC','GD','LHX','BAH','LDOS','KTOS','AXON','RKLB','ASTS'],
  '能源＆電力基建': ['CEG','VST','SMR','NNE','OKLO','CCJ','LEU','VRT','EMR','ETN','PWR','ANET','DLR','EQIX','AME'],
  '壟斷型平台': ['AAPL','MSFT','GOOGL','META','AMZN','NFLX','CRM','ORCL','ADBE','NOW','INTU'],
  'AI Agent＆AGI': ['PLTR','CRWD','DDOG','SNOW','NET','ZS','PANW','FTNT','PATH','AI','SOUN','UPST','HUBS','MNDY','DKNG','APP','HOOD'],
  'AI賣水人(半導體)': ['NVDA','AVGO','AMD','QCOM','MU','MRVL','LRCX','KLAC','CDNS','SNPS','ARM','SMCI','TSM','ASML'],
};

async function fetchHistorical(symbol) {
  try {
    const res = await fetch(`${BASE}/stable/historical-price-eod/full?symbol=${symbol}&apikey=${API_KEY}`, 
      { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const items = Array.isArray(data) ? data : [];
    if (items.length < 31) return null;
    items.sort((a, b) => a.date.localeCompare(b.date));
    return items;
  } catch { return null; }
}

function calcIndicators(prices) {
  if (prices.length < 131) return null;
  const cur = prices[prices.length - 1].close;
  const sma20 = prices.slice(-20).reduce((s, d) => s + d.close, 0) / 20;
  const sma130 = prices.slice(-130).reduce((s, d) => s + d.close, 0) / 130;
  const recent31 = prices.slice(-31);
  let trSum = 0;
  for (let i = 1; i < recent31.length; i++) {
    trSum += Math.max(
      recent31[i].high - recent31[i].low,
      Math.abs(recent31[i].high - recent31[i - 1].close),
      Math.abs(recent31[i].low - recent31[i - 1].close)
    );
  }
  const atr30 = trSum / 30;
  if (atr30 === 0) return null;
  const sigma = (cur - sma20) / atr30;
  return { price: cur, sma20, sma130, atr30, sigma, uptrend: cur > sma130 };
}

async function fetchR40(symbol) {
  try {
    const res = await fetch(`${BASE}/stable/analyst-estimates?symbol=${symbol}&period=annual&limit=6&apikey=${API_KEY}`,
      { signal: AbortSignal.timeout(8000) });
    const est = await res.json();
    if (!Array.isArray(est) || est.length < 2) return null;
    let rev25 = 0, rev26 = 0, ni26 = 0;
    for (const e of est) {
      const cy = new Date(e.date).getMonth() <= 5 ? new Date(e.date).getFullYear() - 1 : new Date(e.date).getFullYear();
      if (cy === 2025 && !rev25) rev25 = e.revenueAvg;
      if (cy === 2026 && !rev26) { rev26 = e.revenueAvg; ni26 = e.netIncomeAvg; }
    }
    if (!rev25 || !rev26) return null;
    const growth = ((rev26 - rev25) / rev25) * 100;
    const margin = rev26 > 0 ? (ni26 / rev26) * 100 : 0;
    return { growth: Math.round(growth * 10) / 10, margin: Math.round(margin * 10) / 10, r40: Math.round((growth + margin) * 10) / 10 };
  } catch { return null; }
}

async function main() {
  // Deduplicate symbols across themes
  const allSymbols = [...new Set(Object.values(THEMES).flat())];
  console.log(`掃描 ${allSymbols.length} 支股票...\n`);

  // Fetch all historical data
  const dataMap = {};
  for (let i = 0; i < allSymbols.length; i += 5) {
    const batch = allSymbols.slice(i, i + 5);
    const results = await Promise.all(batch.map(async s => {
      const h = await fetchHistorical(s);
      return { symbol: s, data: h };
    }));
    for (const r of results) dataMap[r.symbol] = r.data;
    process.stdout.write(`  ${Math.min(i + 5, allSymbols.length)}/${allSymbols.length}\r`);
  }

  // Calculate indicators + R40
  const hits = [];
  const nearMiss = [];
  
  for (const sym of allSymbols) {
    const prices = dataMap[sym];
    if (!prices) continue;
    const ind = calcIndicators(prices);
    if (!ind) continue;
    
    // Criteria 1 & 2: σ < -1 (negative deviation > 1x ATR30)
    if (ind.sigma >= -1) {
      if (ind.sigma < 0) nearMiss.push({ symbol: sym, ...ind, r40: null });
      continue;
    }
    
    // Criteria 3: R40
    const r40 = await fetchR40(sym);
    
    // Find which themes this stock belongs to
    const themes = Object.entries(THEMES)
      .filter(([, syms]) => syms.includes(sym))
      .map(([name]) => name);
    
    const entry = { symbol: sym, ...ind, r40Data: r40, themes };
    
    if (r40 && r40.r40 >= 40) {
      hits.push(entry);
    } else {
      nearMiss.push(entry);
    }
  }

  // Print results
  hits.sort((a, b) => a.sigma - b.sigma);
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  完全命中：SMA20 負乖離 > 1×ATR30 + R40 ≥ 40`);
  console.log(`${'='.repeat(80)}\n`);
  
  if (hits.length === 0) {
    console.log('  （無命中）\n');
  }
  for (const h of hits) {
    const trend = h.uptrend ? '↑趨勢向上' : '↓趨勢向下';
    console.log(`  ${h.symbol.padEnd(6)} σ=${h.sigma.toFixed(1).padEnd(5)} $${h.price.toFixed(2).padEnd(8)} ${trend.padEnd(8)} R40=${h.r40Data.r40} (成長${h.r40Data.growth > 0 ? '+' : ''}${h.r40Data.growth}% 利潤${h.r40Data.margin}%)`);
    console.log(`           主題: ${h.themes.join(', ')}`);
  }

  // σ < -2 near misses (missing R40)
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  σ < -1 但 R40 不足 或 無數據`);
  console.log(`${'='.repeat(80)}\n`);
  
  const deepNear = nearMiss.filter(n => n.sigma < -1).sort((a, b) => a.sigma - b.sigma);
  for (const n of deepNear) {
    const trend = n.uptrend ? '↑' : '↓';
    const r40str = n.r40Data ? `R40=${n.r40Data.r40}` : 'R40=無數據';
    const themes = Object.entries(THEMES)
      .filter(([, syms]) => syms.includes(n.symbol))
      .map(([name]) => name).join(', ');
    console.log(`  ${n.symbol.padEnd(6)} σ=${n.sigma.toFixed(1).padEnd(5)} $${n.price.toFixed(2).padEnd(8)} ${trend} ${r40str.padEnd(12)} ${themes}`);
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  各主題概況`);
  console.log(`${'='.repeat(80)}\n`);
  
  for (const [theme, syms] of Object.entries(THEMES)) {
    const themeStocks = syms.map(s => {
      const prices = dataMap[s];
      if (!prices) return null;
      const ind = calcIndicators(prices);
      if (!ind) return null;
      return { symbol: s, sigma: ind.sigma };
    }).filter(Boolean);
    
    const oversold = themeStocks.filter(s => s.sigma < -1);
    const deep = themeStocks.filter(s => s.sigma < -2);
    console.log(`  ${theme}: ${themeStocks.length} 支 | σ<-1: ${oversold.length} 支 | σ<-2: ${deep.length} 支`);
    if (oversold.length > 0) {
      console.log(`    ${oversold.map(s => `${s.symbol}(${s.sigma.toFixed(1)})`).join(' ')}`);
    }
  }
}

main().catch(console.error);
