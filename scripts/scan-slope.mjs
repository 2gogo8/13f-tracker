#!/usr/bin/env node
// Scanner B: 1-month slope > IXIC slope (比大盤強)
// Market cap > $5B

const API_KEY = '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const BASE = 'https://financialmodelingprep.com/stable';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function linearRegressionSlope(prices) {
  const n = prices.length;
  if (n < 10) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += prices[i];
    sumXY += i * prices[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const avgPrice = sumY / n;
  return (slope / avgPrice) * 100; // %/day
}

async function getHistorical(symbol, days = 14) {
  const url = `${BASE}/historical-price-eod/full?symbol=${symbol}&apikey=${API_KEY}`;
  const data = await fetchJSON(url);
  if (!Array.isArray(data) || data.length === 0) return null;
  data.sort((a, b) => new Date(a.date) - new Date(b.date));
  const recent = data.slice(-days);
  return recent.map(d => d.close);
}

async function main() {
  console.log('=== Scanner B: 月線斜率 > IXIC (比大盤強) ===\n');

  // 1. Get IXIC slope
  console.log('Fetching IXIC (NASDAQ Composite) data...');
  const ixicPrices = await getHistorical('^IXIC', 14);
  const ixicSlope = ixicPrices ? linearRegressionSlope(ixicPrices) : null;
  console.log(`IXIC slope: ${ixicSlope?.toFixed(4)}%/day (${(ixicSlope * 14)?.toFixed(2)}%/month)\n`);

  if (ixicSlope === null) {
    console.error('Failed to get IXIC data!');
    return;
  }

  // 2. Get stock universe
  console.log('Fetching stock universe...');
  const [sp500, nasdaq100] = await Promise.all([
    fetchJSON(`${BASE}/sp500-constituent?apikey=${API_KEY}`),
    fetchJSON(`${BASE}/nasdaq-constituent?apikey=${API_KEY}`),
  ]);
  const symbolSet = new Set();
  const stockInfo = new Map();
  for (const s of [...sp500, ...nasdaq100]) {
    if (!symbolSet.has(s.symbol)) {
      symbolSet.add(s.symbol);
      stockInfo.set(s.symbol, s);
    }
  }
  const allSymbols = [...symbolSet];
  console.log(`Universe: ${allSymbols.length} stocks\n`);

  // 3. Batch quote for market cap filter
  console.log('Fetching batch quotes for market cap...');
  const batchSize = 100;
  const candidates = [];
  for (let i = 0; i < allSymbols.length; i += batchSize) {
    const batch = allSymbols.slice(i, i + batchSize);
    const url = `${BASE}/batch-quote?symbols=${batch.join(',')}&apikey=${API_KEY}`;
    const data = await fetchJSON(url);
    for (const q of data) {
      if ((q.marketCap || 0) >= 5e9) {
        candidates.push({
          symbol: q.symbol,
          name: q.name || stockInfo.get(q.symbol)?.name || '',
          marketCap: q.marketCap,
          price: q.price,
          sector: stockInfo.get(q.symbol)?.sector || '',
        });
      }
    }
    process.stdout.write(`  Quotes: ${Math.min(i + batchSize, allSymbols.length)}/${allSymbols.length}\r`);
  }
  console.log(`\nAfter market cap >$5B: ${candidates.length} stocks\n`);

  // 4. Fetch historical for candidates and calculate slopes
  console.log('Calculating slopes...');
  const results = [];
  const concurrency = 5;

  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const promises = batch.map(async (c) => {
      try {
        const prices = await getHistorical(c.symbol, 22);
        if (!prices || prices.length < 15) return null;
        const slope = linearRegressionSlope(prices);
        if (slope === null) return null;
        return { ...c, slope, slopeMonth: slope * 14 };
      } catch {
        return null;
      }
    });
    const batchResults = await Promise.all(promises);
    for (const r of batchResults) {
      if (r && r.slope > ixicSlope) {
        results.push({ ...r, relativeStrength: (r.slope - ixicSlope) * 14 });
      }
    }
    process.stdout.write(`  Progress: ${Math.min(i + concurrency, candidates.length)}/${candidates.length} | Found: ${results.length}\r`);
  }
  console.log('\n');

  // 5. Sort by relative strength
  results.sort((a, b) => b.relativeStrength - a.relativeStrength);

  // 6. Display
  console.log(`=== 結果: ${results.length} 檔比大盤強 (市值>$5B) ===\n`);
  console.log(`IXIC 月斜率: ${(ixicSlope * 14).toFixed(2)}%\n`);
  console.log('排名 | 代號      | 月斜率%  | vs IXIC  | 市值($B) | 產業');
  console.log('-'.repeat(80));

  for (let i = 0; i < Math.min(50, results.length); i++) {
    const r = results[i];
    console.log(
      `${String(i + 1).padStart(4)} | ${r.symbol.padEnd(10)} | ${r.slopeMonth.toFixed(2).padStart(8)} | +${r.relativeStrength.toFixed(2).padStart(7)} | ${(r.marketCap / 1e9).toFixed(1).padStart(8)} | ${r.sector}`
    );
  }

  if (results.length > 50) {
    console.log(`\n... and ${results.length - 50} more`);
  }

  console.log(`\n=== 總結 ===`);
  console.log(`IXIC 月斜率: ${(ixicSlope * 14).toFixed(2)}%`);
  console.log(`市值>$5B 的股票: ${candidates.length}`);
  console.log(`比大盤強: ${results.length} (${(results.length / candidates.length * 100).toFixed(0)}%)`);
}

main().catch(console.error);
