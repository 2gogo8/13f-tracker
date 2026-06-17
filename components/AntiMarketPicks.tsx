'use client';

import { Suspense, useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface AntiMarketPick {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  dropPct: number;
  peakPrice: number;
  peakDate: string;
  sma130: number;
  revenueGrowth: number;
  profitMargin: number;
  rule40Score: number;
}

interface AntiMarketCheck {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  dropPct: number | null;
  peakPrice: number | null;
  peakDate: string | null;
  declinePass: boolean;
  sma130: number | null;
  sma130Pct: number | null;
  sma130Pass: boolean;
  revenueGrowth: number | null;
  profitMargin: number | null;
  rule40Score: number | null;
  r40Pass: boolean;
  allPass: boolean;
}

type SortField = 'dropPct' | 'rule40Score' | 'sma130pct';

function formatMktCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

const DEFAULT_DATE = '2026-01-20';
const VALID_SORT_FIELDS: SortField[] = ['dropPct', 'rule40Score', 'sma130pct'];

export default function AntiMarketPicks() {
  return (
    <Suspense fallback={<div className="apple-card p-5 md:p-6 mb-8"><h2 className="font-serif text-lg font-bold text-primary glow-red">美股反市場精選</h2><p className="text-[10px] text-gray-600 mt-1">載入中...</p></div>}>
      <AntiMarketPicksInner />
    </Suspense>
  );
}

function AntiMarketPicksInner() {
  const searchParams = useSearchParams();

  const urlSort = searchParams.get('amSort') as SortField | null;
  const urlAsc = searchParams.get('amAsc');
  const urlDate = searchParams.get('amDate');

  // ── Mode ─────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'auto' | 'custom'>('auto');

  // ── Auto scan state ───────────────────────────────────────────────────────
  const [picks, setPicks] = useState<AntiMarketPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>(
    urlSort && VALID_SORT_FIELDS.includes(urlSort) ? urlSort : 'rule40Score'
  );
  const [sortAsc, setSortAsc] = useState(urlAsc === '1');
  const [showAll, setShowAll] = useState(false);
  const [fromDate, setFromDate] = useState(urlDate || DEFAULT_DATE);
  const [pendingDate, setPendingDate] = useState(urlDate || DEFAULT_DATE);
  const INITIAL_COUNT = 10;

  // ── Custom mode (watchlist) state ──────────────────────────────────────────
  const [watchlistResults, setWatchlistResults] = useState<AntiMarketCheck[]>([]);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);
  const [watchlistUpdatedAt, setWatchlistUpdatedAt] = useState('');
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistEmpty, setWatchlistEmpty] = useState(false);

  // ── Thresholds: pending (display) vs committed (fetch) ────────────────────
  const [pendingDeclineMin, setPendingDeclineMin] = useState(0);
  const [pendingDeclineMax, setPendingDeclineMax] = useState(35);
  const [pendingR40Min, setPendingR40Min] = useState(40);
  const [pendingSma130, setPendingSma130] = useState(true);

  const [declineMin, setDeclineMin] = useState(0);
  const [declineMax, setDeclineMax] = useState(35);
  const [r40Min, setR40Min] = useState(40);
  const [sma130Required, setSma130Required] = useState(true);

  const thresholdsChanged =
    pendingDeclineMin !== declineMin ||
    pendingDeclineMax !== declineMax ||
    pendingR40Min !== r40Min ||
    pendingSma130 !== sma130Required;

  const applyThresholds = () => {
    setDeclineMin(pendingDeclineMin);
    setDeclineMax(pendingDeclineMax);
    setR40Min(pendingR40Min);
    setSma130Required(pendingSma130);
  };

  // ── URL persistence ───────────────────────────────────────────────────────
  const updateUrl = useCallback((field: SortField, asc: boolean, date: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set('amSort', field);
    params.set('amAsc', asc ? '1' : '0');
    if (date !== DEFAULT_DATE) params.set('amDate', date);
    else params.delete('amDate');
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, []);

  // ── Auto scan fetch ───────────────────────────────────────────────────────
  const fetchPicks = useCallback(async (
    date: string,
    t: { declineMin: number; declineMax: number; r40Min: number; sma130Required: boolean }
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ fromDate: date });
      if (t.declineMin !== 0) params.set('declineMin', String(t.declineMin));
      if (t.declineMax !== 35) params.set('declineMax', String(t.declineMax));
      if (t.r40Min !== 40) params.set('r40Min', String(t.r40Min));
      if (!t.sma130Required) params.set('sma130Required', 'false');
      const res = await fetch(`/api/anti-market-picks?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) setPicks(data);
    } catch {}
    setLoading(false);
  }, []);

  // ── Watchlist fetch ───────────────────────────────────────────────────────
  const fetchWatchlist = useCallback(async (
    date: string,
    t: { declineMin: number; declineMax: number; r40Min: number; sma130Required: boolean }
  ) => {
    setWatchlistLoading(true);
    setWatchlistEmpty(false);
    try {
      const params = new URLSearchParams({ fromDate: date, mode: 'watchlist' });
      if (t.declineMin !== 0) params.set('declineMin', String(t.declineMin));
      if (t.declineMax !== 35) params.set('declineMax', String(t.declineMax));
      if (t.r40Min !== 40) params.set('r40Min', String(t.r40Min));
      if (!t.sma130Required) params.set('sma130Required', 'false');
      const res = await fetch(`/api/anti-market-picks?${params.toString()}`);
      const data = await res.json();
      if (data?.empty) {
        setWatchlistEmpty(true);
        setWatchlistResults([]);
        setWatchlistSymbols([]);
      } else if (Array.isArray(data?.watchlist)) {
        setWatchlistResults(data.watchlist);
        setWatchlistSymbols(data.symbols || []);
        setWatchlistUpdatedAt(data.updatedAt || '');
      }
    } catch {}
    setWatchlistLoading(false);
  }, []);

  useEffect(() => {
    if (mode === 'auto') {
      fetchPicks(fromDate, { declineMin, declineMax, r40Min, sma130Required });
    } else if (mode === 'custom') {
      fetchWatchlist(fromDate, { declineMin, declineMax, r40Min, sma130Required });
    }
  }, [fromDate, declineMin, declineMax, r40Min, sma130Required, mode, fetchPicks, fetchWatchlist]);

  // ── Date change ───────────────────────────────────────────────────────────
  const handleDateChange = () => {
    if (pendingDate && pendingDate !== fromDate) {
      setFromDate(pendingDate);
      setShowAll(false);
      updateUrl(sortField, sortAsc, pendingDate);
    }
  };

  // ── Watchlist refresh ─────────────────────────────────────────────────────
  const handleRefreshWatchlist = () => {
    fetchWatchlist(fromDate, {
      declineMin: pendingDeclineMin,
      declineMax: pendingDeclineMax,
      r40Min: pendingR40Min,
      sma130Required: pendingSma130,
    });
  };

  // ── Sorting (auto mode) ───────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...picks];
    arr.sort((a, b) => {
      let va: number, vb: number;
      if (sortField === 'sma130pct') {
        va = a.price / a.sma130;
        vb = b.price / b.sma130;
      } else {
        va = a[sortField as keyof AntiMarketPick] as number;
        vb = b[sortField as keyof AntiMarketPick] as number;
      }
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [picks, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    const newAsc = sortField === field ? !sortAsc : false;
    setSortField(field);
    setSortAsc(newAsc);
    updateUrl(field, newAsc, fromDate);
  };

  const displayed = showAll ? sorted : sorted.slice(0, INITIAL_COUNT);

  // ── Sorting (custom/watchlist mode): allPass first, then pass count, then R40
  const sortedCustom = useMemo(() => {
    return [...watchlistResults].sort((a, b) => {
      if (a.allPass !== b.allPass) return a.allPass ? -1 : 1;
      const pcA = [a.declinePass, a.sma130Pass, a.r40Pass].filter(Boolean).length;
      const pcB = [b.declinePass, b.sma130Pass, b.r40Pass].filter(Boolean).length;
      if (pcA !== pcB) return pcB - pcA;
      return (b.rule40Score ?? 0) - (a.rule40Score ?? 0);
    });
  }, [watchlistResults]);

  const passCount = watchlistResults.filter(r => r.allPass).length;

  // ── Sort header component ─────────────────────────────────────────────────
  const SortHeader = ({ field, label, width }: { field: SortField; label: string; width?: string }) => {
    const isActive = sortField === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className={`${width || 'w-14'} text-right text-[9px] uppercase tracking-wider transition-colors ${
          isActive ? 'text-accent font-bold' : 'text-gray-600 hover:text-gray-500'
        }`}
      >
        {label}
        {isActive && <span className="ml-0.5">{sortAsc ? '↑' : '↓'}</span>}
      </button>
    );
  };

  return (
    <div className="apple-card p-5 md:p-6 mb-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-lg font-bold">
          <span className="text-primary glow-red">美股反</span>
          <span className="text-gray-900">市場精選</span>
        </h2>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-primary/20 text-primary font-medium tracking-wider uppercase">
          Contrarian
        </span>
      </div>

      {/* ── Mode Toggle ────────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 mb-4">
        <button
          onClick={() => { setMode('auto'); }}
          className={`text-[10px] px-3 py-1.5 rounded-full font-medium transition-colors ${
            mode === 'auto'
              ? 'bg-primary text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          自動掃描
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`text-[10px] px-3 py-1.5 rounded-full font-medium transition-colors ${
            mode === 'custom'
              ? 'bg-primary text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          自選名單
        </button>
      </div>

      {/* ── Date Picker ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
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
            {mode === 'auto' ? '掃描' : '更新'}
          </button>
        )}
        {fromDate !== DEFAULT_DATE && (
          <button
            onClick={() => {
              setPendingDate(DEFAULT_DATE);
              setFromDate(DEFAULT_DATE);
              updateUrl(sortField, sortAsc, DEFAULT_DATE);
            }}
            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            重置
          </button>
        )}
      </div>

      {/* ── Custom Mode: Watchlist info bar ─────────────────────────────────── */}
      {mode === 'custom' && (
        <div className="flex items-center gap-3 mb-4">
          {watchlistLoading ? (
            <>
              <div className="inline-block w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-[10px] text-gray-400">驗證中...</span>
            </>
          ) : watchlistEmpty ? (
            <span className="text-[10px] text-gray-400">名單尚未設定，請透過 JGClaw 更新</span>
          ) : watchlistResults.length > 0 ? (
            <>
              <span className="text-[10px] text-gray-500">
                共 <span className="font-semibold text-gray-700">{watchlistSymbols.length}</span> 檔・
                <span className="font-semibold text-green-600">{passCount}</span> 檔全過
                {watchlistUpdatedAt && (
                  <span className="text-gray-400 ml-1">・更新 {watchlistUpdatedAt}</span>
                )}
              </span>
              <button
                onClick={handleRefreshWatchlist}
                className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                ↺ 重新驗證
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* ── Auto Mode: description ─────────────────────────────────────────── */}
      {mode === 'auto' && (
        <p className="text-[10px] text-gray-600 mb-4">
          連續下跌 {declineMin}-{declineMax}%（自 {fromDate} 起）
          + R40 ≥ {r40Min}
          {sma130Required ? ' + 股價 > SMA130' : ''}
          {!loading && ` ・共 ${picks.length} 檔命中`}
        </p>
      )}

      {/* ── Auto Mode: Results ─────────────────────────────────────────────── */}
      {mode === 'auto' && (
        <>
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-[10px] text-gray-500 mt-2">掃描中（約 30 秒）...</p>
            </div>
          ) : picks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">目前無交叉命中的標的</p>
              <p className="text-[10px] text-gray-600 mt-1">當好公司跟著大盤被錯殺時，這裡會出現機會</p>
            </div>
          ) : (
            <>
              <div className="flex items-center px-2 pb-2">
                <span className="flex-1 text-[9px] text-gray-600 uppercase tracking-wider">股票</span>
                <SortHeader field="dropPct" label="跌幅" />
                <SortHeader field="rule40Score" label="R40" />
                <SortHeader field="sma130pct" label="SMA130" width="w-16" />
              </div>
              <div className="divide-y divide-accent/[0.15]">
                {displayed.map((stock) => {
                  const sma130pct = (stock.price / stock.sma130 - 1) * 100;
                  return (
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
                      <span className={`w-14 text-right text-xs font-mono font-semibold ${
                        stock.dropPct >= 25 ? 'text-primary font-bold' :
                        stock.dropPct >= 15 ? 'text-red-400' : 'text-gray-500'
                      }`}>
                        -{stock.dropPct}%
                      </span>
                      <span className={`w-14 text-right text-xs font-mono font-bold ${
                        stock.rule40Score >= 60 ? 'text-green-500' :
                        stock.rule40Score >= 50 ? 'text-blue-400' : 'text-accent'
                      }`}>
                        {stock.rule40Score.toFixed(0)}
                      </span>
                      <span className={`w-16 text-right text-[10px] font-mono ${
                        sma130pct >= 10 ? 'text-green-500' : 'text-gray-500'
                      }`}>
                        +{sma130pct.toFixed(1)}%
                      </span>
                    </Link>
                  );
                })}
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
        </>
      )}

      {/* ── Custom Mode: Results ───────────────────────────────────────────── */}
      {mode === 'custom' && !watchlistLoading && watchlistResults.length > 0 && (
        <div>
          {/* Header row */}
          <div className="flex items-center px-2 pb-2 border-b border-gray-100">
            <span className="flex-1 text-[9px] text-gray-600 uppercase tracking-wider">股票</span>
            <span className="w-20 text-right text-[9px] text-gray-600 uppercase">跌幅</span>
            <span className="w-16 text-right text-[9px] text-gray-600 uppercase">R40</span>
            <span className="w-20 text-right text-[9px] text-gray-600 uppercase">SMA130</span>
            <span className="w-8 text-center text-[9px] text-gray-600 uppercase">全</span>
          </div>
          <div className="divide-y divide-accent/[0.15]">
            {sortedCustom.map((stock) => (
              <Link
                key={stock.symbol}
                href={`/stock/${stock.symbol}`}
                className="flex items-center py-3 px-2 rounded hover:bg-gray-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-serif text-sm font-bold ${stock.allPass ? 'text-accent' : 'text-gray-400'}`}>
                      {stock.symbol}
                    </span>
                    <span className="text-[9px] text-gray-500 truncate">{stock.name}</span>
                  </div>
                  {stock.price > 0 && (
                    <div className="text-[9px] text-gray-600 mt-0.5">
                      ${stock.price.toFixed(2)}
                      {stock.marketCap > 0 ? `・${formatMktCap(stock.marketCap)}` : ''}
                      {stock.peakDate ? `・高點 ${stock.peakDate}` : ''}
                    </div>
                  )}
                </div>
                {/* Decline */}
                <div className="w-20 flex items-center justify-end gap-0.5">
                  <span className="text-[10px] font-mono text-gray-600">
                    {stock.dropPct !== null ? `-${stock.dropPct}%` : '—'}
                  </span>
                  <span className="text-[10px] ml-0.5">{stock.declinePass ? '✅' : '❌'}</span>
                </div>
                {/* R40 */}
                <div className="w-16 flex items-center justify-end gap-0.5">
                  <span className="text-[10px] font-mono text-gray-600">
                    {stock.rule40Score !== null ? stock.rule40Score.toFixed(0) : '—'}
                  </span>
                  <span className="text-[10px] ml-0.5">{stock.r40Pass ? '✅' : '❌'}</span>
                </div>
                {/* SMA130 */}
                <div className="w-20 flex items-center justify-end gap-0.5">
                  <span className="text-[10px] font-mono text-gray-600">
                    {stock.sma130Pct !== null
                      ? `${stock.sma130Pct >= 0 ? '+' : ''}${stock.sma130Pct.toFixed(1)}%`
                      : '—'}
                  </span>
                  <span className="text-[10px] ml-0.5">{stock.sma130Pass ? '✅' : '❌'}</span>
                </div>
                {/* Overall */}
                <div className="w-8 text-center">
                  <span className="text-sm">{stock.allPass ? '🟢' : '🔴'}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="text-[9px] text-gray-500 mt-3 text-center">
        跌幅 = 自高點連續下跌% | R40 = 營收成長率+利潤率 | SMA130 = 現價相對130日均線% | 僅供參考
      </p>

      {/* ── Thresholds (bottom, hidden in screenshots) ─────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-3 border-t border-gray-100 px-1">
        {/* Decline range */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">跌幅</span>
          <input
            type="number" value={pendingDeclineMin} min={0} max={pendingDeclineMax - 1}
            onChange={(e) => setPendingDeclineMin(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-12 text-[10px] px-1.5 py-1 rounded border border-gray-200 bg-white text-center focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
          <span className="text-[10px] text-gray-300">%~</span>
          <input
            type="number" value={pendingDeclineMax} min={pendingDeclineMin + 1} max={99}
            onChange={(e) => setPendingDeclineMax(Math.min(99, parseInt(e.target.value) || 35))}
            className="w-12 text-[10px] px-1.5 py-1 rounded border border-gray-200 bg-white text-center focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
          <span className="text-[10px] text-gray-300">%</span>
        </div>
        {/* R40 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">R40≥</span>
          <input
            type="number" value={pendingR40Min} min={0}
            onChange={(e) => setPendingR40Min(parseInt(e.target.value) || 0)}
            className="w-14 text-[10px] px-1.5 py-1 rounded border border-gray-200 bg-white text-center focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
        {/* SMA130 */}
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox" id="sma130cb" checked={pendingSma130}
            onChange={(e) => setPendingSma130(e.target.checked)}
            className="rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
          />
          <label htmlFor="sma130cb" className="text-[10px] text-gray-400 cursor-pointer select-none">
            股價 &gt; SMA130
          </label>
        </div>
        {/* Apply button */}
        {mode === 'auto' && thresholdsChanged && (
          <button
            onClick={applyThresholds}
            className="text-[10px] px-2.5 py-1 rounded-md bg-accent/80 text-white font-medium hover:bg-accent transition-colors"
          >
            套用 ↺
          </button>
        )}
      </div>
    </div>
  );
}
