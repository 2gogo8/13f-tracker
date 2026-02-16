'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface PickStock {
  symbol: string;
  price: number;
  sma20: number;
  atr14: number;
  deviation: number;
  signal: string;
  name?: string;
  marketCap?: number;
  changesPercentage?: number;
}

export default function TopPicks() {
  const [picks, setPicks] = useState<PickStock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPicks() {
      try {
        // Fetch oversold stocks
        const res = await fetch('/api/oversold-scanner');
        const oversold = await res.json();
        if (!Array.isArray(oversold) || oversold.length === 0) {
          setLoading(false);
          return;
        }

        // Fetch quotes for these stocks to get market cap
        const symbols = oversold.map((s: PickStock) => s.symbol);
        const quotePromises = symbols.map((sym: string) =>
          fetch(`/api/quote/${sym}`).then(r => r.json()).catch(() => [])
        );
        const quotes = await Promise.all(quotePromises);

        const enriched: PickStock[] = [];
        oversold.forEach((stock: PickStock, i: number) => {
          const q = quotes[i]?.[0];
          if (q && q.marketCap >= 10_000_000_000) { // > $10B (100億)
            enriched.push({
              ...stock,
              name: q.name,
              marketCap: q.marketCap,
              changesPercentage: q.changesPercentage ?? 0,
            });
          }
        });

        // Sort by most oversold
        enriched.sort((a, b) => a.deviation - b.deviation);
        setPicks(enriched.slice(0, 5));
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
    <div className="apple-card p-6 md:p-8 mb-16 border-accent/20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif text-xl font-bold text-accent glow-gold">
            負乖離精選
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            超跌訊號 + 市值 &gt; $10B — 按乖離程度排序
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
            {/* Rank */}
            <div className="absolute top-2 right-3 text-xs text-gray-600 font-mono">
              #{i + 1}
            </div>

            {/* Symbol */}
            <p className="text-lg font-bold text-primary glow-red mb-0.5">{stock.symbol}</p>
            <p className="text-[11px] text-gray-500 truncate mb-3">{stock.name}</p>

            {/* Price */}
            <p className="text-xl font-bold text-white glow-white mb-1">
              ${stock.price.toFixed(2)}
            </p>

            {/* Signal badge */}
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

            {/* SMA20 vs Price */}
            <div className="mt-2 text-[10px] text-gray-600">
              SMA20 ${stock.sma20.toFixed(2)}
            </div>
          </Link>
        ))}
      </div>

      <p className="text-[10px] text-gray-600 mt-4 text-center">
        篩選條件：現價 &lt; SMA(20) − 2×ATR(14)，市值 &gt; $10B。僅供參考，非投資建議。
      </p>
    </div>
  );
}
