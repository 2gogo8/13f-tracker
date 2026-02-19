'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface SectorStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  deviation: number | null;
  patternScore: number | null;
  patternGrade: string | null;
  sma20: number | null;
}

type SortField = 'symbol' | 'price' | 'change' | 'deviation' | 'patternScore';

export default function SectorPage() {
  const params = useParams();
  const sectorName = decodeURIComponent(params.name as string);
  const [stocks, setStocks] = useState<SectorStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('deviation');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/sector-stocks?sector=${encodeURIComponent(sectorName)}`);
        const data = await res.json();
        if (Array.isArray(data)) setStocks(data);
      } catch {}
      setLoading(false);
    }
    fetchData();
  }, [sectorName]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'symbol');
    }
  };

  const sorted = [...stocks].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    const av = a[sortField], bv = b[sortField];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv as string) * dir;
    return ((av as number) - (bv as number)) * dir;
  });

  const gradeColor = (grade: string | null) => {
    if (!grade) return 'text-gray-400';
    if (grade === 'A') return 'text-green-600';
    if (grade === 'B') return 'text-amber-600';
    if (grade === 'C') return 'text-gray-500';
    return 'text-red-500';
  };

  const deviationColor = (d: number | null) => {
    if (d === null) return 'text-gray-400';
    if (d <= -2) return 'text-red-600 font-bold';
    if (d <= -1) return 'text-red-500';
    if (d >= 2) return 'text-green-600 font-bold';
    if (d >= 1) return 'text-green-500';
    return 'text-gray-600';
  };

  const SortHeader = ({ field, label, className = '' }: { field: SortField; label: string; className?: string }) => (
    <button
      onClick={() => handleSort(field)}
      className={`flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors ${className}`}
    >
      {label}
      {sortField === field && (
        <span className="text-primary">{sortAsc ? '↑' : '↓'}</span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F5F3EF]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← 返回首頁
          </Link>
          <h1 className="font-serif text-3xl font-bold text-gray-900 mt-3">
            {sectorName}板塊
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            共 {stocks.length} 檔股票 · 含乖離率與型態評級
          </p>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            <p className="mt-4 text-gray-500 text-sm">載入板塊數據中（需計算乖離率與型態）...</p>
          </div>
        ) : (
          <div className="apple-card overflow-hidden">
            {/* Table Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 border-b border-gray-200">
              <div className="w-16 flex-shrink-0">
                <SortHeader field="symbol" label="代號" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-gray-500">公司</span>
              </div>
              <div className="w-20 text-right flex-shrink-0">
                <SortHeader field="price" label="股價" className="justify-end" />
              </div>
              <div className="w-16 text-right flex-shrink-0">
                <SortHeader field="change" label="漲跌" className="justify-end" />
              </div>
              <div className="w-20 text-right flex-shrink-0">
                <SortHeader field="deviation" label="乖離率" className="justify-end" />
              </div>
              <div className="w-20 text-right flex-shrink-0 hidden sm:block">
                <SortHeader field="patternScore" label="型態" className="justify-end" />
              </div>
            </div>

            {/* Rows */}
            <div className="max-h-[70vh] overflow-y-auto">
              {sorted.map((stock) => (
                <Link
                  key={stock.symbol}
                  href={`/stock/${stock.symbol}`}
                  className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-16 flex-shrink-0">
                    <span className="text-sm font-bold text-primary">{stock.symbol}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 truncate">{stock.name}</p>
                  </div>
                  <div className="w-20 text-right flex-shrink-0">
                    <span className="text-sm text-gray-900">${stock.price.toFixed(2)}</span>
                  </div>
                  <div className="w-16 text-right flex-shrink-0">
                    <span className={`text-xs font-medium ${stock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-20 text-right flex-shrink-0">
                    <span className={`text-sm ${deviationColor(stock.deviation)}`}>
                      {stock.deviation !== null ? `${stock.deviation > 0 ? '+' : ''}${stock.deviation}σ` : '—'}
                    </span>
                  </div>
                  <div className="w-20 text-right flex-shrink-0 hidden sm:flex items-center justify-end gap-1">
                    {stock.patternGrade ? (
                      <>
                        <span className={`text-sm font-bold ${gradeColor(stock.patternGrade)}`}>
                          {stock.patternGrade}
                        </span>
                        <span className="text-xs text-gray-400">
                          {stock.patternScore}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
