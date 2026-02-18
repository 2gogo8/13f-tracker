'use client';

import { useState } from 'react';
import { Supplier } from '@/data/supply-chain';

const marketLabels: Record<string, { label: string; flag: string }> = {
  TW: { label: '台灣', flag: '🇹🇼' },
  US: { label: '美國', flag: '🇺🇸' },
  KR: { label: '韓國', flag: '🇰🇷' },
  JP: { label: '日本', flag: '🇯🇵' },
  NL: { label: '荷蘭', flag: '🇳🇱' },
  DE: { label: '德國', flag: '🇩🇪' },
  OTHER: { label: '其他', flag: '🌐' },
};

const categoryLabels: Record<string, { label: string; emoji: string; color: string }> = {
  chip: { label: '晶片', emoji: '🔲', color: 'border-blue-300 bg-blue-50/80' },
  assembly: { label: '組裝代工', emoji: '🏭', color: 'border-amber-300 bg-amber-50/80' },
  component: { label: '零組件', emoji: '⚙️', color: 'border-green-300 bg-green-50/80' },
  equipment: { label: '設備', emoji: '🔧', color: 'border-purple-300 bg-purple-50/80' },
  material: { label: '材料', emoji: '🧱', color: 'border-orange-300 bg-orange-50/80' },
  software: { label: '軟體', emoji: '💻', color: 'border-cyan-300 bg-cyan-50/80' },
  service: { label: '客戶關係', emoji: '🤝', color: 'border-pink-300 bg-pink-50/80' },
};

type FilterMarket = 'all' | 'TW' | 'US' | 'other';

interface SupplyChainProps {
  symbol: string;
  suppliers: Supplier[];
}

export default function SupplyChain({ symbol, suppliers }: SupplyChainProps) {
  const [filter, setFilter] = useState<FilterMarket>('all');

  if (suppliers.length === 0) return null;

  const twCount = suppliers.filter(s => s.market === 'TW').length;
  const usCount = suppliers.filter(s => s.market === 'US').length;
  const otherCount = suppliers.length - twCount - usCount;

  const filtered = suppliers.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'TW') return s.market === 'TW';
    if (filter === 'US') return s.market === 'US';
    return s.market !== 'TW' && s.market !== 'US';
  });

  // Group by category
  const grouped = filtered.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<string, Supplier[]>);

  const categoryOrder = ['chip', 'assembly', 'component', 'equipment', 'material', 'software', 'service'];

  return (
    <div className="apple-card p-6 md:p-8">
      <h2 className="font-serif text-2xl font-bold mb-2 flex items-center gap-2">
        供應鏈圖譜
      </h2>
      <p className="text-sm text-gray-400 mb-6">
        {symbol} 的關鍵供應商與合作夥伴（共 {suppliers.length} 家，台灣 {twCount} 家）
      </p>

      {/* Market Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { key: 'all' as FilterMarket, label: `全部 (${suppliers.length})` },
          { key: 'TW' as FilterMarket, label: `🇹🇼 台灣 (${twCount})` },
          { key: 'US' as FilterMarket, label: `🇺🇸 美國 (${usCount})` },
          ...(otherCount > 0 ? [{ key: 'other' as FilterMarket, label: `🌐 其他 (${otherCount})` }] : []),
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === f.key
                ? 'bg-accent text-black'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grouped suppliers */}
      <div className="space-y-4">
        {categoryOrder.map(cat => {
          const items = grouped[cat];
          if (!items || items.length === 0) return null;
          const catInfo = categoryLabels[cat] || { label: cat, emoji: '📦', color: 'border-gray-300 bg-gray-100/80' };

          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span>{catInfo.emoji}</span>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{catInfo.label}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {items.map((s, i) => {
                  const mkt = marketLabels[s.market] || marketLabels.OTHER;
                  return (
                    <div
                      key={i}
                      className={`border rounded-lg px-4 py-3 ${catInfo.color} transition-colors hover:brightness-125`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-gray-900">{s.name}</span>
                            <span className="text-[10px]">{mkt.flag}</span>
                          </div>
                          {s.ticker && (
                            <span className="text-xs text-accent font-mono">{s.ticker}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{s.role}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
