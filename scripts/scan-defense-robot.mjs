#!/usr/bin/env node
// Scan defense + robotics stocks for R40 ≥ 40, growth > 20%, SMA22 deviation > 1×ATR30

const API_KEY = '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const BASE = 'https://financialmodelingprep.com';

const STOCKS = [
  // Defense / Aerospace
  { symbol: 'LMT', name: 'Lockheed Martin' },
  { symbol: 'RTX', name: 'RTX (Raytheon)' },
  { symbol: 'NOC', name: 'Northrop Grumman' },
  { symbol: 'GD', name: 'General Dynamics' },
  { symbol: 'LHX', name: 'L3Harris Technologies' },
  { symbol: 'BAH', name: 'Booz Allen Hamilton' },
  { symbol: 'LDOS', name: 'Leidos Holdings' },
  { symbol: 'AXON', name: 'Axon Enterprise' },
  { symbol: 'PLTR', name: 'Palantir Technologies' },
  { symbol: 'HII', name: 'Huntington Ingalls' },
  { symbol: 'KTOS', name: 'Kratos Defense' },
  { symbol: 'RKLB', name: 'Rocket Lab' },
  { symbol: 'ASTS', name: 'AST SpaceMobile' },
  { symbol: 'LUNR', name: 'Intuitive Machines' },
  { symbol: 'RDW', name: 'Redwire Corp' },
  { symbol: 'BWXT', name: 'BWX Technologies' },
  { symbol: 'MRCY', name: 'Mercury Systems' },
  { symbol: 'AVAV', name: 'AeroVironment' },
  { symbol: 'TDG', name: 'TransDigm Group' },
  { symbol: 'HEI', name: 'HEICO Corp' },
  { symbol: 'ACHR', name: 'Archer Aviation' },
  { symbol: 'JOBY', name: 'Joby Aviation' },
  
  // Robotics / Automation / Humanoid
  { symbol: 'ISRG', name: 'Intuitive Surgical' },
  { symbol: 'ROK', name: 'Rockwell Automation' },
  { symbol: 'TER', name: 'Teradyne (Universal Robots)' },
  { symbol: 'CGNX', name: 'Cognex Corp' },
  { symbol: 'BRKS', name: 'Brooks Automation' },
  { symbol: 'IRBT', name: 'iRobot' },
  { symbol: 'RGTI', name: 'Rigetti Computing' },
  { symbol: 'SERV', name: 'Serve Robotics' },
  { symbol: 'RBRK', name: 'Rubrik' },
  { symbol: 'PATH', name: 'UiPath (RPA)' },
  { symbol: 'FANUY', name: 'Fanuc (ADR)' },
  { symbol: 'ABBNY', name: 'ABB (ADR)' },
  { symbol: 'SMCI', name: 'Super Micro (AI infra)' },
  { symbol: 'MRVL', name: 'Marvell Technology' },
  { symbol: 'ON', name: 'ON Semiconductor' },
  { symbol: 'AGILN', name: 'Agilent' },
  { symbol: 'NNDM', name: 'Nano Dimension' },
  { symbol: 'AEHR', name: 'Aehr Test Systems' },
  { symbol: 'NVDA', name: 'NVIDIA (robotics enabler)' },
];

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function scan(stock) {
  const [growth, ratios, hist] = await Promise.all([
    fetchJSON(`${BASE}/stable/financial-growth?symbol=${stock.symbol}&period=annual&limit=1&apikey=${API_KEY}`),
    fetchJSON(`${BASE}/stable/ratios?symbol=${stock.symbol}&period=annual&limit=1&apikey=${API_KEY}`),
    fetchJSON(`${BASE}/stable/historical-price-eod/full?symbol=${stock.symbol}&apikey=${API_KEY}`),
  ]);

  const revenueGrowth = growth?.[0]?.revenueGrowth ? growth[0].revenueGrowth * 100 : null;
  const profitMargin = ratios?.[0]?.netProfitMargin ? ratios[0].netProfitMargin * 100 : null;
  const r40 = (revenueGrowth !== null && profitMargin !== null) ? revenueGrowth + profitMargin : null;

  let tech = null;
  if (hist?.length >= 30) {
    const sorted = [...hist].sort((a, b) => new Date(a.date) - new Date(b.date));
    const recent = sorted.slice(-50);
    const closes = recent.map(d => d.close);
    const highs = recent.map(d => d.high);
    const lows = recent.map(d => d.low);

    const sma22 = closes.slice(-22).reduce((a, b) => a + b, 0) / Math.min(closes.length, 22);
    const trs = [];
    for (let i = 1; i < recent.length; i++) {
      trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
    }
    const atr30 = trs.slice(-30).reduce((a, b) => a + b, 0) / Math.min(trs.length, 30);
    const price = closes[closes.length - 1];
    tech = { price, sma22, atr30, deviation: (price - sma22) / atr30 };
  }

  return { ...stock, revenueGrowth, profitMargin, r40, tech };
}

