'use client';

import { useState, useMemo, useEffect } from 'react';

interface SlopeResult {
  symbol: string;
  slope: number;
  post_return: number;
  group: string;
  short_pct: number;
  short_ratio: number;
  sector: string;
  industry: string;
  triple_filter: boolean;
  tw_suppliers?: string[];
}

interface ScanResponse {
  bench_slope: number;
  bench_post: number;
  explosive_threshold?: number;
  data_updated_at: string;
  cached_date1?: string;
  cached_date2?: string;
  mode: 'dynamic' | 'cached';
  results: SlopeResult[];
  error?: string;
  message?: string;
}

type GroupFilter = 'all' | '⚡爆賺' | 'A超強' | 'B中強' | 'C死區' | 'E極弱' | 'triple';
type SortKey = 'slope' | 'post_return' | 'short_pct' | 'short_ratio' | 'symbol';

const GROUP_COLORS: Record<string, string> = {
  '⚡爆賺': 'text-amber-700',
  'A超強': 'text-emerald-700',
  'B中強': 'text-blue-700',
  'C死區': 'text-red-600',
  'D持平': 'text-gray-500',
  'E極弱': 'text-orange-600',
};

const GROUP_BG: Record<string, string> = {
  '⚡爆賺': 'bg-amber-50 border-amber-300',
  'A超強': 'bg-emerald-50 border-emerald-300',
  'B中強': 'bg-blue-50 border-blue-300',
  'C死區': 'bg-red-50 border-red-300',
  'D持平': 'bg-gray-100 border-gray-300',
  'E極弱': 'bg-orange-50 border-orange-300',
};

