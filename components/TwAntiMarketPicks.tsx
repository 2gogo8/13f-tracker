'use client';

import { useEffect, useState, useMemo } from 'react';

interface TwAntiMarketPick {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  sma20: number;
  atr14: number;
  deviation: number;
  signal: string;
}

type SortField = 'deviation' | 'price' | 'sma20' | 'atr14';

export default function TwAntiMarketPicks() {
  const [picks, setPicks] = useState<TwAntiMarketPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('deviation');
  const [sortAsc, setSortAsc] = useState(true); // ascending for deviation (most oversold first)
  const [showAll, setShowAll] = useState(false);
  const INITIAL_COUNT = 10;

  useEffect(() => {
    async function fetchPicks() {
      try {
        const res = await fetch('/api/tw/oversold');
        const data = await res.json();
        if (Array.isArray(data)) setPicks(data);
      } catch (e) {
        console.error('Failed to fetch TW oversold picks:', e);
      }
      setLoading(false);
    }
    fetchPicks();
  }, []);

  const sorted = useMemo(() => {
    const arr = [...picks];
    arr.sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [picks, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'deviation' ? true : false);
    }
  };

  const displayed = showAll ? sorted : sorted.slice(0, INITIAL_COUNT);

  if (loading) {
    return (
      <div className="apple-card p-5 md:p-6 mb-8">
        <h2 className="font-serif text-lg font-bold text-primary glow-red">台股反市場精選</h2>
        <p className="text-[10px] text-gray-600 mt-1">掃描台股中...</p>
      </div>
    );
  }

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => {
    const isActive = sortField === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className={`w-14 text-right text-[9px] uppercase tracking-wider transition-colors ${
          isActive ? 'text-accent font-bold' : 'text-gray-600 hover:text-gray-500'
        }`}
      >
        {label}
        {isActive && (
          <span className="ml-0.5">{sortAsc ? '↑' : '↓'}</span>
        )}
      </button>
    );
  };

  return (
    <div className="apple-card p-5 md:p-6 mb-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-serif text-lg font-bold">
          <span className="text-primary glow-red">台股反</span>
          <span className="text-gray-900">市場精選</span>
        </h2>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-primary/20 text-primary font-medium tracking-wider uppercase">
          Contrarian
        </span>
      </div>
      <p className="text-[10px] text-gray-600 mb-4">
        負乖離超賣・台股50+中型100・共 {picks.length} 檔負偏離超過 -1σ
      </p>

      {picks.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-400 text-sm">目前無負乖離超賣標的</p>
          <p className="text-[10px] text-gray-600 mt-1">
            當台股優質個股被市場錯殺時，這裡會出現機會
          </p>
        </div>
      ) : (
        <>
          {/* Sortable Header */}
          <div className="flex items-center px-2 pb-2">
            <span className="flex-1 text-[9px] text-gray-600 uppercase tracking-wider">股票</span>
            <SortHeader field="deviation" label="偏離" />
            <SortHeader field="sma20" label="SMA20" />
            <SortHeader field="atr14" label="ATR14" />
          </div>

          <div className="divide-y divide-accent/[0.15]">
            {displayed.map((stock) => (
              <div
                key={stock.symbol}
                className="flex items-center py-3 px-2 rounded transition-all hover:bg-gray-50 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-serif text-sm font-bold text-accent">{stock.symbol}</span>
                    <span className="text-[9px] text-gray-500 truncate">{stock.name}</span>
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    ${stock.price.toFixed(2)}・{stock.sector}
                  </div>
                </div>
                <span className="w-14 text-right text-xs font-mono text-primary font-semibold">
                  {stock.deviation.toFixed(1)}σ
                </span>
                <span className="w-14 text-right text-xs font-mono text-gray-600">
                  {stock.sma20.toFixed(1)}
                </span>
                <span className="w-14 text-right text-xs font-mono text-gray-600">
                  {stock.atr14.toFixed(1)}
                </span>
              </div>
            ))}
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
        </>
      )}

      <p className="text-[9px] text-gray-500 mt-3 text-center">
        點擊欄位標題排序 | 偏離 = (現價 - SMA20) / ATR14 | 僅供參考，非投資建議
      </p>
    </div>
  );
}
