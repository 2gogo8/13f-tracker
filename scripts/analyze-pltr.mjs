// Analyze PLTR vs MSTR vs APP: σ behavior, ATR patterns, mean reversion quality

const API_KEY = '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const SYMBOLS = ['PLTR', 'MSTR', 'APP'];

async function fetchHistory(symbol) {
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&from=2023-01-01&to=2026-02-18&apikey=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function analyze(prices, symbol) {
  const indicators = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < 20) continue;
    let sum = 0;
    for (let j = i - 19; j <= i; j++) sum += prices[j].close;
    const sma20 = sum / 20;
    if (i < 14) continue;
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
    const atrPct = (atr14 / prices[i].close) * 100; // ATR as % of price
    indicators.push({ date: prices[i].date, close: prices[i].close, sma20, atr14, sigma, atrPct });
  }

  // Stats
  const sigmas = indicators.map(d => d.sigma);
  const atrPcts = indicators.map(d => d.atrPct);
  const avgSigma = sigmas.reduce((a, b) => a + b, 0) / sigmas.length;
  const avgAtrPct = atrPcts.reduce((a, b) => a + b, 0) / atrPcts.length;
  
  // Count sigma events
  const below15 = sigmas.filter(s => s <= -1.5).length;
  const below2 = sigmas.filter(s => s <= -2).length;
  const below3 = sigmas.filter(s => s <= -3).length;
  const above2 = sigmas.filter(s => s >= 2).length;
  const above3 = sigmas.filter(s => s >= 3).length;

  // Mean reversion quality: after hitting -1.5σ, how often does it recover to 0σ within 20 days?
  let reversionAttempts = 0, reversionSuccess = 0;
  let reversionDays = [];
  for (let i = 0; i < indicators.length; i++) {
    if (indicators[i].sigma <= -1.5) {
      // Check if was above -1.5 the day before (fresh signal)
      if (i > 0 && indicators[i-1].sigma > -1.5) {
        reversionAttempts++;
        for (let j = i + 1; j < Math.min(i + 40, indicators.length); j++) {
          if (indicators[j].sigma >= 0) {
            reversionSuccess++;
            reversionDays.push(j - i);
            break;
          }
        }
      }
    }
  }

  // Backtest: -1.5σ entry, trailing stop 8%, SL 10%
  let capital = 1000000;
  let pos = null, trailHigh = 0;
  let wins = 0, losses = 0, trades = [];
  
  for (const d of indicators) {
    if (pos) {
      if (d.close > trailHigh) trailHigh = d.close;
      const pnl = (d.close - pos.entry) / pos.entry;
      const trailDrop = (d.close - trailHigh) / trailHigh;
      
      if (pnl <= -0.10) {
        capital *= (1 + pnl);
        losses++;
        trades.push({ result: 'SL', pnl: (pnl*100).toFixed(1)+'%', entry: pos.date, exit: d.date, entryPrice: pos.entry, exitPrice: d.close });
        pos = null; trailHigh = 0;
      } else if (trailHigh > pos.entry && trailDrop <= -0.08) {
        capital *= (1 + pnl);
        if (pnl > 0) wins++; else losses++;
        trades.push({ result: pnl > 0 ? 'TRAIL' : 'SL', pnl: (pnl*100).toFixed(1)+'%', entry: pos.date, exit: d.date, entryPrice: pos.entry, exitPrice: d.close });
        pos = null; trailHigh = 0;
      }
    }
    if (!pos && d.sigma <= -1.5) {
      // Fresh entry (simple: always enter at -1.5σ)
      pos = { entry: d.close, date: d.date, sigma: d.sigma };
      trailHigh = d.close;
    }
  }
  if (pos) {
    const last = indicators[indicators.length - 1];
    const pnl = (last.close - pos.entry) / pos.entry;
    capital *= (1 + pnl);
    trades.push({ result: 'OPEN', pnl: (pnl*100).toFixed(1)+'%', entry: pos.date, exit: last.date, entryPrice: pos.entry, exitPrice: last.close });
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${symbol} 分析`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  現價: $${indicators[indicators.length-1].close.toFixed(2)}`);
  console.log(`  平均 ATR%: ${avgAtrPct.toFixed(2)}% (每日波動佔股價比)`);
  console.log(`  平均 σ: ${avgSigma.toFixed(2)}`);
  console.log(``);
  console.log(`  σ 分布 (${indicators.length} 個交易日):`);
  console.log(`    ≤ -1.5σ: ${below15} 次 (${(below15/indicators.length*100).toFixed(1)}%)`);
  console.log(`    ≤ -2.0σ: ${below2} 次 (${(below2/indicators.length*100).toFixed(1)}%)`);
  console.log(`    ≤ -3.0σ: ${below3} 次 (${(below3/indicators.length*100).toFixed(1)}%)`);
  console.log(`    ≥ +2.0σ: ${above2} 次 (${(above2/indicators.length*100).toFixed(1)}%)`);
  console.log(`    ≥ +3.0σ: ${above3} 次 (${(above3/indicators.length*100).toFixed(1)}%)`);
  console.log(``)
  console.log(`  均值回歸品質:`);
  console.log(`    -1.5σ 觸發次數: ${reversionAttempts}`);
  console.log(`    40天內回到 0σ: ${reversionSuccess} (${reversionAttempts > 0 ? (reversionSuccess/reversionAttempts*100).toFixed(0) : 0}%)`);
  console.log(`    平均回歸天數: ${reversionDays.length > 0 ? (reversionDays.reduce((a,b)=>a+b,0)/reversionDays.length).toFixed(1) : 'N/A'}`);
  console.log(``)
  console.log(`  回測 (入場-1.5σ, 停損10%, 追蹤止盈8%):`);
  console.log(`    100萬 → ${Math.round(capital).toLocaleString()} (${((capital/1000000-1)*100).toFixed(1)}%)`);
  console.log(`    交易: ${trades.length} 筆 | 獲利: ${wins} | 停損: ${losses}`);
  for (const t of trades) {
    console.log(`      ${t.result.padEnd(5)} ${t.entry} $${t.entryPrice.toFixed(2)} → ${t.exit} $${t.exitPrice.toFixed(2)} (${t.pnl})`);
  }
  
  // Sigma pattern: show last 3 dips below -1.5σ
  console.log(`\n  最近3次 σ < -1.5 事件:`);
  let dips = [];
  for (let i = indicators.length - 1; i >= 0 && dips.length < 3; i--) {
    if (indicators[i].sigma <= -1.5 && (i === indicators.length - 1 || indicators[i+1].sigma > -1.5)) {
      // Find the trough
      let minSigma = indicators[i].sigma, minDate = indicators[i].date, minPrice = indicators[i].close;
      for (let j = i; j >= 0 && indicators[j].sigma <= -1.0; j--) {
        if (indicators[j].sigma < minSigma) {
          minSigma = indicators[j].sigma; minDate = indicators[j].date; minPrice = indicators[j].close;
        }
      }
      // Find recovery
      let recoveryDate = 'N/A', recoveryPrice = 0, recoveryDays = 0;
      for (let j = i + 1; j < indicators.length; j++) {
        if (indicators[j].sigma >= 0) {
          recoveryDate = indicators[j].date;
          recoveryPrice = indicators[j].close;
          recoveryDays = j - i;
          break;
        }
      }
      dips.push({ date: minDate, price: minPrice, sigma: minSigma.toFixed(2), recoveryDate, recoveryPrice, recoveryDays });
    }
  }
  for (const d of dips.reverse()) {
    const recov = d.recoveryDate !== 'N/A' ? `→ ${d.recoveryDate} $${d.recoveryPrice.toFixed(2)} (${d.recoveryDays}天)` : '→ 尚未回歸';
    console.log(`    ${d.date} $${d.price.toFixed(2)} σ=${d.sigma} ${recov}`);
  }
}

async function main() {
  for (const sym of SYMBOLS) {
    const raw = await fetchHistory(sym);
    console.log(`${sym}: ${raw.length} days fetched`);
    analyze(raw, sym);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  結論：為什麼 PLTR 走勢更適合 σ 策略`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(console.error);