export default function SlopeScanner() {
  const [date1, setDate1] = useState('2025-11-20');
  const [date2, setDate2] = useState('2026-02-28');
  const [benchmark, setBenchmark] = useState('QQQ');

  // Restore dates only, auto-run on mount
  useEffect(() => {
    let d1 = date1, d2 = date2, bm = benchmark;
    try {
      localStorage.removeItem('us_slope_state');
      localStorage.removeItem('us_slope_state_v2');
      const saved = localStorage.getItem('us_slope_dates');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.date1) { d1 = state.date1; setDate1(state.date1); }
        if (state.date2) { d2 = state.date2; setDate2(state.date2); }
        if (state.benchmark) { bm = state.benchmark; setBenchmark(state.benchmark); }
      }
    } catch {}
    // Auto-run with saved dates
    setLoading(true);
    setError(null);
    fetch('/api/slope-scanner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date1: d1, date2: d2, benchmark: bm }),
    }).then(r => r.json()).then(json => {
      if (!json.error) setData(json);
      else setError(json.message || '發生錯誤');
    }).catch(e => setError(String(e))).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<GroupFilter>('⚡爆賺');
  const [sortKey, setSortKey] = useState<SortKey>('slope');
  const [sortAsc, setSortAsc] = useState(false);

  async function handleScan() {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch('/api/slope-scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date1, date2, benchmark }),
      });
      const json = await res.json();

      if (json.error === 'data_not_ready') {
        setError('資料尚未準備好，請先在伺服器上執行 scripts/update_slope_cache.py');
        return;
      }
      if (json.error) {
        setError(json.message || '發生錯誤');
        return;
      }
      setData(json);
      try {
        localStorage.setItem('us_slope_dates', JSON.stringify({ date1, date2, benchmark }));
      } catch {}
    } catch (e) {
      setError(`請求失敗: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  const filteredResults = useMemo(() => {
    if (!data) return [];
    let results = [...data.results];

    if (activeFilter === 'triple') {
      results = results.filter((r) => r.triple_filter);
    } else if (activeFilter !== 'all') {
      results = results.filter((r) => r.group === activeFilter);
    }

    results.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });

    return results;
  }, [data, activeFilter, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const stats = useMemo(() => {
    if (!data) return null;
    const explosiveCount = data.results.filter((r) => r.group === '⚡爆賺').length;
    const tripleCount = data.results.filter((r) => r.triple_filter).length;
    const bigWinners = data.results.filter((r) => r.slope > 50).length;
    const hitRate = data.results.length > 0
      ? Math.round((bigWinners / data.results.length) * 100)
      : 0;
    return { explosiveCount, tripleCount, hitRate };
  }, [data]);

  const filterButtons: { key: GroupFilter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: '⚡爆賺', label: '⚡爆賺' },
    { key: 'A超強', label: 'A超強' },
    { key: 'B中強', label: 'B中強' },
    { key: 'C死區', label: 'C死區' },
    { key: 'E極弱', label: 'E極弱' },
    { key: 'triple', label: '★ 三重過濾' },
  ];

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortAsc ? ' ↑' : ' ↓';
  };

  return (
    <div className="apple-card p-4 sm:p-8 mb-10">
      <h2 className="font-serif text-2xl md:text-3xl font-bold mb-6 flex items-center gap-3 text-gray-900">
        🇺🇸 美股爆賺選股
      </h2>

      {/* Input controls */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-xs text-gray-600 mb-1 font-medium">
            第一低點（紅線）
          </label>
          <input
            type="date"
            value={date1}
            onChange={(e) => setDate1(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1 font-medium">
            第二低點（黃線）
          </label>
          <input
            type="date"
            value={date2}
            onChange={(e) => setDate2(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1 font-medium">大盤基準</label>
          <select
            value={benchmark}
            onChange={(e) => setBenchmark(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none"
          >
            <option value="QQQ">QQQ (NASDAQ)</option>
            <option value="SPY">SPY (S&amp;P 500)</option>
            <option value="IWM">IWM (Russell 2000)</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleScan}
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/80 disabled:bg-gray-300 text-white font-semibold rounded-lg px-6 py-2 text-sm transition-all shadow-[0_4px_20px_rgba(196,30,58,0.3)]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                分析中...
              </span>
            ) : (
              '開始分析'
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-6 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Cached mode warning */}
      {data?.mode === 'cached' && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-6 text-amber-700 text-xs">
          ⚠️ 使用快取資料，日期固定為 {data.cached_date1} → {data.cached_date2}
          （執行 update_slope_cache.py 可解鎖任意日期查詢）
        </div>
      )}

      {/* Stats cards */}
      {data && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 mb-1">大盤基準</div>
            <div className="text-xl font-bold text-primary">
              {data.bench_slope.toFixed(2)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              後續 {data.bench_post.toFixed(1)}%
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 mb-1">⚡ 爆賺門檻 / 檔數</div>
            <div className="text-xl font-bold text-amber-600">
              {data.explosive_threshold !== undefined ? `${data.explosive_threshold.toFixed(1)}%` : '—'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.explosiveCount} 檔命中
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 mb-1">三重過濾命中</div>
            <div className="text-xl font-bold text-amber-600">
              {stats.tripleCount}
            </div>
            <div className="text-xs text-gray-500 mt-1">反市場+空頭+板塊</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 mb-1">大漲股命中率</div>
            <div className="text-xl font-bold text-primary">
              {stats.hitRate}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              共 {data.results.length} 檔
            </div>
          </div>
        </div>
      )}

      {/* Filter dropdown */}
      {data && (
        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">組別篩選</label>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as GroupFilter)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 shadow-sm"
          >
            {filterButtons.map((btn) => {
              const count = btn.key === 'all'
                ? data.results.length
                : btn.key === 'triple'
                  ? data.results.filter((r) => r.triple_filter).length
                  : data.results.filter((r) => r.group === btn.key).length;
              return (
                <option key={btn.key} value={btn.key}>
                  {btn.label} ({count})
                </option>
              );
            })}
          </select>
          <span className="text-xs text-gray-400">
            顯示 {filteredResults.length} / {data.results.length} 支
          </span>
        </div>
      )}

      {/* Results table */}
      {data && filteredResults.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-xs text-gray-600 border-b border-gray-200">
                <th
                  className="text-left py-2 px-3 cursor-pointer hover:text-gray-900 font-semibold"
                  onClick={() => handleSort('symbol')}
                >
                  代號{sortIndicator('symbol')}
                </th>
                <th className="text-center py-2 px-3 font-semibold">組別</th>
                <th
                  className="text-right py-2 px-3 cursor-pointer hover:text-gray-900 font-semibold"
                  onClick={() => handleSort('slope')}
                >
                  反市場選股指標{sortIndicator('slope')}
                </th>
                <th
                  className="text-right py-2 px-3 cursor-pointer hover:text-gray-900 font-semibold"
                  onClick={() => handleSort('post_return')}
                >
                  股價倍數{sortIndicator('post_return')}
                </th>
                <th
                  className="text-right py-2 px-3 cursor-pointer hover:text-gray-900 font-semibold hidden sm:table-cell"
                  onClick={() => handleSort('short_pct')}
                >
                  空頭佔比{sortIndicator('short_pct')}
                </th>
                <th
                  className="text-right py-2 px-3 cursor-pointer hover:text-gray-900 font-semibold hidden md:table-cell"
                  onClick={() => handleSort('short_ratio')}
                >
                  回補天數{sortIndicator('short_ratio')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((r, idx) => (
                <tr
                  key={r.symbol}
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    r.triple_filter ? 'bg-primary/5' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }`}
                >
                  <td className="py-2 px-3 font-medium">
                    <a
                      href={`/stock/${r.symbol}`}
                      className="text-gray-900 hover:text-primary transition-colors font-semibold"
                    >
                      {r.triple_filter && (
                        <span className="text-primary mr-1">★</span>
                      )}
                      {r.symbol}
                    </a>
                    {r.tw_suppliers && r.tw_suppliers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.tw_suppliers.slice(0, 5).map(tw => (
                          <span key={tw} className="inline-block px-1.5 py-0.5 rounded text-xs font-mono bg-blue-50 border border-blue-200 text-blue-700">
                            🇹🇼{tw}
                          </span>
                        ))}
                        {r.tw_suppliers.length > 5 && (
                          <span className="text-xs text-gray-400">+{r.tw_suppliers.length - 5}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs border font-medium ${
                        GROUP_BG[r.group] || 'bg-gray-100 border-gray-300'
                      } ${GROUP_COLORS[r.group] || 'text-gray-600'}`}
                    >
                      {r.group}
                    </span>
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-mono font-semibold ${
                      r.slope > 50
                        ? 'text-emerald-700'
                        : r.slope > 0
                          ? 'text-gray-800'
                          : 'text-red-600'
                    }`}
                  >
                    {r.slope.toFixed(1)}%
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-mono font-semibold ${
                      r.post_return > 0 ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {(1 + r.post_return / 100).toFixed(2)}倍
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-mono hidden sm:table-cell ${
                      r.short_pct >= 5 && r.short_pct <= 15
                        ? 'text-amber-600 font-semibold'
                        : 'text-gray-600'
                    }`}
                  >
                    {r.short_pct > 0 ? `${r.short_pct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-gray-600 hidden md:table-cell">
                    {r.short_ratio > 0 ? r.short_ratio.toFixed(1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && filteredResults.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          此篩選條件下無符合的股票
        </div>
      )}

      {data && (
        <div className="mt-4 text-xs text-gray-400 text-right">
          資料更新：{new Date(data.data_updated_at).toLocaleString('zh-TW')}
        </div>
      )}
    </div>
  );
}
