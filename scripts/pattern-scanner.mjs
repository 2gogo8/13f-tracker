// Pattern Scanner: Find stocks with PLTR-like chart DNA
// "Staircase up + V-shaped pullback + stable volatility"
//
// PLTR DNA (benchmark):
// 1. Trend consistency: 7/9 quarters positive
// 2. Pullback recovery: avg < 20 days
// 3. Volatility stability: vol ratio < 5x
// 4. Mean reversion: > 80% success in 40 days
// 5. Uptrend slope: strong (>100% in 2 years)

const API_KEY = '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';

// Use the expanded stock list from the app
const CANDIDATES = [
  // Mag 7
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA',
  // High growth / Rule40
  'PLTR','APP','MSTR','CRWD','ANET','SNOW','DDOG','NET','PANW','ZS',
  'UBER','COIN','SHOP','SQ','ABNB','DASH','RBLX','CRM','NOW','ADBE',
  'NFLX','AMD','QCOM','MU','LRCX','KLAC','CDNS','SNPS','FTNT',
  'WDAY','HUBS','VEEV','TTD','DKNG','MELI','SE','SPOT','PINS',
  'ARM','SMCI','AVGO','MRVL','MNDY',
  // Others with potential
  'AXON','FICO','GE','LLY','UNH','V','MA','COST','WMT','TJX',
  'CMG','CAVA','ELF','DECK','ON','MPWR','AEHR','CELH','DUOL',
  'TOST','HOOD','IOT','CFLT','GRAB','ROKU','PATH',
  'VST','CEG','OKLO','SMR','NNE',
];

async function fetchHistory(symbol) {
  try {
    const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&from=2024-01-01&to=2026-02-18&apikey=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 100) return null;
    return data.sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch { return null; }
}

function scorePLTRlikeness(prices, symbol) {
  if (!prices || prices.length < 200) return null;

  // === 1. TREND CONSISTENCY (max 25 pts) ===
  // How many 63-day (quarterly) periods are positive?
  let posQuarters = 0, totalQuarters = 0;
  for (let i = 0; i + 63 <= prices.length; i += 63) {
    const ret = prices[i + 62].close / prices[i].close - 1;
    if (ret > 0) posQuarters++;
    totalQuarters++;
  }
  const trendScore = totalQuarters > 0 ? (posQuarters / totalQuarters) * 25 : 0;

  // === 2. PULLBACK RECOVERY SPEED (max 25 pts) ===
  // Find pullbacks > 15%, measure recovery days
  let localHigh = prices[0].close;
  let pullbacks = [];
  let inPullback = false, pbLow = Infinity, pbLowIdx = 0, pbHighIdx = 0;
  
  for (let i = 1; i < prices.length; i++) {
    if (prices[i].close > localHigh) {
      if (inPullback && pbLow < localHigh) {
        const recoveryDays = i - pbLowIdx;
        const dropDays = pbLowIdx - pbHighIdx;
        const dropPct = (pbLow - localHigh) / localHigh;
        // V-shape ratio: recovery faster than drop = good
        const vRatio = dropDays > 0 ? recoveryDays / dropDays : 5;
        pullbacks.push({ dropPct, recoveryDays, dropDays, vRatio });
      }
      localHigh = prices[i].close;
      pbHighIdx = i;
      inPullback = false;
      pbLow = Infinity;
    }
    const dd = (prices[i].close - localHigh) / localHigh;
    if (dd <= -0.15) {
      inPullback = true;
      if (prices[i].close < pbLow) {
        pbLow = prices[i].close;
        pbLowIdx = i;
      }
    }
  }
  
  let recoveryScore = 25; // default: no big pullbacks = good
  if (pullbacks.length > 0) {
    const avgVRatio = pullbacks.reduce((s, p) => s + p.vRatio, 0) / pullbacks.length;
    const avgRecovDays = pullbacks.reduce((s, p) => s + p.recoveryDays, 0) / pullbacks.length;
    // V-ratio < 1 = V-shape (fast recovery), > 2 = slow grind
    // Recovery < 20 days = fast, > 60 = slow
    recoveryScore = Math.max(0, 25 - avgVRatio * 5 - Math.max(0, avgRecovDays - 15) * 0.3);
  }

  // === 3. VOLATILITY STABILITY (max 20 pts) ===
  const dailyRets = [];
  for (let i = 1; i < prices.length; i++) {
    dailyRets.push((prices[i].close - prices[i-1].close) / prices[i-1].close);
  }
  const rollingVols = [];
  for (let i = 19; i < dailyRets.length; i++) {
    const w = dailyRets.slice(i - 19, i + 1);
    const mean = w.reduce((a, b) => a + b, 0) / 20;
    const variance = w.reduce((a, b) => a + (b - mean) ** 2, 0) / 20;
    rollingVols.push(Math.sqrt(variance));
  }
  const maxVol = Math.max(...rollingVols);
  const minVol = Math.min(...rollingVols);
  const volRatio = minVol > 0 ? maxVol / minVol : 10;
  // PLTR = 4.3x. < 4 = great, > 8 = terrible
  const volScore = Math.max(0, 20 - Math.max(0, volRatio - 3) * 3);

  // === 4. MEAN REVERSION QUALITY (max 20 pts) ===
  // Compute SMA20 + ATR14, check reversion rate
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
    indicators.push({ sigma, idx: i });
  }
  
  let revAttempts = 0, revSuccess = 0, revDays = [];
  for (let i = 1; i < indicators.length; i++) {
    if (indicators[i].sigma <= -1.5 && indicators[i-1].sigma > -1.5) {
      revAttempts++;
      for (let j = i + 1; j < Math.min(i + 40, indicators.length); j++) {
        if (indicators[j].sigma >= 0) {
          revSuccess++;
          revDays.push(j - i);
          break;
        }
      }
    }
  }
  const revRate = revAttempts > 0 ? revSuccess / revAttempts : 0.5;
  const avgRevDays = revDays.length > 0 ? revDays.reduce((a,b) => a+b,0) / revDays.length : 20;
  // PLTR = 86%, 9.2 days
  const revScore = revRate * 15 + Math.max(0, 5 - avgRevDays * 0.2);

  // === 5. OVERALL UPTREND (max 10 pts) ===
  const totalReturn = prices[prices.length-1].close / prices[0].close - 1;
  const uptrendScore = Math.min(10, totalReturn * 10); // 100% = 10 pts

  const totalScore = trendScore + recoveryScore + volScore + revScore + uptrendScore;

  return {
    symbol,
    score: Math.round(totalScore * 10) / 10,
    trendScore: Math.round(trendScore * 10) / 10,
    recoveryScore: Math.round(recoveryScore * 10) / 10,
    volScore: Math.round(volScore * 10) / 10,
    revScore: Math.round(revScore * 10) / 10,
    uptrendScore: Math.round(uptrendScore * 10) / 10,
    posQuarters: `${posQuarters}/${totalQuarters}`,
    volRatio: volRatio.toFixed(1),
    revRate: revAttempts > 0 ? `${(revRate*100).toFixed(0)}% (${revAttempts}次)` : 'N/A',
    avgRevDays: avgRevDays.toFixed(0),
    totalReturn: `${(totalReturn*100).toFixed(0)}%`,
    pullbacks: pullbacks.length,
    currentPrice: prices[prices.length-1].close.toFixed(2),
  };
}

