'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Rule40Stock {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  revCY2026: number;
  revCY2027: number;
  yoyGrowth: number;
  numAnalysts: number;
}

function formatMktCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

export default function GrowthPicks() {
  const [picks, setPicks] = useState<Rule40Stock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRule40() {
      try {
        const res = await fetch('/api/rule40');
        const data = await res.json();
        if (Array.isArray(data)) setPicks(data);
      } catch {}
      setLoading(false);
    }
    fetchRule40();
  }, []);

  if (loading) return null;
  if (picks.length === 0) return null;

  return (
    <div className="apple-card p-5 md:p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-serif text-lg font-bold text-accent glow-gold">
            Rule 40 精選
          </h2>
          <p className="text-[10px] text-gray-600 mt-0.5">
            明年（2027）預估營收 YoY ≥ 40%・分析師共識
          </p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-green-900/30 text-green-400 font-medium tracking-wider uppercase">
          Rule 40
        </span>
      </div>

      <div className="divide-y divide-accent/[0.15]">
        {picks.map((stock) => (
          <Link
            key={stock.symbol}
            href={`/stock/${stock.symbol}`}
            className="block py-3 px-2 rounded transition-all active:bg-primary/10 hover:bg-white/[0.02] group"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-serif text-sm font-bold text-accent">{stock.symbol}</span>
                <span className="text-[10px] text-gray-500 truncate max-w-[140px]">{stock.name}</span>
              </div>
              <span className="text-sm font-mono font-bold text-green-400">
                +{stock.yoyGrowth.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>
                2026 ${stock.revCY2026}B → 2027 ${stock.revCY2027}B
              </span>
              <span>
                {formatMktCap(stock.marketCap)}・{stock.numAnalysts} 位分析師
              </span>
            </div>
          </Link>
        ))}
      </div>

      <p className="text-[9px] text-gray-700 mt-3 text-center">
        基於分析師共識預估，僅供參考，非投資建議
      </p>
    </div>
  );
}
