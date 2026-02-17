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
  yearHigh: number;
  yearLow: number;
  priceAvg200: number;
  previousClose: number;
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 56, h = 22;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className="flex-shrink-0 opacity-50 group-hover:opacity-80 transition-opacity">
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
  const [showAll, setShowAll] = useState(false);
  const INITIAL_COUNT = 10;

  useEffect(() => {
    async function fetchPicks() {
      try {
        const res = await fetch('/api/top-picks');
        const data = await res.json();
        if (Array.isArray(data)) setPicks(data);
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
        <div>
          <h2 className="font-serif text-lg font-bold text-accent glow-gold">
            負乖離精選
          </h2>
          <p className="text-[10px] text-gray-600 mt-0.5">
            S&P 500 全掃描・現價 &lt; 50MA − 2×ATR・共 {picks.length} 檔亮燈
          </p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-blue-900/30 text-blue-400 font-medium tracking-wider uppercase">
          Oversold
        </span>
      </div>

      <div className="divide-y divide-accent/[0.15]">
        {(showAll ? picks : picks.slice(0, INITIAL_COUNT)).map((stock) => {
          const isUp = stock.changesPercentage >= 0;
          const dotColor = stock.signal === 'deep-value' ? '#4ade80' : '#60a5fa';
          const sparkline = [
            stock.yearLow,
            stock.priceAvg200,
            stock.sma50,
            stock.previousClose,
            stock.price,
          ].filter(Boolean);

          return (
            <Link
              key={stock.symbol}
              href={`/stock/${stock.symbol}`}
              className="flex items-center gap-3 py-3 px-2 rounded transition-all active:bg-primary/10 hover:bg-white/[0.02] group"
            >
              {/* Left: Symbol + Name */}
              <div className="w-16 sm:w-20 flex-shrink-0">
                <p className="font-serif text-sm sm:text-base font-bold text-accent leading-tight">{stock.symbol}</p>
                <p className="text-[9px] text-gray-600 truncate leading-tight mt-0.5">{stock.name}</p>
              </div>

              {/* Sparkline */}
              <div className="hidden sm:block">
                <MiniSparkline data={sparkline} color={isUp ? '#D4AF37' : '#C41E3A'} />
              </div>

              {/* Center: Price + Change */}
              <div className="flex-1 flex items-baseline justify-end gap-2">
                <span className="text-sm sm:text-base font-mono font-bold text-white tabular-nums tracking-tight">
                  ${stock.price.toFixed(2)}
                </span>
                <span className={`text-xs font-mono font-semibold tabular-nums ${
                  isUp ? 'text-accent' : 'text-primary'
                }`}>
                  {isUp ? '+' : ''}{stock.changesPercentage.toFixed(1)}%
                </span>
              </div>

              {/* Right: Signal dot + deviation */}
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                <span className="relative flex h-2 w-2">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}60` }}
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

      {!showAll && picks.length > INITIAL_COUNT && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full mt-4 py-2.5 rounded-lg border border-accent/20 text-accent text-sm font-medium hover:bg-accent/5 active:bg-accent/10 transition-colors"
        >
          查看更多（共 {picks.length} 檔）
        </button>
      )}
      {showAll && picks.length > INITIAL_COUNT && (
        <button
          onClick={() => setShowAll(false)}
          className="w-full mt-4 py-2.5 rounded-lg border border-accent/20 text-gray-500 text-sm font-medium hover:bg-white/[0.02] active:bg-white/5 transition-colors"
        >
          收合
        </button>
      )}

      <p className="text-[9px] text-gray-700 mt-3 text-center">
        僅供參考，非投資建議
      </p>
    </div>
  );
}