async function main() {
  console.log(`Scanning ${CANDIDATES.length} stocks for PLTR-like patterns...\n`);
  
  const results = [];
  const BATCH = 5;
  
  for (let i = 0; i < CANDIDATES.length; i += BATCH) {
    const batch = CANDIDATES.slice(i, i + BATCH);
    const promises = batch.map(async (sym) => {
      const prices = await fetchHistory(sym);
      return scorePLTRlikeness(prices, sym);
    });
    const batchResults = await Promise.all(promises);
    for (const r of batchResults) {
      if (r) results.push(r);
    }
    process.stdout.write(`  ${Math.min(i + BATCH, CANDIDATES.length)}/${CANDIDATES.length}...\r`);
  }

  // Sort by score
  results.sort((a, b) => b.score - a.score);

  // Print PLTR first as benchmark
  const pltr = results.find(r => r.symbol === 'PLTR');
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  PLTR 基準 (你喜歡的型態 DNA)`);
  console.log(`${'='.repeat(70)}`);
  if (pltr) {
    console.log(`  總分: ${pltr.score}/100`);
    console.log(`  趨勢一致: ${pltr.trendScore}/25 (正季度 ${pltr.posQuarters})`);
    console.log(`  回調回復: ${pltr.recoveryScore}/25 (${pltr.pullbacks} 次大回調)`);
    console.log(`  波動穩定: ${pltr.volScore}/20 (波動比 ${pltr.volRatio}x)`);
    console.log(`  均值回歸: ${pltr.revScore}/20 (成功率 ${pltr.revRate}, 平均 ${pltr.avgRevDays} 天)`);
    console.log(`  上漲力道: ${pltr.uptrendScore}/10 (總報酬 ${pltr.totalReturn})`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  與 PLTR 型態最像的 TOP 20`);
  console.log(`${'='.repeat(70)}\n`);
  
  console.log(`${'排名'.padEnd(4)} ${'股票'.padEnd(6)} ${'總分'.padEnd(6)} ${'趨勢'.padEnd(6)} ${'回復'.padEnd(6)} ${'波動'.padEnd(6)} ${'回歸'.padEnd(6)} ${'漲幅'.padEnd(6)} | 回歸率    | 報酬`);
  console.log('-'.repeat(90));
  
  for (let i = 0; i < Math.min(25, results.length); i++) {
    const r = results[i];
    const marker = r.symbol === 'PLTR' ? ' ★' : '';
    console.log(
      `${String(i+1).padEnd(4)} ${(r.symbol + marker).padEnd(8)} ${String(r.score).padEnd(6)} ${String(r.trendScore).padEnd(6)} ${String(r.recoveryScore).padEnd(6)} ${String(r.volScore).padEnd(6)} ${String(r.revScore).padEnd(6)} ${String(r.uptrendScore).padEnd(6)} | ${r.revRate.padEnd(9)} | ${r.totalReturn}`
    );
  }

  // Also show where MSTR and APP rank
  const mstrRank = results.findIndex(r => r.symbol === 'MSTR') + 1;
  const appRank = results.findIndex(r => r.symbol === 'APP') + 1;
  console.log(`\n  MSTR 排名: #${mstrRank} (分數 ${results.find(r=>r.symbol==='MSTR')?.score || 'N/A'})`);
  console.log(`  APP 排名: #${appRank} (分數 ${results.find(r=>r.symbol==='APP')?.score || 'N/A'})`);
  
  // Bottom 5
  console.log(`\n  最不像 PLTR 的 5 檔（避開這種型態）:`);
  for (let i = results.length - 5; i < results.length; i++) {
    const r = results[i];
    console.log(`    ${r.symbol}: ${r.score} 分 (回歸率 ${r.revRate}, 報酬 ${r.totalReturn})`);
  }
}

main().catch(console.error);
