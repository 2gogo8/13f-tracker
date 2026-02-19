'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';

interface AntiMarketPick {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  dropPct: number;
  peakPrice: number;
  peakDate: string;
  slopeScore: number;
  slopeStock: number;
  slopeIxic: number;
  revenueGrowth: number;
  profitMargin: number;
  rule40Score: number;
}

type SortField = 'dropPct' | 'rule40Rank' | 'slopeScore';

function formatMktCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

const DEFAULT_DATE = '2026-01-20';

export default function AntiMarketPicks() {
  const [picks, setPicks] = useState<AntiMarketPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('dropPct');
  const [sortAsc, setSortAsc] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [fromDate, setFromDate] = useState(DEFAULT_DATE);
  const [pendingDate, setPendingDate] = useState(DEFAULT_DATE);
  const INITIAL_COUNT = 10;

  const fetchPicks = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/anti-market-picks?fromDate=${date}`);
      const data = await res.json();
      if (Array.isArray(data)) setPicks(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPicks(fromDate);
  }, [fromDate, fetchPicks]);

  const handleDateChange = () => {
    if (pendingDate && pendingDate !== fromDate) {
      setFromDate(pendingDate);
      setShowAll(false);
    }
  };

  // Compute R40 rank within this pick list
  const r40Ranked = useMemo(() => {
    const byR40 = [...picks].sort((a, b) => b.rule40Score - a.rule40Score);
    const rankMap = new Map<string, number>();
    byR40.forEach((p, i) => rankMap.set(p.symbol, i + 1));
    return rankMap;
  }, [picks]);

  const sorted = useMemo(() => {
    const arr = [...picks];
    arr.sort((a, b) => {
      if (sortField === 'rule40Rank') {
        const ra = r40Ranked.get(a.symbol) || 999;
        const rb = r40Ranked.get(b.symbol) || 999;
        return sortAsc ? ra - rb : rb - ra;
      }
      const va = a[sortField as keyof AntiMarketPick] as number;
      const vb = b[sortField as keyof AntiMarketPick] as number;
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [picks, sortField, sortAsc, r40Ranked]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'rule40Rank');
    }
  };

  const displayed = showAll ? sorted : sorted.slice(0, INITIAL_COUNT);

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

      {/* Date Picker */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] text-gray-500">起算日期</span>
        <input
          type="date"
          value={pendingDate}
          onChange={(e) => setPendingDate(e.target.value)}
          className="text-xs px-2 py-1 rounded-md border border-gray-200 bg-white/80 text-gray-700 focus:outline-none focus:ring-1 focus:ring-accent/30"
          max={new Date().toISOString().split('T')[0]}
          min="2024-01-01"
        />
        {pendingDate !== fromDate && (
          <button
            onClick={handleDateChange}
            className="text-[10px] px-2.5 py-1 rounded-md bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
          >
            掃描
          </button>
        )}
        {fromDate !== DEFAULT_DATE && (
          <button
            onClick={() => { setPendingDate(DEFAULT_DATE); setFromDate(DEFAULT_DATE); }}
            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            重置
          </button>
        )}
      </div>

      <p className="text-[10px] text-gray-600 mb-4">
        連續下跌 0-35%（自 {fromDate} 起）+ 走勢斜率近 IXIC + R40 ≥ 40{!loading && `・共 ${picks.length} 檔命中`}
      </p>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          <p className="text-[10px] text-gray-500 mt-2">掃描中（約 30 秒）...</p>
        </div>
      ) : picks.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-400 text-sm">目前無交叉命中的標的</p>
          <p className="text-[10px] text-gray-600 mt-1">
            當好公司跟著大盤被錯殺時，這裡會出現機會
          </p>
        </div>
      ) : (
        <>
          {/* Sortable Header */}
          <div className="flex items-center px-2 pb-2">
            <span className="flex-1 text-[9px] text-gray-600 uppercase tracking-wider">股票</span>
            <SortHeader field="slopeScore" label="型態" />
            <SortHeader field="dropPct" label="跌幅" />
            <SortHeader field="rule40Rank" label="R40排名" />
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
                    ${stock.price.toFixed(2)}・{formatMktCap(stock.marketCap)}・高點 {stock.peakDate}
                  </div>
                </div>
                <span className={`w-14 text-right text-xs font-mono font-bold ${
                  stock.slopeScore >= 80 ? 'text-green-500' :
                  stock.slopeScore >= 50 ? 'text-blue-400' :
                  'text-yellow-500'
                }`}>
                  {stock.slopeScore}
                  <span className="text-[8px] font-normal text-gray-400">分</span>
                </span>
                <span className={`w-14 text-right text-xs font-mono font-semibold ${
                  stock.dropPct >= 25 ? 'text-primary font-bold' :
                  stock.dropPct >= 15 ? 'text-red-400' : 'text-gray-500'
                }`}>
                  -{stock.dropPct}%
                </span>
                <span className="w-14 text-right text-sm font-mono font-bold text-accent">
                  #{r40Ranked.get(stock.symbol) || '-'}
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
        型態 = 7日走勢與IXIC斜率相似度(100=完全一致) | 跌幅 = 自高點連續下跌% | R40排名 = 精選內的 Rule of 40 排名 | 僅供參考
      </p>
    </div>
  );
}
