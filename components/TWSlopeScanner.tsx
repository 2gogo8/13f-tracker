'use client';

import { useState, useMemo } from 'react';

interface Type1Result {
  twSymbol: string;
  twName: string;
  usParent: string;
  role: string;
  twSlope: number;
  usSlope: number;
}

interface Type2Result {
  twSymbol: string;
  twName: string;
  sector: string;
  twSlope: number;
  taiexSlope: number;
}

interface TWScanResponse {
  taiex_slope: number;
  bench_slope_us: number;
  explosive_threshold: number;
  data_updated_at: string;
  type1: Type1Result[];
  type2: Type2Result[];
  error?: string;
  message?: string;
}

type TabKey = 'type1' | 'type2';
type SortKey1 = 'twSymbol' | 'twSlope' | 'usSlope' | 'usParent';
type SortKey2 = 'twSymbol' | 'twSlope' | 'sector';

export default function TWSlopeScanner() {
  const [date1, setDate1] = useState('2025-11-20');
  const [date2, setDate2] = useState('2026-02-28');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TWScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('type1');

  // Type1 sort
  const [sort1Key, setSort1Key] = useState<SortKey1>('twSlope');
  const [sort1Asc, setSort1Asc] = useState(true);

  // Type2 sort
  const [sort2Key, setSort2Key] = useState<SortKey2>('twSlope');
  const [sort2Asc, setSort2Asc] = useState(false);

  async function handleScan() {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch('/api/tw-slope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date1, date2 }),
      });
      const json = await res.json();

      if (json.error === 'tw_data_not_ready') {
        setError('台股資料尚未準備好，請先執行 scripts/update_tw_slope_cache.py');
        return;
      }
      if (json.error) {
        setError(json.message || '發生錯誤');
        return;
      }
      setData(json);
    } catch (e) {
      setError(`請求失敗: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  // Type1 sorted
  const sortedType1 = useMemo(() => {
    if (!data) return [];
    const arr = [...data.type1];
    arr.sort((a, b) => {
      const valA = a[sort1Key];
      const valB = b[sort1Key];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sort1Asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sort1Asc
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
    return arr;
  }, [data, sort1Key, sort1Asc]);

  // Type2 sorted
  const sortedType2 = useMemo(() => {
    if (!data) return [];
    const arr = [...data.type2];
    arr.sort((a, b) => {
      const valA = a[sort2Key];
      const valB = b[sort2Key];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sort2Asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sort2Asc
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
    return arr;
  }, [data, sort2Key, sort2Asc]);

  function handleSort1(key: SortKey1) {
    if (sort1Key === key) {
      setSort1Asc(!sort1Asc);
    } else {
      setSort1Key(key);
      setSort1Asc(key === 'twSlope'); // slope default asc (most negative first)
    }
  }

  function handleSort2(key: SortKey2) {
    if (sort2Key === key) {
      setSort2Asc(!sort2Asc);
    } else {
      setSort2Key(key);
      setSort2Asc(false);
    }
  }

  const sortIndicator1 = (key: SortKey1) => {
    if (sort1Key !== key) return '';
    return sort1Asc ? ' ↑' : ' ↓';
  };

  const sortIndicator2 = (key: SortKey2) => {
    if (sort2Key !== key) return '';
    return sort2Asc ? ' ↑' : ' ↓';
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'type1', label: '🔗 供應鏈補漲', count: data?.type1.length ?? 0 },
    { key: 'type2', label: '📈 跟盤型', count: data?.type2.length ?? 0 },
  ];

  return (
    <div className="apple-card p-4 sm:p-8 mb-10">
      <h2 className="font-serif text-2xl md:text-3xl font-bold mb-6 flex items-center gap-3">
        🇹🇼 爆賺選股 — 台股
      </h2>

      {/* Date inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">
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
          <label className="block text-xs text-gray-500 mb-1 font-medium">
            第二低點（黃線）
          </label>
          <input
            type="date"
            value={date2}
            onChange={(e) => setDate2(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
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
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Stats cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 mb-1 font-medium">TAIEX 斜率</div>
            <div className="text-xl font-bold text-accent">
              {data.taiex_slope.toFixed(2)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">加權指數基準</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 mb-1 font-medium">美股基準 (QQQ)</div>
            <div className="text-xl font-bold text-blue-700">
              {data.bench_slope_us.toFixed(2)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">NASDAQ 斜率</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 mb-1 font-medium">⚡ 爆賺門檻</div>
            <div className="text-xl font-bold text-amber-600">
              {data.explosive_threshold.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">QQQ × 10</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 mb-1 font-medium">補漲 / 跟盤</div>
            <div className="text-xl font-bold text-emerald-700">
              {data.type1.length} / {data.type2.length}
            </div>
            <div className="text-xs text-gray-500 mt-1">命中檔數</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {data && (
        <div className="flex gap-2 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all border ${
                activeTab === tab.key
                  ? 'bg-primary border-primary text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      )}

      {/* Type1 table */}
      {data && activeTab === 'type1' && (
        <>
          {sortedType1.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-600 border-b border-gray-200">
                    <th
                      className="text-left py-2 px-2 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort1('twSymbol')}
                    >
                      代碼{sortIndicator1('twSymbol')}
                    </th>
                    <th className="text-left py-2 px-2">名稱</th>
                    <th
                      className="text-center py-2 px-2 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort1('usParent')}
                    >
                      美股母公司{sortIndicator1('usParent')}
                    </th>
                    <th className="text-left py-2 px-2 hidden md:table-cell">供應角色</th>
                    <th
                      className="text-right py-2 px-2 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort1('twSlope')}
                    >
                      台股斜率%{sortIndicator1('twSlope')}
                    </th>
                    <th
                      className="text-right py-2 px-2 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort1('usSlope')}
                    >
                      美股斜率%{sortIndicator1('usSlope')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedType1.map((r, i) => (
                    <tr
                      key={`${r.twSymbol}-${r.usParent}-${i}`}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-2 px-2 font-medium font-mono text-gray-900 font-semibold">
                        {r.twSymbol}
                      </td>
                      <td className="py-2 px-2 text-gray-300">{r.twName}</td>
                      <td className="py-2 px-2 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs border bg-yellow-500/10 border-yellow-500/30 text-amber-600">
                          ⚡ {r.usParent}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-600 text-xs hidden md:table-cell">
                        {r.role}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-red-600">
                        {r.twSlope.toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-emerald-700">
                        {r.usSlope.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              目前沒有符合條件的供應鏈補漲股
              <div className="text-xs text-gray-600 mt-2">
                條件：美股母公司爆賺（斜率 ≥ {data.explosive_threshold.toFixed(1)}%）且台股回檔 ≥ 15%
              </div>
            </div>
          )}
        </>
      )}

      {/* Type2 table */}
      {data && activeTab === 'type2' && (
        <>
          {sortedType2.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-600 border-b border-gray-200">
                    <th
                      className="text-left py-2 px-2 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort2('twSymbol')}
                    >
                      代碼{sortIndicator2('twSymbol')}
                    </th>
                    <th className="text-left py-2 px-2">名稱</th>
                    <th
                      className="text-center py-2 px-2 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort2('sector')}
                    >
                      產業{sortIndicator2('sector')}
                    </th>
                    <th
                      className="text-right py-2 px-2 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort2('twSlope')}
                    >
                      台股斜率%{sortIndicator2('twSlope')}
                    </th>
                    <th className="text-right py-2 px-2">
                      TAIEX基準%
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedType2.map((r) => (
                    <tr
                      key={r.twSymbol}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-2 px-2 font-medium font-mono text-gray-900 font-semibold">
                        {r.twSymbol}
                      </td>
                      <td className="py-2 px-2 text-gray-300">{r.twName}</td>
                      <td className="py-2 px-2 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs border bg-blue-500/10 border-blue-500/30 text-blue-700">
                          {r.sector || '—'}
                        </span>
                      </td>
                      <td
                        className={`py-2 px-2 text-right font-mono ${
                          r.twSlope > 50
                            ? 'text-emerald-700'
                            : r.twSlope > 0
                              ? 'text-white'
                              : 'text-red-600'
                        }`}
                      >
                        {r.twSlope.toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-gray-400">
                        {r.taiexSlope.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              目前沒有符合條件的跟盤型股票
              <div className="text-xs text-gray-600 mt-2">
                條件：台股斜率 ≥ TAIEX 斜率（{data.taiex_slope.toFixed(2)}%）
              </div>
            </div>
          )}
        </>
      )}

      {/* Footer */}
      {data && (
        <div className="mt-4 text-xs text-gray-500 text-right">
          資料更新：{new Date(data.data_updated_at).toLocaleString('zh-TW')}
        </div>
      )}
    </div>
  );
}