async function main() {
  console.log(`掃描 ${STOCKS.length} 支國防＋機器人股票...\n`);

  const results = [];
  const batchSize = 5;
  for (let i = 0; i < STOCKS.length; i += batchSize) {
    const batch = STOCKS.slice(i, i + batchSize);
    const res = await Promise.all(batch.map(scan));
    results.push(...res);
    process.stdout.write(`  ${Math.min(i + batchSize, STOCKS.length)}/${STOCKS.length}\r`);
  }
  console.log();

  // Full match
  const fullMatch = results.filter(r => r.r40 >= 40 && r.revenueGrowth > 20 && r.tech?.deviation < -1);
  fullMatch.sort((a, b) => a.tech.deviation - b.tech.deviation);

  console.log('================================================================================');
  console.log('  完全命中：R40 ≥ 40 + 成長率 > 20% + SMA22負乖離 > 1×ATR30');
  console.log('================================================================================\n');
  for (const r of fullMatch) {
    console.log(`  ${r.symbol.padEnd(6)} σ=${r.tech.deviation.toFixed(1).padStart(5)}  $${r.tech.price.toFixed(2).padStart(8)}  R40=${r.r40.toFixed(1)} (成長${r.revenueGrowth > 0?'+':''}${r.revenueGrowth.toFixed(1)}% 利潤${r.profitMargin.toFixed(1)}%)  ${r.name}`);
  }
  if (!fullMatch.length) console.log('  （無）');

  // Partial: R40 ≥ 40 + growth > 20% but not oversold
  const partial1 = results.filter(r => r.r40 >= 40 && r.revenueGrowth > 20 && (!r.tech || r.tech.deviation >= -1));
  partial1.sort((a, b) => (b.r40 || 0) - (a.r40 || 0));
  console.log('\n================================================================================');
  console.log('  R40 ≥ 40 + 成長率 > 20%，但尚未超跌');
  console.log('================================================================================\n');
  for (const r of partial1) {
    const sigma = r.tech ? `σ=${r.tech.deviation.toFixed(1)}` : 'σ=N/A';
    console.log(`  ${r.symbol.padEnd(6)} ${sigma.padStart(7)}  R40=${r.r40.toFixed(1)} (成長+${r.revenueGrowth.toFixed(1)}% 利潤${r.profitMargin.toFixed(1)}%)  ${r.name}`);
  }
  if (!partial1.length) console.log('  （無）');

  // Oversold but R40 not met
  const oversold = results.filter(r => r.tech?.deviation < -1 && !(r.r40 >= 40 && r.revenueGrowth > 20));
  oversold.sort((a, b) => a.tech.deviation - b.tech.deviation);
  console.log('\n================================================================================');
  console.log('  超跌（σ < -1）但 R40 不足或成長率 ≤ 20%');
  console.log('================================================================================\n');
  for (const r of oversold) {
    const r40str = r.r40 !== null ? `R40=${r.r40.toFixed(1)} (成長${r.revenueGrowth > 0?'+':''}${r.revenueGrowth?.toFixed(1)}% 利潤${r.profitMargin?.toFixed(1)}%)` : 'R40=無數據';
    console.log(`  ${r.symbol.padEnd(6)} σ=${r.tech.deviation.toFixed(1).padStart(5)}  $${r.tech.price.toFixed(2).padStart(8)}  ${r40str}  ${r.name}`);
  }
  if (!oversold.length) console.log('  （無）');

  // All data dump
  console.log('\n================================================================================');
  console.log('  全部數據一覽');
  console.log('================================================================================\n');
  results.sort((a, b) => (a.tech?.deviation ?? 99) - (b.tech?.deviation ?? 99));
  for (const r of results) {
    const sigma = r.tech ? `σ=${r.tech.deviation.toFixed(1).padStart(5)}` : 'σ=  N/A';
    const price = r.tech ? `$${r.tech.price.toFixed(2).padStart(8)}` : '$     N/A';
    const r40str = r.r40 !== null ? `R40=${r.r40.toFixed(1).padStart(6)}` : 'R40=   N/A';
    const gstr = r.revenueGrowth !== null ? `成長${r.revenueGrowth > 0?'+':''}${r.revenueGrowth.toFixed(1)}%` : '成長N/A';
    const mstr = r.profitMargin !== null ? `利潤${r.profitMargin.toFixed(1)}%` : '利潤N/A';
    const tag = (r.r40 >= 40 && r.revenueGrowth > 20 && r.tech?.deviation < -1) ? ' ★' : '';
    console.log(`  ${r.symbol.padEnd(6)} ${sigma} ${price} ${r40str} (${gstr} ${mstr}) ${r.name}${tag}`);
  }
}

main().catch(console.error);
