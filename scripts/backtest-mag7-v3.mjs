// Mag 7 Backtest V3 - Parameter Sweep
// Find: double profit without increasing total loss amount

const API_KEY = '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const MAG7 = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
const START_DATE = '2022-01-01';
const INITIAL_CAPITAL = 1_000_000;

let cachedData = null;

async function fetchAllData() {
  if (cachedData) return cachedData;
  const allData = {};
  for (const sym of MAG7) {
    const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${sym}&from=2021-11-01&to=2026-02-18&apikey=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    allData[sym] = data.sort((a, b) => new Date(a.date) - new Date(b.date));
  }
  cachedData = allData;
  return allData;
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
    result.push({ date: prices[i].date, close: prices[i].close, high: prices[i].high, low: prices[i].low, sma20, atr14, sigma });
  }
  return result;
}

function runBacktest(config) {
  const {
    lookup, tradingDays, startPrices,
    slPct = -0.10,       // stop loss %
    tpPct = 0.10,        // take profit %
    trailingStop = false, // use trailing stop?
    trailPct = 0.10,     // trailing stop distance
    entryStart = -1.5,   // initial sigma entry
    slDeepen = -2.5,     // how much to deepen after SL (-1.5 → -4 = -2.5 step)
    reboundReset = -2,   // reset to this sigma on 40% rebound
    excludeSymbols = [], // symbols to exclude
    halfPosition = false, // use 50% position?
  } = config;

  const symbols = MAG7.filter(s => !excludeSymbols.includes(s));
  
  function compositeValue(date) {
    let total = 0, count = 0;
    for (const sym of symbols) {
      const d = lookup[sym][date];
      if (d && startPrices[sym]) { total += d.close / startPrices[sym]; count++; }
    }
    return count > 0 ? (total / count) * 100 : 100;
  }

  let capital = INITIAL_CAPITAL;
  let position = null;
  let sigmaThreshold = entryStart;
  let totalLoss = 0, totalProfit = 0;
  let trades = [];
  let maxCapital = capital, maxDrawdown = 0;
  let compositePeak = 0, compositeTrough = Infinity, inDecline = false;
  let trailHigh = 0; // for trailing stop

  for (const date of tradingDays) {
    const cv = compositeValue(date);
    if (cv > compositePeak) { compositePeak = cv; compositeTrough = cv; inDecline = false; }
    if (cv < compositeTrough) { compositeTrough = cv; inDecline = true; }
    if (inDecline && compositePeak > compositeTrough) {
      const totalDecline = compositePeak - compositeTrough;
      const rebound = cv - compositeTrough;
      if (rebound >= totalDecline * 0.4 && sigmaThreshold < reboundReset) {
        sigmaThreshold = reboundReset;
        compositePeak = cv; compositeTrough = cv; inDecline = false;
      }
    }

    if (position) {
      const data = lookup[position.symbol][date];
      if (!data) continue;
      
      // Update trailing high
      if (data.close > trailHigh) trailHigh = data.close;
      
      const pnlPct = (data.close - position.entryPrice) / position.entryPrice;
      
      // Check stop loss
      let stopped = pnlPct <= slPct;
      
      // Check trailing stop (only if in profit and trailing enabled)
      let trailStopped = false;
      if (trailingStop && trailHigh > position.entryPrice) {
        const dropFromHigh = (data.close - trailHigh) / trailHigh;
        if (dropFromHigh <= -trailPct) {
          trailStopped = true;
        }
      }
      
      if (stopped) {
        const investAmt = halfPosition ? capital * 0.5 : capital;
        const shares = investAmt / position.entryPrice;
        const exitValue = shares * data.close;
        const pnl = exitValue - investAmt;
        capital = (halfPosition ? capital * 0.5 : 0) + exitValue;
        totalLoss += Math.abs(pnl);
        
        const prev = sigmaThreshold;
        if (sigmaThreshold === entryStart) sigmaThreshold = entryStart + slDeepen;
        else sigmaThreshold += slDeepen;
        
        trades.push({ result: 'SL', pnl, pnlPct: pnlPct * 100 });
        position = null;
        trailHigh = 0;
      } else if (trailStopped && pnlPct > 0) {
        const investAmt = halfPosition ? capital * 0.5 : capital;
        const shares = investAmt / position.entryPrice;
        const exitValue = shares * data.close;
        const pnl = exitValue - investAmt;
        capital = (halfPosition ? capital * 0.5 : 0) + exitValue;
        if (pnl > 0) totalProfit += pnl; else totalLoss += Math.abs(pnl);
        sigmaThreshold = entryStart;
        trades.push({ result: 'TRAIL', pnl, pnlPct: pnlPct * 100 });
        position = null;
        trailHigh = 0;
      } else if (!trailingStop && pnlPct >= tpPct) {
        const investAmt = halfPosition ? capital * 0.5 : capital;
        const shares = investAmt / position.entryPrice;
        const exitValue = shares * data.close;
        const pnl = exitValue - investAmt;
        capital = (halfPosition ? capital * 0.5 : 0) + exitValue;
        totalProfit += pnl;
        sigmaThreshold = entryStart;
        trades.push({ result: 'TP', pnl, pnlPct: pnlPct * 100 });
        position = null;
        trailHigh = 0;
      }
    }

    if (!position) {
      let bestSym = null, bestSigma = Infinity;
      for (const sym of symbols) {
        const data = lookup[sym][date];
        if (!data) continue;
        if (data.sigma <= sigmaThreshold && data.sigma < bestSigma) {
          bestSigma = data.sigma; bestSym = sym;
        }
      }
      if (bestSym) {
        const data = lookup[bestSym][date];
        position = { symbol: bestSym, entryPrice: data.close, entryDate: date };
        trailHigh = data.close;
      }
    }

    const posValue = halfPosition ? capital * 0.5 : 0;
    const currentValue = position
      ? (halfPosition ? posValue + (capital * 0.5 / position.entryPrice) * (lookup[position.symbol][date]?.close || position.entryPrice) : (capital / position.entryPrice * (lookup[position.symbol][date]?.close || position.entryPrice)))
      : capital;
    if (currentValue > maxCapital) maxCapital = currentValue;
    const dd = (maxCapital - currentValue) / maxCapital;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Close open position at last price
  if (position) {
    const lastDate = tradingDays[tradingDays.length - 1];
    const lastPrice = lookup[position.symbol][lastDate]?.close || position.entryPrice;
    const pnlPct = (lastPrice - position.entryPrice) / position.entryPrice;
    const investAmt = halfPosition ? capital * 0.5 : capital;
    const shares = investAmt / position.entryPrice;
    capital = (halfPosition ? capital * 0.5 : 0) + shares * lastPrice;
    const pnl = shares * lastPrice - investAmt;
    if (pnl > 0) totalProfit += pnl; else totalLoss += Math.abs(pnl);
    trades.push({ result: 'OPEN', pnl, pnlPct: pnlPct * 100 });
  }

  const wins = trades.filter(t => t.result === 'TP' || t.result === 'TRAIL').length;
  const losses = trades.filter(t => t.result === 'SL').length;

  return {
    finalCapital: Math.round(capital),
    returnPct: ((capital / INITIAL_CAPITAL - 1) * 100).toFixed(2),
    trades: trades.length,
    wins, losses,
    winRate: (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0',
    totalProfit: Math.round(totalProfit),
    totalLoss: Math.round(totalLoss),
    maxDrawdown: (maxDrawdown * 100).toFixed(2),
    tradeDetails: trades
  };
}

async function main() {
  console.log('Fetching data...\n');
  const rawData = await fetchAllData();
  
  const allIndicators = {};
  for (const sym of MAG7) {
    allIndicators[sym] = computeIndicators(rawData[sym]);
  }

  const dateSet = new Set();
  for (const sym of MAG7) {
    for (const d of allIndicators[sym]) {
      if (d && d.date >= START_DATE) dateSet.add(d.date);
    }
  }
  const tradingDays = [...dateSet].sort();

  const lookup = {};
  const startPrices = {};
  for (const sym of MAG7) {
    lookup[sym] = {};
    for (const d of allIndicators[sym]) {
      if (d) lookup[sym][d.date] = d;
    }
    startPrices[sym] = lookup[sym][tradingDays[0]]?.close;
  }

  const base = { lookup, tradingDays, startPrices };

  // ===== BASELINE (V2) =====
  const baseline = runBacktest({ ...base });
  
  // ===== STRATEGIES =====
  const strategies = [
    { name: 'A. 停利20% 停損10%', tpPct: 0.20, slPct: -0.10 },
    { name: 'B. 停利25% 停損10%', tpPct: 0.25, slPct: -0.10 },
    { name: 'C. 停利30% 停損10%', tpPct: 0.30, slPct: -0.10 },
    { name: 'D. 追蹤止盈8% (無固定TP)', trailingStop: true, trailPct: 0.08, slPct: -0.10 },
    { name: 'E. 追蹤止盈5% (無固定TP)', trailingStop: true, trailPct: 0.05, slPct: -0.10 },
    { name: 'F. 追蹤止盈10% (無固定TP)', trailingStop: true, trailPct: 0.10, slPct: -0.10 },
    { name: 'G. 停利20% + 排除TSLA', tpPct: 0.20, slPct: -0.10, excludeSymbols: ['TSLA'] },
    { name: 'H. 追蹤8% + 排除TSLA', trailingStop: true, trailPct: 0.08, slPct: -0.10, excludeSymbols: ['TSLA'] },
    { name: 'I. 停損8% 停利20%', tpPct: 0.20, slPct: -0.08 },
    { name: 'J. 停損8% 追蹤止盈8%', trailingStop: true, trailPct: 0.08, slPct: -0.08 },
    { name: 'K. 入場-2σ 停利20%', tpPct: 0.20, slPct: -0.10, entryStart: -2.0 },
    { name: 'L. 入場-2σ 追蹤8%', trailingStop: true, trailPct: 0.08, slPct: -0.10, entryStart: -2.0 },
    { name: 'M. 入場-2σ 追蹤8% 排除TSLA', trailingStop: true, trailPct: 0.08, slPct: -0.10, entryStart: -2.0, excludeSymbols: ['TSLA'] },
    { name: 'N. 停利25% + 排除TSLA', tpPct: 0.25, slPct: -0.10, excludeSymbols: ['TSLA'] },
    { name: 'O. 追蹤6% + 排除TSLA', trailingStop: true, trailPct: 0.06, slPct: -0.10, excludeSymbols: ['TSLA'] },
  ];

  console.log('=== BASELINE (V2: TP10% SL10%) ===');
  console.log(`  資金: ${baseline.finalCapital.toLocaleString()} | 報酬: ${baseline.returnPct}% | 勝率: ${baseline.winRate}% | 交易: ${baseline.trades}`);
  console.log(`  總獲利: +${baseline.totalProfit.toLocaleString()} | 總虧損: -${baseline.totalLoss.toLocaleString()} | 回撤: ${baseline.maxDrawdown}%`);
  console.log('');

  console.log('=== STRATEGY COMPARISON ===');
  console.log('目標: 獲利 ×2 (≥' + (baseline.totalProfit * 2).toLocaleString() + '), 虧損 ≤' + baseline.totalLoss.toLocaleString() + '\n');
  
  const results = [];
  for (const s of strategies) {
    const r = runBacktest({ ...base, ...s });
    const profitRatio = (r.totalProfit / baseline.totalProfit).toFixed(2);
    const lossRatio = (r.totalLoss / baseline.totalLoss).toFixed(2);
    const meets = r.totalProfit >= baseline.totalProfit * 1.8 && r.totalLoss <= baseline.totalLoss * 1.05;
    results.push({ ...r, name: s.name, profitRatio, lossRatio, meets });
    
    const flag = meets ? '✅' : (r.totalProfit >= baseline.totalProfit * 1.5 && r.totalLoss <= baseline.totalLoss * 1.1 ? '🟡' : '  ');
    console.log(`${flag} ${s.name}`);
    console.log(`   資金: ${r.finalCapital.toLocaleString()} | 報酬: ${r.returnPct}% | 勝率: ${r.winRate}% | 交易: ${r.trades}`);
    console.log(`   獲利: +${r.totalProfit.toLocaleString()} (×${profitRatio}) | 虧損: -${r.totalLoss.toLocaleString()} (×${lossRatio}) | 回撤: ${r.maxDrawdown}%`);
    console.log('');
  }

  console.log('\n=== TOP RECOMMENDATIONS ===\n');
  const ranked = results
    .filter(r => r.totalLoss <= baseline.totalLoss * 1.1)
    .sort((a, b) => b.totalProfit - a.totalProfit);
  
  for (let i = 0; i < Math.min(5, ranked.length); i++) {
    const r = ranked[i];
    console.log(`#${i+1} ${r.name}`);
    console.log(`   報酬: ${r.returnPct}% | 獲利×${r.profitRatio} | 虧損×${r.lossRatio} | 回撤: ${r.maxDrawdown}%`);
  }
}

main().catch(console.error);
