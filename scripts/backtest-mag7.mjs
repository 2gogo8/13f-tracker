// Magnificent 7 Backtest: SMA20 + ATR14 σ entry system
// Strategy: Buy at -1.5σ, SL -10%, TP +10%, after SL next entry at -4σ, after TP reset to -1.5σ

const API_KEY = '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const MAG7 = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
const START_DATE = '2022-01-01';
const INITIAL_CAPITAL = 1_000_000;

async function fetchHistory(symbol) {
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&from=2021-11-01&to=2026-02-18&apikey=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  // Returns flat array, newest first — sort ascending
  return data.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function computeIndicators(prices) {
  // Returns array with { date, close, sma20, atr14, sigma } for each day
  const result = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < 20) { result.push(null); continue; }
    
    // SMA20
    let sum = 0;
    for (let j = i - 19; j <= i; j++) sum += prices[j].close;
    const sma20 = sum / 20;
    
    // ATR14 (need at least 14 prior days with high/low)
    if (i < 14) { result.push(null); continue; }
    let atrSum = 0;
    for (let j = i - 13; j <= i; j++) {
      const tr = Math.max(
        prices[j].high - prices[j].low,
        Math.abs(prices[j].high - prices[j - 1].close),
        Math.abs(prices[j].low - prices[j - 1].close)
      );
      atrSum += tr;
    }
    const atr14 = atrSum / 14;
    
    const sigma = atr14 > 0 ? (prices[i].close - sma20) / atr14 : 0;
    
    result.push({
      date: prices[i].date,
      close: prices[i].close,
      sma20,
      atr14,
      sigma
    });
  }
  return result;
}

