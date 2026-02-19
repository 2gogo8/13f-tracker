#!/usr/bin/env node
// Scan S&P500 + NASDAQ-100 for: R40 ≥ 40, growth > 20%, SMA22 deviation > 1×ATR30

const API_KEY = '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const BASE = 'https://financialmodelingprep.com';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function getUniverse() {
  const [sp500, nasdaq] = await Promise.all([
    fetchJSON(`${BASE}/stable/sp500-constituent?apikey=${API_KEY}`),
    fetchJSON(`${BASE}/stable/nasdaq-constituent?apikey=${API_KEY}`),
  ]);
  const map = new Map();
  for (const s of [...(sp500 || []), ...(nasdaq || [])]) {
    if (!map.has(s.symbol)) map.set(s.symbol, s);
  }
  return [...map.values()];
}

async function getR40(symbol) {
  // Get analyst estimates for growth + current profile for margin
  const [estimates, profile] = await Promise.all([
    fetchJSON(`${BASE}/stable/analyst-estimates?symbol=${symbol}&apikey=${API_KEY}`),
    fetchJSON(`${BASE}/stable/profile?symbol=${symbol}&apikey=${API_KEY}`),
  ]);
  
  if (!estimates?.length || !profile?.length) return null;
  
  // Find next year estimate
  const now = new Date();
  const estYear = now.getMonth() + 1 <= 5 ? now.getFullYear() : now.getFullYear() + 1;
  const est = estimates.find(e => {
    const y = new Date(e.date).getFullYear();
    return y === estYear;
  });
  if (!est) return null;
  
  const revenueGrowth = est.estimatedRevenueAvg && est.estimatedRevenueAvg > 0
    ? ((est.estimatedRevenueAvg - (estimates.find(e => new Date(e.date).getFullYear() === estYear - 1)?.estimatedRevenueAvg || 0)) / (estimates.find(e => new Date(e.date).getFullYear() === estYear - 1)?.estimatedRevenueAvg || 1)) * 100
    : null;
  
  // Use income/revenue from profile or estimates
  const profitMargin = profile[0]?.lastDiv !== undefined 
    ? (est.estimatedNetIncomeAvg / est.estimatedRevenueAvg) * 100
    : null;

  if (revenueGrowth === null || profitMargin === null) return null;
  
  return { revenueGrowth, profitMargin, r40: revenueGrowth + profitMargin };
}

async function getR40Bulk(symbols) {
  // Use growth endpoint which has revenue growth + net income margin
  const results = new Map();
  
  // Batch by fetching financial-growth for each
  const batchSize = 10;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map(async (sym) => {
      try {
        const [growth, ratios] = await Promise.all([
          fetchJSON(`${BASE}/stable/financial-growth?symbol=${sym}&period=annual&limit=1&apikey=${API_KEY}`),
          fetchJSON(`${BASE}/stable/ratios?symbol=${sym}&period=annual&limit=1&apikey=${API_KEY}`),
        ]);
        
        if (!growth?.length || !ratios?.length) return;
        
        const revenueGrowth = (growth[0].revenueGrowth || 0) * 100;
        const profitMargin = (ratios[0].netProfitMargin || 0) * 100;
        const r40 = revenueGrowth + profitMargin;
        
        results.set(sym, { revenueGrowth, profitMargin, r40 });
      } catch {}
    });
    await Promise.all(promises);
    process.stdout.write(`  R40: ${Math.min(i + batchSize, symbols.length)}/${symbols.length}\r`);
  }
  console.log();
  return results;
}

