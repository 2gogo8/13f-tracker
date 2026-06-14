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

function StatCard({
  label,
  value,
  sub,
  color,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  accent: string;
}) {
  return (
    <div className={`rounded-xl p-4 border-l-4 bg-white shadow-sm border border-gray-100 ${accent}`}>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{sub}</div>
    </div>
  );
}

export default function TWSlopeScanner() {
  const [date1, setDate1] = useState('2026-05-20');
  const [date2, setDate2] = useState('2026-06-11');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TWScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('type2');

  const [sort1Key, setSort1Key] = useState<SortKey1>('twSlope');
  const [sort1Asc, setSort1Asc] = useState(true);
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
        setError('台股資料尚未準備，請先執行 scripts/update_tw_slope_cache.py');
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

  const sortedType1 = useMemo(() => {
    if (!data) return [];
    return [...data.type1].sort((a, b) => {
      const valA = a[sort1Key];
      const valB = b[sort1Key];
      if (typeof valA === 'string' && typeof valB === 'string')
        return sort1Asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return sort1Asc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [data, sort1Key, sort1Asc]);

  const sortedType2 = useMemo(() => {
    if (!data) return [];
    return [...data.type2].sort((a, b) => {
      const valA = a[sort2Key];
      const valB = b[sort2Key];
      if (typeof valA === 'string' && typeof valB === 'string')
        return sort2Asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return sort2Asc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [data, sort2Key, sort2Asc]);

  function handleSort1(key: SortKey1) {
    if (sort1Key === key) setSort1Asc(!sort1Asc);
    else { setSort1Key(key); setSort1Asc(key === 'twSlope'); }
  }
  function handleSort2(key: SortKey2) {
    if (sort2Key === key) setSort2Asc(!sort2Asc);
    else { setSort2Key(key); setSort2Asc(false); }
  }
  const si1 = (k: SortKey1) => sort1Key === k ? (sort1Asc ? ' ↑' : ' ↓') : '';
  const si2 = (k: SortKey2) => sort2Key === k ? (sort2Asc ? ' ↑' : ' ↓') : '';

  const slopeColor = (v: number) =>
    v >= 20 ? 'text-emerald-600 font-bold' : v > 0 ? 'text-emerald-600' : v > -15 ? 'text-orange-500' : 'text-red-600 font-bold';

  return (
    <div className="apple-card p-4 sm:p-8 mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-gray-900">
            🇹🇼 台股斜率選股
          </h2>
          <p className="text-sm text-gray-500 mt-1">供應鏈補漲型 × 跟盤型 雙模式篩選</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 mb-8 p-4 bg-gray-50 rounded-xl border border-gray-100">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            📍 錨點一（起點）
          </label>
          <input
            type="date"
            value={date1}
            onChange={(e) => setDate1(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            🏁 錨點二（終點）
          </label>
          <input
            type="date"
            value={date2}
            onChange={(e) => setDate2(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
          />
        </div>
        <button
          onClick={handleScan}
          disabled={loading}
          className="px-8 py-2.5 bg-primary hover:bg-primary/85 disabled:bg-gray-300 text-white font-bold rounded-lg text-sm transition-all shadow-[0_4px_20px_rgba(196,30,58,0.25)] hover:shadow-[0_6px_24px_rgba(196,30,58,0.35)] active:scale-95"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
              分析中…
            </span>
          ) : (
            '🔍 開始分析'
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm flex items-start gap-2">
          <span className="text-red-400 mt-0.5">⚠</span>
          {error}
        </div>
      )}

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="TAIEX 大盤"
            value={`${data.taiex_slope >= 0 ? '+' : ''}${data.taiex_slope.toFixed(2)}%`}
            sub="加權指數斜率"
            color="text-primary"
            accent="border-l-primary"
          />
          <StatCard
            label="美股 QQQ"
            value={data.bench_slope_us !== 0 ? `${data.bench_slope_us >= 0 ? '+' : ''}${data.bench_slope_us.toFixed(2)}%` : '—'}
            sub="NASDAQ 基準"
            color="text-blue-600"
            accent="border-l-blue-500"
          />
          <StatCard
            label="⚡ 爆賺門檻"
            value={data.explosive_threshold !== 0 ? `${data.explosive_threshold.toFixed(1)}%` : '—'}
            sub="美股 QQQ × 10"
            color="text-amber-600"
            accent="border-l-amber-500"
          />
          <StatCard
            label="命中檔數"
            value={`${data.type1.length} + ${data.type2.length}`}
            sub="補漲 + 跟盤"
            color="text-emerald-600"
            accent="border-l-emerald-500"
          />
        </div>
      )}

      {/* Tabs */}
      {data && (
        <div className="flex gap-2 mb-5 border-b border-gray-100 pb-4">
          {([
            { key: 'type1' as TabKey, emoji: '🔗', label: '供應鏈補漲', count: data.type1.length, desc: '美股爆賺股的台灣供應商，且回檔 ≥15%' },
            { key: 'type2' as TabKey, emoji: '📈', label: '跟盤型', count: data.type2.length, desc: `斜率 ≥ TAIEX ${data.taiex_slope.toFixed(2)}%` },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                activeTab === tab.key
                  ? 'bg-primary text-white border-primary shadow-[0_2px_12px_rgba(196,30,58,0.3)]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span>{tab.emoji} {tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {tab.count}
              </span>
            </button>
          ))}
          <div className="ml-3 text-xs text-gray-400 self-center">
            {activeTab === 'type1' ? '篩選條件：美股爆賺股供應商 ＋ 台股回檔≥15%' : `篩選條件：台股斜率 ≥ TAIEX ${data.taiex_slope.toFixed(2)}%`}
          </div>
        </div>
      )}

      {/* Type1 Table */}
      {data && activeTab === 'type1' && (
        sortedType1.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-800" onClick={() => handleSort1('twSymbol')}>代碼{si1('twSymbol')}</th>
                  <th className="text-left px-4 py-3">名稱</th>
                  <th className="text-center px-4 py-3 cursor-pointer hover:text-gray-800" onClick={() => handleSort1('usParent')}>美股母公司{si1('usParent')}</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">供應角色</th>
                  <th className="text-right px-4 py-3 cursor-pointer hover:text-gray-800" onClick={() => handleSort1('twSlope')}>台股斜率{si1('twSlope')}</th>
                  <th className="text-right px-4 py-3 cursor-pointer hover:text-gray-800" onClick={() => handleSort1('usSlope')}>美股斜率{si1('usSlope')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedType1.map((r, i) => (
                  <tr key={`${r.twSymbol}-${r.usParent}-${i}`}
                    className={`border-t border-gray-50 hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-3 font-mono font-bold text-gray-900 text-sm">{r.twSymbol}</td>
                    <td className="px-4 py-3 text-gray-900 text-sm font-medium">{r.twName || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700">
                        ⚡ {r.usParent}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell max-w-[160px] truncate">{r.role}</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold text-sm ${slopeColor(r.twSlope)}`}>
                      {r.twSlope >= 0 ? '+' : ''}{r.twSlope.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-emerald-600 font-semibold">
                      +{r.usSlope.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-3">🔍</div>
            <div className="font-medium text-gray-500 mb-1">目前無供應鏈補漲標的</div>
            <div className="text-xs text-gray-400">條件：美股爆賺（QQQ×10）+ 台股同期回檔 ≥ 15%</div>
          </div>
        )
      )}

      {/* Type2 Table */}
      {data && activeTab === 'type2' && (
        sortedType2.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-800" onClick={() => handleSort2('twSymbol')}>代碼{si2('twSymbol')}</th>
                  <th className="text-left px-4 py-3">名稱</th>
                  <th className="text-center px-4 py-3 cursor-pointer hover:text-gray-800" onClick={() => handleSort2('sector')}>產業{si2('sector')}</th>
                  <th className="text-right px-4 py-3 cursor-pointer hover:text-gray-800" onClick={() => handleSort2('twSlope')}>倍數{si2('twSlope')}</th>
                  <th className="text-right px-4 py-3">台股%</th>
                </tr>
              </thead>
              <tbody>
                {sortedType2.map((r, i) => {
                  const relStrength = r.taiexSlope !== 0 ? (r.twSlope / Math.abs(r.taiexSlope)).toFixed(2) : '—';
                  return (
                    <tr key={r.twSymbol}
                      className={`border-t border-gray-50 hover:bg-emerald-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <td className="px-4 py-3 font-mono font-bold text-gray-900 text-sm">{r.twSymbol}</td>
                      <td className="px-4 py-3 text-gray-900 text-sm font-medium">{r.twName || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {r.sector ? (
                          <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 border border-blue-100 text-blue-700">
                            {r.sector}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-sm text-gray-800">
                        {relStrength}×
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold text-sm ${slopeColor(r.twSlope)}`}>
                        {r.twSlope >= 0 ? '+' : ''}{r.twSlope.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-right">
              共 {sortedType2.length} 支 ｜ TAIEX 基準 {data.taiex_slope.toFixed(2)}%
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-3">📊</div>
            <div className="font-medium text-gray-500 mb-1">目前無符合的跟盤股</div>
            <div className="text-xs text-gray-400">條件：台股斜率 ≥ TAIEX {data.taiex_slope.toFixed(2)}%</div>
          </div>
        )
      )}

      {/* Footer */}
      {data && (
        <div className="mt-6 flex items-center justify-between text-xs text-gray-400 pt-4 border-t border-gray-100">
          <span>資料含 1,976 支台股（TWSE + TPEx）</span>
          <span>更新：{new Date(data.data_updated_at).toLocaleString('zh-TW')}</span>
        </div>
      )}
    </div>
  );
}
