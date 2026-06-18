'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AntiMarketCheck {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  dropPct: number | null;
  peakDate: string | null;
  sma130Pct: number | null;
  rule40Score: number | null;
  allPass: boolean;
}

function formatMktCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

export default function PublicPicks() {
  const [results, setResults] = useState<AntiMarketCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState('');
  const [total, setTotal] = useState(0);
  const [passCount, setPassCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch('/api/anti-market-picks?mode=watchlist')
      .then(r => r.json())
      .then(data => {
        const items: AntiMarketCheck[] = data.watchlist ?? [];
        setResults(items);
        setTotal(data.symbols?.length ?? items.length);
        setPassCount(items.filter((s: AntiMarketCheck) => s.allPass).length);
        setUpdatedAt(data.updatedAt ?? '');
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  const passing = results.filter(s => s.allPass);
  const others = results.filter(s => !s.allPass);

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="inline-flex items-center gap-2 mb-1">
          <span className="text-2xl font-serif font-bold text-[#c0392b] tracking-tight">美股反市場精選</span>
          <span className="bg-[#c0392b] text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-widest">CONTRARIAN</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">JG 精選名單即時掃描結果</p>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-6 h-6 border-2 border-[#c0392b]/30 border-t-[#c0392b] rounded-full animate-spin mb-3" />
          <p className="text-xs text-gray-400">掃描中，請稍候...</p>
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="flex items-center justify-between mb-4 px-1">
            <span className="text-xs text-gray-500">
              共 <span className="font-semibold text-gray-700">{total}</span> 檔 ·{' '}
              <span className="font-semibold text-green-600">{passCount}</span> 檔全過
            </span>
            {updatedAt && (
              <span className="text-[10px] text-gray-400">更新 {updatedAt}</span>
            )}
          </div>

          {/* Passing stocks */}
          {passing.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[11px] font-semibold text-green-600 uppercase tracking-wider">全條件通過 ({passing.length})</span>
              </div>
              <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50 overflow-hidden border border-green-100">
                {passing.map(stock => (
                  <Link
                    key={stock.symbol}
                    href={`/stock/${stock.symbol}?from=picks`}
                    className="flex items-center py-3 px-4 hover:bg-green-50/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-sm font-bold text-[#c0392b]">{stock.symbol}</span>
                        <span className="text-[10px] text-gray-400 truncate">{stock.name}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        ${stock.price?.toFixed(2)} · {formatMktCap(stock.marketCap)}
                        {stock.peakDate && ` · 高點 ${stock.peakDate}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-2 shrink-0">
                      {stock.dropPct !== null && (
                        <span className="text-xs font-mono text-red-500">-{stock.dropPct?.toFixed(1)}%</span>
                      )}
                      {stock.rule40Score !== null && (
                        <span className="text-xs font-mono font-bold text-green-600">R{stock.rule40Score?.toFixed(0)}</span>
                      )}
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Other stocks (not all passing) */}
          {others.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="w-2 h-2 rounded-full bg-gray-300" />
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">觀察中 ({others.length})</span>
              </div>
              <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50 overflow-hidden border border-gray-100">
                {others.map(stock => (
                  <Link
                    key={stock.symbol}
                    href={`/stock/${stock.symbol}?from=picks`}
                    className="flex items-center py-3 px-4 hover:bg-gray-50 transition-colors opacity-70"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-sm font-bold text-gray-600">{stock.symbol}</span>
                        <span className="text-[10px] text-gray-400 truncate">{stock.name}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        ${stock.price?.toFixed(2)} · {formatMktCap(stock.marketCap)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-2 shrink-0">
                      {stock.dropPct !== null && (
                        <span className="text-[10px] font-mono text-gray-400">-{stock.dropPct?.toFixed(1)}%</span>
                      )}
                      {stock.rule40Score !== null && (
                        <span className="text-[10px] font-mono text-gray-400">R{stock.rule40Score?.toFixed(0)}</span>
                      )}
                      <span className="w-2 h-2 rounded-full bg-gray-200" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {results.length === 0 && (
            <div className="text-center py-16 text-gray-400 text-sm">暫無資料</div>
          )}
        </>
      )}

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-[10px] text-gray-300">JG Trading · 反市場精選</p>
      </div>
    </div>
  );
}