async function getTechnicals(symbol) {
  const data = await fetchJSON(
    `${BASE}/stable/historical-price-eod/full?symbol=${symbol}&apikey=${API_KEY}`
  );
  if (!data?.length || data.length < 30) return null;
  
  // Data is oldest first, take last 30+ days
  const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
  const recent = sorted.slice(-50); // get 50 days for SMA22 + ATR30
  
  if (recent.length < 30) return null;
  
  const closes = recent.map(d => d.close);
  const highs = recent.map(d => d.high);
  const lows = recent.map(d => d.low);
  
  // SMA22
  const last22 = closes.slice(-22);
  const sma22 = last22.reduce((a, b) => a + b, 0) / last22.length;
  
  // ATR30 (using True Range)
  const trs = [];
  for (let i = 1; i < recent.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  const atr30 = trs.slice(-30).reduce((a, b) => a + b, 0) / Math.min(trs.length, 30);
  
  const price = closes[closes.length - 1];
  const deviation = (price - sma22) / atr30;
  
  return { price, sma22, atr30, deviation };
}

async function main() {
  console.log('取得 S&P 500 + NASDAQ-100 成分股...');
  const universe = await getUniverse();
  console.log(`共 ${universe.length} 支股票`);
  
  // Step 1: Get R40 for all
  console.log('\n步驟一：計算 Rule of 40...');
  const symbols = universe.map(s => s.symbol);
  const r40Map = await getR40Bulk(symbols);
  
  // Filter: R40 ≥ 40 AND growth > 20%
  const r40Pass = [];
  for (const [sym, data] of r40Map) {
    if (data.r40 >= 40 && data.revenueGrowth > 20) {
      r40Pass.push({ symbol: sym, ...data, name: universe.find(s => s.symbol === sym)?.name || '' });
    }
  }
  console.log(`R40 ≥ 40 且成長率 > 20%：${r40Pass.length} 支`);
  
  // Step 2: Check technicals for R40 pass
  console.log('\n步驟二：計算 SMA22 + ATR30 技術面...');
  const results = [];
  const batchSize = 5;
  for (let i = 0; i < r40Pass.length; i += batchSize) {
    const batch = r40Pass.slice(i, i + batchSize);
    const techs = await Promise.all(batch.map(async (stock) => {
      const tech = await getTechnicals(stock.symbol);
      return { ...stock, tech };
    }));
    
    for (const t of techs) {
      if (t.tech && t.tech.deviation < -1) {
        results.push(t);
      }
    }
    process.stdout.write(`  技術面: ${Math.min(i + batchSize, r40Pass.length)}/${r40Pass.length}\r`);
  }
  console.log();
  
  // Sort by deviation (most oversold first)
  results.sort((a, b) => a.tech.deviation - b.tech.deviation);
  
  console.log('\n================================================================================');
  console.log('  完全命中：R40 ≥ 40 + 成長率 > 20% + SMA22負乖離 > 1×ATR30');
  console.log('================================================================================\n');
  
  if (results.length === 0) {
    console.log('  （無符合條件的股票）');
  } else {
    for (const r of results) {
      const t = r.tech;
      console.log(`  ${r.symbol.padEnd(6)} σ=${t.deviation.toFixed(1).padStart(5)}  $${t.price.toFixed(2).padStart(8)}  R40=${r.r40.toFixed(1)} (成長${r.revenueGrowth > 0 ? '+' : ''}${r.revenueGrowth.toFixed(1)}% 利潤${r.profitMargin.toFixed(1)}%)`);
      console.log(`         SMA22=$${t.sma22.toFixed(2)}  ATR30=$${t.atr30.toFixed(2)}  ${r.name}`);
    }
  }
  
  console.log(`\n共 ${results.length} 支符合全部條件`);
  
  // Also list R40 pass but not oversold
  console.log('\n================================================================================');
  console.log('  R40 ≥ 40 + 成長率 > 20%，但尚未超跌（σ > -1）');
  console.log('================================================================================\n');
  
  const notOversold = r40Pass.filter(s => !results.find(r => r.symbol === s.symbol));
  notOversold.sort((a, b) => b.r40 - a.r40);
  for (const s of notOversold.slice(0, 20)) {
    console.log(`  ${s.symbol.padEnd(6)} R40=${s.r40.toFixed(1)} (成長+${s.revenueGrowth.toFixed(1)}% 利潤${s.profitMargin.toFixed(1)}%)`);
  }
  if (notOversold.length > 20) console.log(`  ... 還有 ${notOversold.length - 20} 支`);
}

main().catch(console.error);
