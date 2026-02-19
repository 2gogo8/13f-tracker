'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

interface AntiMarketPick {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  deviation: number;
  isUptrend: boolean;
  revenueGrowth: number;
  profitMargin: number;
  rule40Score: number;
  patternScore: number;
  patternGrade: string;
}

type SortField = 'deviation' | 'revenueGrowth' | 'profitMargin' | 'rule40Score' | 'patternScore';

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-green-500';
    case 'B': return 'text-blue-400';
    case 'C': return 'text-yellow-500';
    default: return 'text-gray-400';
  }
}

function formatMktCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

export default function AntiMarketPicks() {
  const [picks, setPicks] = useState<AntiMarketPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('rule40Score');
  const [sortAsc, setSortAsc] = useState(false); // default descending
  const [showAll, setShowAll] = useState(false);
  const INITIAL_COUNT = 10;

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

  const sorted = useMemo(() => {
    const arr = [...picks];
    arr.sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      // For deviation, "more negative" = more oversold, so ascending means most oversold first
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [picks, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      // Default sort direction per field
      setSortAsc(field === 'deviation' ? true : false);
    }
  };

  const displayed = showAll ? sorted : sorted.slice(0, INITIAL_COUNT);

  if (loading) {
    return (
      <div className="apple-card p-5 md:p-6 mb-8">
        <h2 className="font-serif text-lg font-bold text-primary glow-red">美股反市場精選</h2>
        <p className="text-[10px] text-gray-600 mt-1">交叉比對中...</p>
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
          <span className="text-primary glow-red">美股反</span>
          <span className="text-gray-900">市場精選</span>
        </h2>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-primary/20 text-primary font-medium tracking-wider uppercase">
          Contrarian
        </span>
      </div>
      <p className="text-[10px] text-gray-600 mb-4">
        6 個月上升趨勢（現價 &gt; SMA130）+ 月均線負乖離超過 2 倍 ATR30・共 {picks.length} 檔命中
      </p>

      {picks.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-400 text-sm">目前無交叉命中的標的</p>
          <p className="text-[10px] text-gray-600 mt-1">
            當好公司被市場錯殺時，這裡會出現機會
          </p>
        </div>
      ) : (
        <>
          {/* Sortable Header */}
          <div className="flex items-center px-2 pb-2">
            <span className="flex-1 text-[9px] text-gray-600 uppercase tracking-wider">股票</span>
            <SortHeader field="patternScore" label="型態" />
            <SortHeader field="deviation" label="偏離" />
            <SortHeader field="revenueGrowth" label="成長" />
            <SortHeader field="profitMargin" label="利潤" />
            <SortHeader field="rule40Score" label="R40" />
          </div>

          <div className="divide-y divide-accent/[0.15]">
            {displayed.map((stock) => (
              <Link
                key={stock.symbol}
                href={`/stock/${stock.symbol}`}
                className="flex items-center py-3 px-2 rounded transition-all active:bg-primary/10 hover:bg-gray-50 group"
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
                <span className={`w-14 text-right text-xs font-mono font-bold ${gradeColor(stock.patternGrade)}`}>
                  {stock.patternGrade}<span className="text-[9px] font-normal text-gray-500 ml-0.5">{stock.patternScore?.toFixed(0) || '-'}</span>
                </span>
                <span className={`w-14 text-right text-xs font-mono font-semibold ${
                  stock.deviation <= -3 ? 'text-green-500' : 
                  stock.deviation <= -2 ? 'text-primary' : 'text-gray-500'
                }`}>
                  {stock.deviation.toFixed(1)}σ
                </span>
                <span className="w-14 text-right text-xs font-mono text-blue-400">
                  +{stock.revenueGrowth.toFixed(0)}%
                </span>
                <span className="w-14 text-right text-xs font-mono text-yellow-500">
                  {stock.profitMargin.toFixed(0)}%
                </span>
                <span className="w-14 text-right text-sm font-mono font-bold text-green-500">
                  {stock.rule40Score.toFixed(0)}
                </span>
              </Link>
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
        篩選：現價 &gt; SMA130（趨勢向上）+ σ = (現價-SMA20)/ATR30 | 型態 = 圖形DNA | R40 = 成長率 + 淨利率
      </p>
    </div>
  );
}
