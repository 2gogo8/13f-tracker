'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AnalystItem {
  symbol: string;
  name: string;
  price: number;
  targetConsensus: number;
  targetHigh: number | null;
  targetLow: number | null;
  upside: number | null;
}

export default function AnalystOverview() {
  const [items, setItems] = useState<AnalystItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/analyst-overview');
        const data = await res.json();
        if (Array.isArray(data)) setItems(data);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="apple-card p-5 md:p-6 mb-8">
        <h2 className="font-serif text-lg font-bold text-gray-900">分析師目標價總覽</h2>
        <p className="text-[10px] text-gray-500 mt-1">載入中...</p>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="apple-card p-5 md:p-6 mb-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-serif text-lg font-bold text-gray-900">分析師目標價總覽</h2>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-accent/20 text-accent font-medium tracking-wider uppercase">
          Consensus
        </span>
      </div>
      <p className="text-[10px] text-gray-600 mb-4">
        熱門股票華爾街分析師共識目標價・依潛在漲幅排序
      </p>

      {/* Header */}
      <div className="flex items-center px-2 pb-2">
        <span className="flex-1 text-[9px] text-gray-600 uppercase tracking-wider">股票</span>
        <span className="w-16 text-right text-[9px] text-gray-600 uppercase tracking-wider">現價</span>
        <span className="w-16 text-right text-[9px] text-gray-600 uppercase tracking-wider">目標價</span>
        <span className="w-16 text-right text-[9px] text-gray-600 uppercase tracking-wider">潛在空間</span>
      </div>

      <div className="divide-y divide-accent/[0.15]">
        {items.map((item) => (
          <Link
            key={item.symbol}
            href={`/stock/${item.symbol}`}
            className="flex items-center py-3 px-2 rounded transition-all hover:bg-gray-50 active:bg-primary/10"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-serif text-sm font-bold text-accent">{item.symbol}</span>
                <span className="text-[9px] text-gray-500 truncate">{item.name}</span>
              </div>
            </div>
            <span className="w-16 text-right text-xs font-mono text-gray-700">
              ${item.price.toFixed(0)}
            </span>
            <span className="w-16 text-right text-xs font-mono font-semibold text-accent">
              ${item.targetConsensus.toFixed(0)}
            </span>
            <span className={`w-16 text-right text-xs font-mono font-bold ${
              (item.upside || 0) >= 15 ? 'text-green-600' :
              (item.upside || 0) >= 5 ? 'text-green-500' :
              (item.upside || 0) >= 0 ? 'text-yellow-600' : 'text-primary'
            }`}>
              {item.upside !== null ? `${item.upside >= 0 ? '+' : ''}${item.upside}%` : '—'}
            </span>
          </Link>
        ))}
      </div>

      <p className="text-[9px] text-gray-500 mt-3 text-center">
        目標價 = 華爾街分析師平均共識 | 潛在空間 = (目標價-現價)/現價 | 僅供參考
      </p>
    </div>
  );
}
