// Analyze price pattern characteristics: PLTR vs MSTR vs APP
// Focus on: trend structure, pullback shape, recovery pattern

const API_KEY = '3c03eZvjdPpKONYydbgoAT9chCaQDnsp';
const SYMBOLS = ['PLTR', 'MSTR', 'APP'];

async function fetchHistory(symbol) {
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&from=2024-01-01&to=2026-02-18&apikey=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function analyzePattern(prices, symbol) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${symbol} 股價型態分析 (2024~2026)`);
  console.log(`${'='.repeat(60)}`);
  
  // 1. Overall trend: calculate 3-month rolling returns
  console.log(`\n  【趨勢結構】`);
  const quarters = [];
  for (let i = 0; i < prices.length; i += 63) {
    const end = Math.min(i + 62, prices.length - 1);
    const ret = ((prices[end].close / prices[i].close) - 1) * 100;
    quarters.push({ from: prices[i].date, to: prices[end].date, ret });
  }
  for (const q of quarters) {
    const bar = q.ret > 0 ? '█'.repeat(Math.min(Math.round(q.ret / 5), 20)) : '░'.repeat(Math.min(Math.round(Math.abs(q.ret) / 5), 20));
    console.log(`    ${q.from.slice(0,7)} → ${q.to.slice(0,7)}: ${q.ret > 0 ? '+' : ''}${q.ret.toFixed(1)}% ${q.ret > 0 ? '🟢' : '🔴'} ${bar}`);
  }

  // 2. Pullback analysis: find all drops > 15% from local high
  console.log(`\n  【回調型態】`);
  let localHigh = prices[0].close, localHighDate = prices[0].date;
  let pullbacks = [];
  let inPullback = false, pullbackStart = null;
  
  for (let i = 1; i < prices.length; i++) {
    if (prices[i].close > localHigh) {
      if (inPullback) {
        // Pullback ended - record recovery
        const lowPoint = pullbackStart;
        const dropPct = ((lowPoint.price - localHigh) / localHigh) * 100;
        const recoveryDays = i - lowPoint.idx;
        const drawdownDays = lowPoint.idx - lowPoint.highIdx;
        pullbacks.push({
          highDate: localHighDate, highPrice: localHigh,
          lowDate: lowPoint.date, lowPrice: lowPoint.price,
          dropPct, drawdownDays, recoveryDays,
          totalDays: drawdownDays + recoveryDays,
          shape: recoveryDays < drawdownDays * 0.5 ? 'V型反轉' : 
                 recoveryDays < drawdownDays * 1.2 ? 'U型回升' : '漫長爬升'
        });
        inPullback = false;
      }
      localHigh = prices[i].close;
      localHighDate = prices[i].date;
    }
    
    const drawdown = ((prices[i].close - localHigh) / localHigh) * 100;
    if (drawdown <= -15 && !inPullback) {
      inPullback = true;
      pullbackStart = { date: prices[i].date, price: prices[i].close, idx: i, highIdx: i };
      // Find actual low
      for (let j = i; j < prices.length && prices[j].close < localHigh; j++) {
        if (prices[j].close < pullbackStart.price) {
          pullbackStart = { date: prices[j].date, price: prices[j].close, idx: j, highIdx: i };
        }
      }
    }
  }
  
  // Check if still in pullback
  if (inPullback && pullbackStart) {
    const dropPct = ((pullbackStart.price - localHigh) / localHigh) * 100;
    pullbacks.push({
      highDate: localHighDate, highPrice: localHigh,
      lowDate: pullbackStart.date, lowPrice: pullbackStart.price,
      dropPct, drawdownDays: pullbackStart.idx - (prices.findIndex(p => p.date === localHighDate)),
      recoveryDays: '進行中', totalDays: '進行中', shape: '尚未回復'
    });
  }

  if (pullbacks.length === 0) {
    console.log(`    無 >15% 回調`);
  }
  for (const p of pullbacks) {
    console.log(`    高點: ${p.highDate} $${p.highPrice.toFixed(2)}`);
    console.log(`    低點: ${p.lowDate} $${p.lowPrice.toFixed(2)} (跌 ${p.dropPct.toFixed(1)}%)`);
    console.log(`    下跌天數: ${p.drawdownDays} | 回復天數: ${p.recoveryDays} | 型態: ${p.shape}`);
    console.log(``);
  }

  // 3. Volatility clustering: periods of high vs low volatility
  console.log(`  【波動特性】`);
  const dailyReturns = [];
  for (let i = 1; i < prices.length; i++) {
    dailyReturns.push({
      date: prices[i].date,
      ret: ((prices[i].close - prices[i-1].close) / prices[i-1].close) * 100,
      range: ((prices[i].high - prices[i].low) / prices[i].close) * 100
    });
  }
  
  // 20-day rolling volatility
  const rollingVol = [];
  for (let i = 19; i < dailyReturns.length; i++) {
    const window = dailyReturns.slice(i - 19, i + 1);
    const mean = window.reduce((s, d) => s + d.ret, 0) / 20;
    const variance = window.reduce((s, d) => s + (d.ret - mean) ** 2, 0) / 20;
    rollingVol.push({ date: dailyReturns[i].date, vol: Math.sqrt(variance) });
  }
  
  const avgVol = rollingVol.reduce((s, d) => s + d.vol, 0) / rollingVol.length;
  const maxVol = Math.max(...rollingVol.map(d => d.vol));
  const minVol = Math.min(...rollingVol.map(d => d.vol));
  console.log(`    平均20日波動率: ${avgVol.toFixed(2)}%`);
  console.log(`    最高: ${maxVol.toFixed(2)}% | 最低: ${minVol.toFixed(2)}%`);
  console.log(`    波動率比 (最高/最低): ${(maxVol/minVol).toFixed(1)}x`);
  
  // 4. Trend consistency: how many days moving in same direction as 50-day trend
  console.log(`\n  【趨勢一致性】`);
  let trendDays = 0, totalDays = 0;
  for (let i = 50; i < prices.length; i++) {
    const sma50 = prices.slice(i-49, i+1).reduce((s,p) => s + p.close, 0) / 50;
    const trend = prices[i].close > sma50 ? 1 : -1; // above SMA50 = uptrend
    const dayDir = prices[i].close > prices[i-1].close ? 1 : -1;
    if (trend === dayDir) trendDays++;
    totalDays++;
  }
  console.log(`    順勢交易日比例: ${(trendDays/totalDays*100).toFixed(1)}%`);
  
  // 5. Gap analysis
  console.log(`\n  【跳空缺口】`);
  let gapUp = 0, gapDown = 0, bigGapUp = 0, bigGapDown = 0;
  for (let i = 1; i < prices.length; i++) {
    const gap = ((prices[i].open - prices[i-1].close) / prices[i-1].close) * 100;
    if (gap > 2) { gapUp++; if (gap > 5) bigGapUp++; }
    if (gap < -2) { gapDown++; if (gap < -5) bigGapDown++; }
  }
  console.log(`    >2% 跳空上漲: ${gapUp} 次 (>5%: ${bigGapUp})`);
  console.log(`    >2% 跳空下跌: ${gapDown} 次 (>5%: ${bigGapDown})`);
  
  // 6. Staircase vs spike pattern
  console.log(`\n  【上漲模式】`);
  let consecutive = 0, maxConsecutive = 0, streaks = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i].close > prices[i-1].close) {
      consecutive++;
    } else {
      if (consecutive >= 3) streaks.push(consecutive);
      if (consecutive > maxConsecutive) maxConsecutive = consecutive;
      consecutive = 0;
    }
  }
  const avgStreak = streaks.length > 0 ? (streaks.reduce((a,b) => a+b, 0) / streaks.length).toFixed(1) : 0;
  console.log(`    最長連漲: ${maxConsecutive} 天`);
  console.log(`    3天以上連漲次數: ${streaks.length} 次 (平均 ${avgStreak} 天)`);
  
  // Price from start to end
  const totalReturn = ((prices[prices.length-1].close / prices[0].close) - 1) * 100;
  console.log(`\n  期間總報酬: ${totalReturn > 0 ? '+' : ''}${totalReturn.toFixed(1)}% ($${prices[0].close.toFixed(2)} → $${prices[prices.length-1].close.toFixed(2)})`);
}

async function main() {
  for (const sym of SYMBOLS) {
    const raw = await fetchHistory(sym);
    console.log(`${sym}: ${raw.length} days`);
    analyzePattern(raw, sym);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  三檔型態總結`);
  console.log(`${'='.repeat(60)}`);
  console.log(`
  PLTR: 「階梯型上漲 + V型回調」
  - 漲的時候像爬樓梯，穩步上升
  - 跌的時候快速但有底，V型反轉回來
  - 波動率穩定，不會突然暴走
  → 最適合 σ 負乖離策略：跌下去就買，V型彈回來就賺
  
  MSTR: 「脈衝型爆發 + 階梯型下跌」  
  - 暴漲靠跳空缺口（BTC連動）
  - 下跌是慢慢磨，一級一級往下掉
  - 波動率極不穩定
  → σ 策略容易被磨死：以為到底了結果繼續磨
  
  APP: 「趨勢型飆股 + 斷崖式回調」
  - 上漲趨勢很強很持久
  - 但回調來的時候又急又深（跳空下殺）
  - 停損容易被跳空穿過
  → σ 策略可用但風險高：跳空下殺容易超過停損價
  `);
}

main().catch(console.error);