async function main() {
  console.log('Fetching historical data for Mag 7...');
  const allData = {};
  for (const sym of MAG7) {
    const raw = await fetchHistory(sym);
    console.log(`  ${sym}: ${raw.length} days`);
    allData[sym] = computeIndicators(raw);
  }
  
  // Build unified trading calendar from START_DATE
  const dateSet = new Set();
  for (const sym of MAG7) {
    for (const d of allData[sym]) {
      if (d && d.date >= START_DATE) dateSet.add(d.date);
    }
  }
  const tradingDays = [...dateSet].sort();
  console.log(`\nTrading days: ${tradingDays.length} (${tradingDays[0]} to ${tradingDays[tradingDays.length - 1]})\n`);
  
  // Build lookup: symbol -> date -> indicators
  const lookup = {};
  for (const sym of MAG7) {
    lookup[sym] = {};
    for (const d of allData[sym]) {
      if (d) lookup[sym][d.date] = d;
    }
  }
  
  // Backtest
  let capital = INITIAL_CAPITAL;
  let position = null; // { symbol, shares, entryPrice, entryDate }
  let sigmaThreshold = -1.5; // current entry threshold
  const trades = [];
  let maxCapital = capital;
  let maxDrawdown = 0;
  
  for (const date of tradingDays) {
    if (position) {
      // Check SL/TP
      const data = lookup[position.symbol][date];
      if (!data) continue;
      
      const pnlPct = (data.close - position.entryPrice) / position.entryPrice;
      
      if (pnlPct <= -0.10) {
        // Stop loss
        const exitValue = position.shares * data.close;
        const pnl = exitValue - (position.shares * position.entryPrice);
        capital = exitValue;
        trades.push({
          symbol: position.symbol,
          entry: position.entryDate,
          entryPrice: position.entryPrice,
          exit: date,
          exitPrice: data.close,
          pnlPct: (pnlPct * 100).toFixed(2) + '%',
          pnl: Math.round(pnl),
          capital: Math.round(capital),
          result: 'STOP LOSS',
          entrySigma: position.entrySigma
        });
        position = null;
        sigmaThreshold = -4; // After SL, need -4σ
      } else if (pnlPct >= 0.10) {
        // Take profit
        const exitValue = position.shares * data.close;
        const pnl = exitValue - (position.shares * position.entryPrice);
        capital = exitValue;
        trades.push({
          symbol: position.symbol,
          entry: position.entryDate,
          entryPrice: position.entryPrice,
          exit: date,
          exitPrice: data.close,
          pnlPct: (pnlPct * 100).toFixed(2) + '%',
          pnl: Math.round(pnl),
          capital: Math.round(capital),
          result: 'TAKE PROFIT',
          entrySigma: position.entrySigma
        });
        position = null;
        sigmaThreshold = -1.5; // After TP, reset to -1.5σ
      }
    }
    
    if (!position) {
      // Look for entry signal across all 7 stocks
      // Pick the one with lowest sigma if multiple qualify
      let bestSym = null;
      let bestSigma = Infinity;
      
      for (const sym of MAG7) {
        const data = lookup[sym][date];
        if (!data) continue;
        if (data.sigma <= sigmaThreshold && data.sigma < bestSigma) {
          bestSigma = data.sigma;
          bestSym = sym;
        }
      }
      
      if (bestSym) {
        const data = lookup[bestSym][date];
        const shares = capital / data.close;
        position = {
          symbol: bestSym,
          shares,
          entryPrice: data.close,
          entryDate: date,
          entrySigma: bestSigma.toFixed(2)
        };
      }
    }
    
    // Track max drawdown
    const currentValue = position 
      ? position.shares * (lookup[position.symbol][date]?.close || position.entryPrice)
      : capital;
    if (currentValue > maxCapital) maxCapital = currentValue;
    const dd = (maxCapital - currentValue) / maxCapital;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  
  // If still holding, mark as open
  if (position) {
    const lastDate = tradingDays[tradingDays.length - 1];
    const lastPrice = lookup[position.symbol][lastDate]?.close || position.entryPrice;
    const pnlPct = (lastPrice - position.entryPrice) / position.entryPrice;
    capital = position.shares * lastPrice;
    trades.push({
      symbol: position.symbol,
      entry: position.entryDate,
      entryPrice: position.entryPrice,
      exit: lastDate,
      exitPrice: lastPrice,
      pnlPct: (pnlPct * 100).toFixed(2) + '%',
      pnl: Math.round(position.shares * lastPrice - position.shares * position.entryPrice),
      capital: Math.round(capital),
      result: 'OPEN',
      entrySigma: position.entrySigma
    });
  }
  
  // Print results
  console.log('=== TRADE LOG ===');
  console.log('');
  for (const t of trades) {
    console.log(`${t.result.padEnd(12)} ${t.symbol.padEnd(5)} | 進場 ${t.entry} @ $${t.entryPrice.toFixed(2)} (σ=${t.entrySigma}) | 出場 ${t.exit} @ $${t.exitPrice.toFixed(2)} | ${t.pnlPct} | 損益 ${t.pnl > 0 ? '+' : ''}${t.pnl.toLocaleString()} | 資金 ${t.capital.toLocaleString()}`);
  }
  
  console.log('\n=== SUMMARY ===');
  console.log(`初始本金: ${INITIAL_CAPITAL.toLocaleString()}`);
  console.log(`最終資金: ${Math.round(capital).toLocaleString()}`);
  console.log(`總報酬率: ${((capital / INITIAL_CAPITAL - 1) * 100).toFixed(2)}%`);
  console.log(`交易次數: ${trades.length}`);
  const wins = trades.filter(t => t.result === 'TAKE PROFIT').length;
  const losses = trades.filter(t => t.result === 'STOP LOSS').length;
  const open = trades.filter(t => t.result === 'OPEN').length;
  console.log(`停利: ${wins} | 停損: ${losses} | 未平倉: ${open}`);
  console.log(`勝率: ${trades.length > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0}%`);
  console.log(`最大回撤: ${(maxDrawdown * 100).toFixed(2)}%`);
  
  // Time in market
  let daysInMarket = 0;
  for (const t of trades) {
    const start = tradingDays.indexOf(t.entry);
    const end = tradingDays.indexOf(t.exit);
    if (start >= 0 && end >= 0) daysInMarket += (end - start);
  }
  console.log(`持倉天數: ${daysInMarket} / ${tradingDays.length} (${((daysInMarket / tradingDays.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
