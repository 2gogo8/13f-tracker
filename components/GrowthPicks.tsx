'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Rule40Stock {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  revenueGrowth: number;
  profitMargin: number;
  rule40Score: number;
  revPrior: number;
  revCurrent: number;
  netIncome: number;
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
  const [showAll, setShowAll] = useState(false);
  const INITIAL_COUNT = 10;

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

  const displayed = showAll ? picks : picks.slice(0, INITIAL_COUNT);

  return (
    <div className="apple-card p-5 md:p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-serif text-lg font-bold text-accent glow-gold">
            Rule of 40 精選
          </h2>
          <p className="text-[10px] text-gray-600 mt-0.5">
            2026 預估・營收成長率 + 利潤率 ≥ 40%・共 {picks.length} 檔達標
          </p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-green-900/30 text-green-400 font-medium tracking-wider uppercase">
          Rule 40
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-2 pb-2 text-[9px] text-gray-500 uppercase tracking-wider">
        <span className="w-20">股票</span>
        <span className="w-16 text-right">成長率</span>
        <span className="w-16 text-right">利潤率</span>
        <span className="w-16 text-right font-bold">Score</span>
      </div>

      <div className="divide-y divide-accent/[0.15]">
        {displayed.map((stock) => {
          const scoreColor = stock.rule40Score >= 80 ? 'text-green-300' :
                            stock.rule40Score >= 60 ? 'text-green-400' : 'text-green-500';
          return (
            <Link
              key={stock.symbol}
              href={`/stock/${stock.symbol}`}
              className="block py-2.5 px-2 rounded transition-all active:bg-primary/10 hover:bg-gray-50 group"
            >
              <div className="flex items-center justify-between">
                <div className="w-20">
                  <span className="font-serif text-sm font-bold text-accent">{stock.symbol}</span>
                  <p className="text-[9px] text-gray-500 truncate">{stock.name}</p>
                </div>
                <span className="w-16 text-right text-xs font-mono text-blue-400">
                  +{stock.revenueGrowth.toFixed(1)}%
                </span>
                <span className="w-16 text-right text-xs font-mono text-yellow-400">
                  {stock.profitMargin.toFixed(1)}%
                </span>
                <span className={`w-16 text-right text-sm font-mono font-bold ${scoreColor}`}>
                  {stock.rule40Score.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[9px] text-gray-500 mt-0.5">
                <span>
                  營收 ${stock.revPrior}B → ${stock.revCurrent}B
                </span>
                <span>
                  {formatMktCap(stock.marketCap)}・{stock.numAnalysts} 位分析師
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
          className="w-full mt-4 py-2.5 rounded-lg border border-accent/20 text-gray-400 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          收合
        </button>
      )}

      <p className="text-[9px] text-gray-500 mt-3 text-center">
        Rule of 40 = 營收成長率(%) + 淨利率(%)・基於分析師共識預估，僅供參考
      </p>
    </div>
  );
}
