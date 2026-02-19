const FMP_KEY = '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';

async function test() {
  const sp500Res = await fetch('https://financialmodelingprep.com/stable/sp500-constituent?apikey=' + FMP_KEY);
  const sp500 = await sp500Res.json();
  const nasdaqRes = await fetch('https://financialmodelingprep.com/stable/nasdaq-constituent?apikey=' + FMP_KEY);
  const nasdaq = await nasdaqRes.json();
  
  const allSymbols = [...new Set([...sp500.map(s=>s.symbol), ...nasdaq.map(s=>s.symbol)])];
  console.log('Total symbols:', allSymbols.length);
  
  // Batch quote with priceAvg50
  let prefiltered = [];
  const batchSize = 50;
  for (let i = 0; i < allSymbols.length; i += batchSize) {
    const batch = allSymbols.slice(i, i + batchSize).join(',');
    const res = await fetch('https://financialmodelingprep.com/stable/batch-quote?symbols=' + batch + '&apikey=' + FMP_KEY);
    const text = await res.text();
    let quotes;
    try { quotes = JSON.parse(text); } catch { console.log('batch parse error, skip'); continue; }
    if (!Array.isArray(quotes)) continue;
    for (const q of quotes) {
      if (q.priceAvg50 && q.price < q.priceAvg50) {
        prefiltered.push({ symbol: q.symbol, price: q.price, avg50: q.priceAvg50 });
      }
    }
  }
  console.log('Stage 1 (price < SMA50):', prefiltered.length, 'stocks');
  
  // Stage 2: compute SMA20 + ATR30 + SMA130 for ALL prefiltered
  let results = [];
  let checked = 0;
  for (const stock of prefiltered) {
    let hist;
    try {
      const hRes = await fetch('https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=' + stock.symbol + '&apikey=' + FMP_KEY);
      hist = await hRes.json();
    } catch { continue; }
    if (!Array.isArray(hist) || hist.length < 131) continue;
    const prices = hist.sort((a,b) => new Date(a.date) - new Date(b.date));
    const recent = prices.slice(-131);
    
    const sma20 = recent.slice(-20).reduce((s,d) => s + d.close, 0) / 20;
    const sma130 = recent.reduce((s,d) => s + d.close, 0) / 131;
    
    let trSum = 0;
    for (let i = recent.length - 30; i < recent.length; i++) {
      const h = recent[i].high, l = recent[i].low, pc = recent[i-1]?.close || recent[i].close;
      trSum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    const atr30 = trSum / 30;
    const currentPrice = recent[recent.length - 1].close;
    const deviation = (currentPrice - sma20) / atr30;
    const isUptrend = currentPrice > sma130;
    checked++;
    
    if (isUptrend && deviation < -1) {
      results.push({ symbol: stock.symbol, deviation: +deviation.toFixed(2), price: currentPrice, sma20: +sma20.toFixed(2), sma130: +sma130.toFixed(2) });
    }
  }
  
  results.sort((a,b) => a.deviation - b.deviation);
  console.log(`\nChecked ${checked} stocks. Found ${results.length} with uptrend + σ < -1:\n`);
  for (const r of results) {
    console.log(`${r.symbol.padEnd(6)} σ=${String(r.deviation).padEnd(6)} price=${r.price} sma20=${r.sma20} sma130=${r.sma130}`);
  }
}

test().catch(e => console.error(e));
