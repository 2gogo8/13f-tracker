// Mag 7 Backtest V2
// Entry: -1.5σ → SL deepens (-4σ, -6σ, -8σ...)
// Reset to -2σ when rebound >= 40% of total decline
// Reset to -1.5σ after take profit
// SL: -10%, TP: +10%, all-in, one position at a time

const API_KEY = '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const MAG7 = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
const START_DATE = '2022-01-01';
const INITIAL_CAPITAL = 1_000_000;

async function fetchHistory(symbol) {
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&from=2021-11-01&to=2026-02-18&apikey=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function computeIndicators(prices) {
  const result = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < 20) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - 19; j <= i; j++) sum += prices[j].close;
    const sma20 = sum / 20;
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
    result.push({ date: prices[i].date, close: prices[i].close, sma20, atr14, sigma });
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

  const dateSet = new Set();
  for (const sym of MAG7) {
    for (const d of allData[sym]) {
      if (d && d.date >= START_DATE) dateSet.add(d.date);
    }
  }
  const tradingDays = [...dateSet].sort();
  console.log(`\nTrading days: ${tradingDays.length} (${tradingDays[0]} to ${tradingDays[tradingDays.length - 1]})\n`);

  const lookup = {};
  for (const sym of MAG7) {
    lookup[sym] = {};
    for (const d of allData[sym]) {
      if (d) lookup[sym][d.date] = d;
    }
  }

  // Track market peak and trough per stock for rebound detection
  // Use a simple approach: track rolling high and low across ALL mag7 average
  // Actually, JG likely means: track the overall market decline.
  // Simpler: track a composite index of all 7 stocks (equal weight)
  
  // Compute composite index (normalized to 100 at start)
  const startPrices = {};
  for (const sym of MAG7) {
    const d = lookup[sym][tradingDays[0]];
    if (d) startPrices[sym] = d.close;
  }
  
  function compositeValue(date) {
    let total = 0, count = 0;
    for (const sym of MAG7) {
      const d = lookup[sym][date];
      if (d && startPrices[sym]) {
        total += d.close / startPrices[sym];
        count++;
      }
    }
    return count > 0 ? (total / count) * 100 : 100;
  }

  // Backtest
  let capital = INITIAL_CAPITAL;
  let position = null;
  let sigmaThreshold = -1.5;
  const trades = [];
  let maxCapital = capital;
  let maxDrawdown = 0;

  // Track peak/trough for rebound reset
  let compositePeak = 0;
  let compositeTrough = Infinity;
  let peakDate = '';
  let inDecline = false; // are we in a declining phase?

  for (const date of tradingDays) {
    const cv = compositeValue(date);
    
    // Track peak
    if (cv > compositePeak) {
      compositePeak = cv;
      compositeTrough = cv; // reset trough when new peak
      peakDate = date;
      inDecline = false;
    }
    
    // Track trough
    if (cv < compositeTrough) {
      compositeTrough = cv;
      inDecline = true;
    }
    
    // Check rebound: if declined and now rebounded 40% of decline
    if (inDecline && compositePeak > compositeTrough) {
      const totalDecline = compositePeak - compositeTrough;
      const rebound = cv - compositeTrough;
      if (rebound >= totalDecline * 0.4) {
        // Reset to -2σ (only if currently deeper than -2σ)
        if (sigmaThreshold < -2) {
          console.log(`  [REBOUND RESET] ${date} | composite rebounded 40% (peak=${compositePeak.toFixed(1)}, trough=${compositeTrough.toFixed(1)}, now=${cv.toFixed(1)}) | threshold: ${sigmaThreshold}σ → -2σ`);
          sigmaThreshold = -2;
        }
        // Reset tracking
        compositePeak = cv;
        compositeTrough = cv;
        inDecline = false;
      }
    }

    if (position) {
      const data = lookup[position.symbol][date];
      if (!data) continue;
      const pnlPct = (data.close - position.entryPrice) / position.entryPrice;

      if (pnlPct <= -0.10) {
        const exitValue = position.shares * data.close;
        const pnl = exitValue - (position.shares * position.entryPrice);
        capital = exitValue;
        
        // Deepen threshold: -1.5 → -4 → -6 → -8 ...
        const prevThreshold = sigmaThreshold;
        if (sigmaThreshold === -1.5) {
          sigmaThreshold = -4;
        } else {
          sigmaThreshold -= 2;
        }
        
        trades.push({
          symbol: position.symbol, entry: position.entryDate, entryPrice: position.entryPrice,
          exit: date, exitPrice: data.close, pnlPct: (pnlPct * 100).toFixed(2) + '%',
          pnl: Math.round(pnl), capital: Math.round(capital), result: 'STOP LOSS',
          entrySigma: position.entrySigma, nextThreshold: sigmaThreshold
        });
        position = null;
      } else if (pnlPct >= 0.10) {
        const exitValue = position.shares * data.close;
        const pnl = exitValue - (position.shares * position.entryPrice);
        capital = exitValue;
        sigmaThreshold = -1.5;
        trades.push({
          symbol: position.symbol, entry: position.entryDate, entryPrice: position.entryPrice,
          exit: date, exitPrice: data.close, pnlPct: (pnlPct * 100).toFixed(2) + '%',
          pnl: Math.round(pnl), capital: Math.round(capital), result: 'TAKE PROFIT',
          entrySigma: position.entrySigma, nextThreshold: sigmaThreshold
        });
        position = null;
      }
    }

    if (!position) {
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
        position = {
          symbol: bestSym, shares: capital / data.close,
          entryPrice: data.close, entryDate: date, entrySigma: bestSigma.toFixed(2)
        };
      }
    }

    const currentValue = position
      ? position.shares * (lookup[position.symbol][date]?.close || position.entryPrice)
      : capital;
    if (currentValue > maxCapital) maxCapital = currentValue;
    const dd = (maxCapital - currentValue) / maxCapital;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  if (position) {
    const lastDate = tradingDays[tradingDays.length - 1];
    const lastPrice = lookup[position.symbol][lastDate]?.close || position.entryPrice;
    const pnlPct = (lastPrice - position.entryPrice) / position.entryPrice;
    capital = position.shares * lastPrice;
    trades.push({
      symbol: position.symbol, entry: position.entryDate, entryPrice: position.entryPrice,
      exit: lastDate, exitPrice: lastPrice, pnlPct: (pnlPct * 100).toFixed(2) + '%',
      pnl: Math.round(position.shares * lastPrice - position.shares * position.entryPrice),
      capital: Math.round(capital), result: 'OPEN', entrySigma: position.entrySigma, nextThreshold: sigmaThreshold
    });
  }

  console.log('\n=== TRADE LOG ===\n');
  for (const t of trades) {
    const next = t.nextThreshold !== undefined ? ` → 下次門檻: ${t.nextThreshold}σ` : '';
    console.log(`${t.result.padEnd(12)} ${t.symbol.padEnd(5)} | 進場 ${t.entry} @ $${t.entryPrice.toFixed(2)} (σ=${t.entrySigma}) | 出場 ${t.exit} @ $${t.exitPrice.toFixed(2)} | ${t.pnlPct} | 損益 ${t.pnl > 0 ? '+' : ''}${t.pnl.toLocaleString()} | 資金 ${t.capital.toLocaleString()}${next}`);
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
  console.log(`勝率: ${(wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0}%`);
  console.log(`最大回撤: ${(maxDrawdown * 100).toFixed(2)}%`);
  
  let daysInMarket = 0;
  for (const t of trades) {
    const start = tradingDays.indexOf(t.entry);
    const end = tradingDays.indexOf(t.exit);
    if (start >= 0 && end >= 0) daysInMarket += (end - start);
  }
  console.log(`持倉天數: ${daysInMarket} / ${tradingDays.length} (${((daysInMarket / tradingDays.length) * 100).toFixed(1)}%)`);
  
  // Compare to buy and hold
  const sp = {}, ep = {};
  for (const sym of MAG7) {
    sp[sym] = lookup[sym][tradingDays[0]]?.close;
    ep[sym] = lookup[sym][tradingDays[tradingDays.length - 1]]?.close;
  }
  let bhReturn = 0;
  for (const sym of MAG7) {
    if (sp[sym] && ep[sym]) bhReturn += (ep[sym] / sp[sym] - 1);
  }
  bhReturn = (bhReturn / MAG7.length) * 100;
  console.log(`\n七巨頭等權 Buy & Hold 報酬: ${bhReturn.toFixed(2)}%`);
  console.log(`策略 vs Buy&Hold: ${((capital / INITIAL_CAPITAL - 1) * 100 - bhReturn).toFixed(2)}% 差距`);
}

main().catch(console.error);
