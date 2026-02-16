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
  changesPercentage: number;
  sparkline: number[]; // mini price history from dayLow/price/etc
}

const SYMBOLS = ['AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','NFLX','CRM','PYPL'];

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 60, h = 24;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className="flex-shrink-0 opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TopPicks() {
  const [picks, setPicks] = useState<PickStock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPicks() {
      try {
        const results = await Promise.allSettled(
          SYMBOLS.map(sym =>
            fetch(`/api/quote/${sym}`).then(r => r.json()).then(d => d[0] || null)
          )
        );

        const oversold: PickStock[] = [];
        for (const r of results) {
          if (r.status !== 'fulfilled' || !r.value) continue;
          const q = r.value;
          if (!q.priceAvg50 || !q.price) continue;

          const range52w = (q.yearHigh ?? 0) - (q.yearLow ?? 0);
          const estimatedATR = range52w / 30;
          if (estimatedATR <= 0) continue;

          const deviation = (q.price - q.priceAvg50) / estimatedATR;
          if (deviation >= -2) continue;

          // Build fake sparkline from available data points
          const sparkline = [
            q.yearLow ?? q.price,
            q.priceAvg200 ?? q.price,
            q.priceAvg50 ?? q.price,
            q.previousClose ?? q.price,
            q.price,
          ].filter(Boolean);

          oversold.push({
            symbol: q.symbol,
            price: q.price,
            sma50: q.priceAvg50,
            deviation,
            signal: deviation < -3 ? 'deep-value' : 'oversold',
            name: q.name || q.symbol,
            marketCap: q.marketCap || 0,
            changesPercentage: q.changesPercentage ?? 0,
            sparkline,
          });
        }

        oversold.sort((a, b) => a.deviation - b.deviation);
        setPicks(oversold.slice(0, 10));
      } catch {}
      setLoading(false);
    }
    fetchPicks();
  }, []);

  if (loading) return null;
  if (picks.length === 0) return null;

  return (
    <div className="apple-card p-5 md:p-6 mb-16">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-lg font-bold text-accent glow-gold">
          負乖離精選
        </h2>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-blue-900/30 text-blue-400 font-medium tracking-wider uppercase">
          Oversold
        </span>
      </div>

      <div className="divide-y divide-accent/[0.15]">
        {picks.map((stock) => {
          const isUp = stock.changesPercentage >= 0;
          const dotColor = stock.signal === 'deep-value' ? '#4ade80' : '#60a5fa';

          return (
            <Link
              key={stock.symbol}
              href={`/stock/${stock.symbol}`}
              className="flex items-center gap-3 py-3 px-2 rounded-lg transition-all active:bg-primary/10 hover:bg-white/[0.02] group"
            >
              {/* Left: Symbol + Name */}
              <div className="w-20 flex-shrink-0">
                <p className="font-serif text-base font-bold text-accent leading-tight">{stock.symbol}</p>
                <p className="text-[10px] text-gray-600 truncate leading-tight mt-0.5">{stock.name}</p>
              </div>

              {/* Sparkline */}
              <MiniSparkline data={stock.sparkline} color={isUp ? '#D4AF37' : '#C41E3A'} />

              {/* Center: Price + Change */}
              <div className="flex-1 flex items-baseline justify-end gap-2">
                <span className="text-base font-mono font-bold text-white tabular-nums tracking-tight">
                  ${stock.price.toFixed(2)}
                </span>
                <span className={`text-xs font-mono font-semibold tabular-nums ${
                  isUp ? 'text-accent' : 'text-primary'
                }`}>
                  {isUp ? '+' : ''}{stock.changesPercentage.toFixed(1)}%
                </span>
              </div>

              {/* Right: Signal */}
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                {/* Pulsing dot */}
                <span className="relative flex h-2.5 w-2.5">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2.5 w-2.5"
                    style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}80` }}
                  />
                </span>
                <span className="text-[10px] text-gray-500 font-mono w-10 text-right">
                  {stock.deviation.toFixed(1)}σ
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-700 mt-3 text-center">
        現價 &lt; 50MA − 2×ATR 估計值。僅供參考，非投資建議。
      </p>
    </div>
  );
}
