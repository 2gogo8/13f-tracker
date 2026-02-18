'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AntiMarketPick {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  deviation: number;
  revenueGrowth: number;
  profitMargin: number;
  rule40Score: number;
}

function formatMktCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

export default function AntiMarketPicks() {
  const [picks, setPicks] = useState<AntiMarketPick[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPicks() {
      try {
        const res = await fetch('/api/anti-market-picks');
        const data = await res.json();
        if (Array.isArray(data)) setPicks(data);
      } catch {}
      setLoading(false);
    }
    fetchPicks();
  }, []);

  if (loading) {
    return (
      <div className="apple-card p-5 md:p-6 mb-8">
        <h2 className="font-serif text-lg font-bold text-primary glow-red">反市場特選</h2>
        <p className="text-[10px] text-gray-600 mt-1">交叉比對中...</p>
      </div>
    );
  }

  return (
    <div className="apple-card p-5 md:p-6 mb-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-serif text-lg font-bold">
          <span className="text-primary glow-red">反</span>
          <span className="text-white">市場特選</span>
        </h2>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-primary/20 text-primary font-medium tracking-wider uppercase">
          Contrarian
        </span>
      </div>
      <p className="text-[10px] text-gray-600 mb-4">
        負乖離超賣 + Rule of 40 達標（營收成長率 + 利潤率 ≥ 40）・共 {picks.length} 檔交叉命中
      </p>

      {picks.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">目前無交叉命中的標的</p>
          <p className="text-[10px] text-gray-600 mt-1">
            當好公司被市場錯殺時，這裡會出現機會
          </p>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center px-2 pb-2 text-[9px] text-gray-600 uppercase tracking-wider">
            <span className="flex-1">股票</span>
            <span className="w-14 text-right">偏離</span>
            <span className="w-14 text-right">成長</span>
            <span className="w-14 text-right">利潤</span>
            <span className="w-14 text-right">R40</span>
          </div>

          <div className="divide-y divide-accent/[0.15]">
            {picks.map((stock) => (
              <Link
                key={stock.symbol}
                href={`/stock/${stock.symbol}`}
                className="flex items-center py-3 px-2 rounded transition-all active:bg-primary/10 hover:bg-white/[0.02] group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-serif text-sm font-bold text-accent">{stock.symbol}</span>
                    <span className="text-[9px] text-gray-500 truncate">{stock.name}</span>
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    ${stock.price.toFixed(2)}・{formatMktCap(stock.marketCap)}
                  </div>
                </div>
                <span className="w-14 text-right text-xs font-mono text-primary font-semibold">
                  {stock.deviation.toFixed(1)}%
                </span>
                <span className="w-14 text-right text-xs font-mono text-blue-400">
                  +{stock.revenueGrowth.toFixed(0)}%
                </span>
                <span className="w-14 text-right text-xs font-mono text-yellow-400">
                  {stock.profitMargin.toFixed(0)}%
                </span>
                <span className="w-14 text-right text-sm font-mono font-bold text-green-400">
                  {stock.rule40Score.toFixed(0)}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="text-[9px] text-gray-700 mt-3 text-center">
        偏離 = 現價 vs 50MA | R40 = 營收成長率 + 淨利率 | 僅供參考，非投資建議
      </p>
    </div>
  );
}
