'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface PickStock {
  symbol: string;
  price: number;
  sma50: number;
  deviation: number;
  signal: string;
  name: string;
  marketCap: number;
}

// 10 mega-caps to scan
const SYMBOLS = ['AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','NFLX','CRM','PYPL'];

export default function TopPicks() {
  const [picks, setPicks] = useState<PickStock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPicks() {
      try {
        // Fetch quotes for all symbols (each is cached 5min on server)
        const results = await Promise.allSettled(
          SYMBOLS.map(sym =>
            fetch(`/api/quote/${sym}`).then(r => r.json()).then(d => d[0] || null)
          )
        );

        const oversold: PickStock[] = [];
        for (const r of results) {
          if (r.status !== 'fulfilled' || !r.value) continue;
          const q = r.value;
          if (!q.priceAvg50 || !q.priceAvg200 || !q.price) continue;

          // Estimate volatility from 52-week range
          const range52w = (q.yearHigh ?? 0) - (q.yearLow ?? 0);
          const estimatedATR = range52w / 52; // rough weekly vol → daily proxy
          if (estimatedATR <= 0) continue;

          // Use SMA50 as baseline (available from quote)
          const deviation = (q.price - q.priceAvg50) / estimatedATR;

          if (deviation < -2) {
            oversold.push({
              symbol: q.symbol,
              price: q.price,
              sma50: q.priceAvg50,
              deviation,
              signal: deviation < -3 ? 'deep-value' : 'oversold',
              name: q.name || q.symbol,
              marketCap: q.marketCap || 0,
            });
          }
        }

        oversold.sort((a, b) => a.deviation - b.deviation);
        setPicks(oversold.slice(0, 5));
      } catch {
        // silent
      }
      setLoading(false);
    }
    fetchPicks();
  }, []);

  if (loading) return null;
  if (picks.length === 0) return null;

  return (
    <div className="apple-card p-6 md:p-8 mb-16">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif text-xl font-bold text-accent glow-gold">
            負乖離精選
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            超跌訊號 + 大型股 — 按乖離程度排序
          </p>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-blue-900/30 text-blue-400 font-medium">
          OVERSOLD
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {picks.map((stock, i) => (
          <Link
            key={stock.symbol}
            href={`/stock/${stock.symbol}`}
            className="group relative p-4 rounded-xl bg-black/40 border border-white/5 hover:border-accent/30 transition-all"
          >
            <div className="absolute top-2 right-3 text-xs text-gray-600 font-mono">
              #{i + 1}
            </div>

            <p className="text-lg font-bold text-primary glow-red mb-0.5">{stock.symbol}</p>
            <p className="text-[11px] text-gray-500 truncate mb-3">{stock.name}</p>

            <p className="text-xl font-bold text-white glow-white mb-1">
              ${stock.price.toFixed(2)}
            </p>

            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                stock.signal === 'deep-value'
                  ? 'bg-green-900/40 text-green-400'
                  : 'bg-blue-900/40 text-blue-400'
              }`}>
                {stock.signal === 'deep-value' ? '極度超跌' : '超跌'}
              </span>
              <span className="text-xs text-gray-500 font-mono">
                {stock.deviation.toFixed(1)}σ
              </span>
            </div>

            <div className="mt-2 text-[10px] text-gray-600">
              50MA ${stock.sma50.toFixed(2)}
            </div>
          </Link>
        ))}
      </div>

      <p className="text-[10px] text-gray-600 mt-4 text-center">
        篩選條件：現價 &lt; 50MA − 2×估計ATR。僅供參考，非投資建議。
      </p>
    </div>
  );
}
