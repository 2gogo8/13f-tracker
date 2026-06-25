'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────────────

interface PullbackStock {
  symbol: string;
  name: string;
  currentDrawdownPct: number;
  segmentHigh: number;
  segmentHighDate: string;
  segmentLow: number;
  segmentLowDate: string;
  maxDrawdownPct: number;
  reboundPctFromLow: number;
  close: number;
}

interface ScanResult {
  date: string;
  totalScanned: number;
  buckets: {
    b15_20: PullbackStock[];
    b20_25: PullbackStock[];
    b25_30: PullbackStock[];
    b30_35: PullbackStock[];
    b35_40: PullbackStock[];
  };
}

interface PricePoint { date: string; close: number; }

interface PullbackSegment {
  segmentHigh: number;
  segmentHighDate: string;
  segmentLow: number;
  segmentLowDate: string;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  reboundPctFromLow: number;
  daysInPullback: number;
}

interface DetailResult {
  symbol: string;
  name: string;
  prices: PricePoint[];
  pullback: PullbackSegment;
}

// ── SVG Mini Line Chart ────────────────────────────────────────────────────

function MiniChart({ detail }: { detail: DetailResult }) {
  const { prices, pullback } = detail;
  if (prices.length === 0) return null;

  const W = 600;
  const H = 200;
  const PAD = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const closes = prices.map((p) => p.close);
  const minClose = Math.min(...closes) * 0.98;
  const maxClose = Math.max(...closes) * 1.02;
  const range = maxClose - minClose || 1;

  const xScale = (i: number) => PAD.left + (i / (prices.length - 1)) * chartW;
  const yScale = (v: number) => PAD.top + chartH - ((v - minClose) / range) * chartH;

  const pathD = prices
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(p.close).toFixed(1)}`)
    .join(' ');

  // Find indices for markers
  const highIdx = prices.findIndex((p) => p.date === pullback.segmentHighDate);
  const lowIdx = prices.findIndex((p) => p.date === pullback.segmentLowDate);
  const lastIdx = prices.length - 1;

  const markers = [
    highIdx >= 0 ? { i: highIdx, v: prices[highIdx].close, label: `高 ${prices[highIdx].close}`, color: '#16a34a', dy: -12 } : null,
    lowIdx >= 0 ? { i: lowIdx, v: prices[lowIdx].close, label: `低 ${prices[lowIdx].close}`, color: '#C41E3A', dy: 18 } : null,
    { i: lastIdx, v: prices[lastIdx].close, label: `今 ${prices[lastIdx].close}`, color: '#D4AF37', dy: -12 },
  ].filter(Boolean) as { i: number; v: number; label: string; color: string; dy: number }[];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-lg bg-gray-950/5 border border-gray-200"
      style={{ maxHeight: 220 }}
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = PAD.top + chartH * (1 - t);
        const val = (minClose + range * t).toFixed(0);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#e5e7eb" strokeWidth={0.5} />
            <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">{val}</text>
          </g>
        );
      })}

      {/* Close line */}
      <path d={pathD} fill="none" stroke="#1e40af" strokeWidth={1.5} strokeLinejoin="round" />

      {/* Segment high zone */}
      {highIdx >= 0 && (
        <line
          x1={xScale(highIdx)} y1={PAD.top}
          x2={xScale(highIdx)} y2={PAD.top + chartH}
          stroke="#16a34a" strokeWidth={1} strokeDasharray="4,3" opacity={0.6}
        />
      )}

      {/* Segment low zone */}
      {lowIdx >= 0 && (
        <line
          x1={xScale(lowIdx)} y1={PAD.top}
          x2={xScale(lowIdx)} y2={PAD.top + chartH}
          stroke="#C41E3A" strokeWidth={1} strokeDasharray="4,3" opacity={0.6}
        />
      )}

      {/* Markers */}
      {markers.map((m, mi) => (
        <g key={mi}>
          <circle cx={xScale(m.i)} cy={yScale(m.v)} r={4} fill={m.color} />
          <text
            x={xScale(m.i)}
            y={yScale(m.v) + m.dy}
            textAnchor="middle"
            fontSize={9}
            fill={m.color}
            fontWeight="600"
          >
            {m.label}
          </text>
        </g>
      ))}

      {/* X axis labels */}
      {[0, Math.floor(prices.length / 2), prices.length - 1].map((i) => (
        <text key={i} x={xScale(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="#9ca3af">
          {prices[i]?.date?.slice(2) ?? ''}
        </text>
      ))}
    </svg>
  );
}

// ── Stock Row ──────────────────────────────────────────────────────────────

function StockRow({
  stock,
  selected,
  onSelect,
  detail,
  detailLoading,
}: {
  stock: PullbackStock;
  selected: boolean;
  onSelect: () => void;
  detail: DetailResult | null;
  detailLoading: boolean;
}) {
  const ddColor =
    stock.currentDrawdownPct < 20
      ? 'text-yellow-600'
      : stock.currentDrawdownPct < 30
      ? 'text-orange-500'
      : 'text-red-600';

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={onSelect}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
      >
        {/* Symbol + Name */}
        <div className="flex-1 min-w-0">
          <span className="font-mono text-sm font-semibold text-gray-900">{stock.symbol}</span>
          <span className="ml-2 text-xs text-gray-500 truncate">{stock.name}</span>
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-4 flex-shrink-0 text-right">
          <div>
            <div className={`text-sm font-bold tabular-nums ${ddColor}`}>
              -{stock.currentDrawdownPct.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-400">現回檔</div>
          </div>
          <div className="hidden sm:block">
            <div className="text-sm tabular-nums text-gray-700">{stock.close}</div>
            <div className="text-xs text-gray-400">現價</div>
          </div>
          <div className="hidden md:block">
            <div className="text-sm tabular-nums text-gray-500">{stock.reboundPctFromLow.toFixed(0)}%</div>
            <div className="text-xs text-gray-400">反彈幅</div>
          </div>
          <div className="hidden lg:block">
            <div className="text-sm tabular-nums text-gray-500">↑{stock.segmentHigh}</div>
            <div className="text-xs text-gray-400">{stock.segmentHighDate?.slice(0, 10)}</div>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${selected ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Detail Panel */}
      {selected && (
        <div className="px-4 pb-4 bg-gray-50/60">
          {detailLoading && (
            <div className="py-6 text-center text-sm text-gray-400 animate-pulse">載入圖表中…</div>
          )}
          {!detailLoading && detail && (
            <div>
              <div className="flex flex-wrap gap-4 mb-3 pt-3 text-xs text-gray-600">
                <span>段高 <strong>{detail.pullback.segmentHigh}</strong> ({detail.pullback.segmentHighDate?.slice(0,10)})</span>
                <span>段低 <strong>{detail.pullback.segmentLow}</strong> ({detail.pullback.segmentLowDate?.slice(0,10)})</span>
                <span>最大回檔 <strong className="text-red-600">{detail.pullback.maxDrawdownPct.toFixed(1)}%</strong></span>
                <span>反彈幅 <strong>{detail.pullback.reboundPctFromLow.toFixed(1)}%</strong></span>
                <span>回檔天數 <strong>{detail.pullback.daysInPullback}</strong> 天</span>
              </div>
              <MiniChart detail={detail} />
            </div>
          )}
          {!detailLoading && !detail && (
            <div className="py-4 text-center text-sm text-red-400">載入失敗</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bucket Section ─────────────────────────────────────────────────────────

const BUCKET_LABELS: Record<string, string> = {
  b15_20: '15% – 20% 回檔',
  b20_25: '20% – 25% 回檔',
  b25_30: '25% – 30% 回檔',
  b30_35: '30% – 35% 回檔',
  b35_40: '35% – 40% 回檔',
};

const BUCKET_COLORS: Record<string, string> = {
  b15_20: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  b20_25: 'bg-orange-50 border-orange-200 text-orange-700',
  b25_30: 'bg-red-50 border-red-200 text-red-700',
  b30_35: 'bg-rose-50 border-rose-200 text-rose-700',
  b35_40: 'bg-purple-50 border-purple-200 text-purple-700',
};

function BucketSection({
  bucketKey,
  stocks,
  selectedSymbol,
  onSelect,
  detailMap,
  loadingSet,
}: {
  bucketKey: string;
  stocks: PullbackStock[];
  selectedSymbol: string | null;
  onSelect: (sym: string | null) => void;
  detailMap: Record<string, DetailResult>;
  loadingSet: Set<string>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const count = stocks.length;
  const colorClass = BUCKET_COLORS[bucketKey] || '';

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden mb-4 bg-white shadow-sm">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={`w-full flex items-center justify-between px-4 py-3 border-b ${colorClass}`}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{BUCKET_LABELS[bucketKey]}</span>
          <span className="text-xs opacity-75">({count} 檔)</span>
        </div>
        <svg
          className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Stock List */}
      {!collapsed && (
        <div>
          {count === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">此區間無股票</div>
          ) : (
            stocks.map((stock) => (
              <StockRow
                key={stock.symbol}
                stock={stock}
                selected={selectedSymbol === stock.symbol}
                onSelect={() => onSelect(selectedSymbol === stock.symbol ? null : stock.symbol)}
                detail={detailMap[stock.symbol] ?? null}
                detailLoading={loadingSet.has(stock.symbol)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function TempRidingwavePage() {
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [detailMap, setDetailMap] = useState<Record<string, DetailResult>>({});
  const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set());

  // Fetch scan data
  useEffect(() => {
    fetch('/api/tw-pullback-scanner')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Fetch detail when a stock is selected
  const handleSelect = useCallback(
    (sym: string | null) => {
      setSelectedSymbol(sym);
      if (!sym || detailMap[sym] || loadingSet.has(sym)) return;

      setLoadingSet((prev) => new Set([...prev, sym]));
      fetch(`/api/tw-pullback-scanner/detail?symbol=${sym}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.error) {
            setDetailMap((prev) => ({ ...prev, [sym]: d }));
          }
        })
        .catch(() => {/* ignore */})
        .finally(() => {
          setLoadingSet((prev) => {
            const next = new Set(prev);
            next.delete(sym);
            return next;
          });
        });
    },
    [detailMap, loadingSet]
  );

  const totalInBuckets = data
    ? Object.values(data.buckets).reduce((s, arr) => s + arr.length, 0)
    : 0;

  return (
    <div className="min-h-screen py-10 px-4 md:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href="/" className="text-accent hover:text-accent/80 text-sm font-light tracking-wide mb-4 inline-block">
            ← 返回總覽
          </Link>
          <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight">
            <span className="text-primary">JG說真的</span>{' '}
            <span className="text-gray-900">臨時破浪儀表板</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1 font-light tracking-wide">
            台股有效連續回檔統計 · 嚴格場景（40% 反彈重置）· 資料來源：MongoDB tw_stock
          </p>
        </div>

        {/* Stats Bar */}
        {data && (
          <div className="flex flex-wrap gap-4 mb-6 text-sm">
            <div className="bg-white rounded-lg px-4 py-2 shadow-sm border border-gray-100">
              <span className="text-gray-500">資料日期：</span>
              <strong className="text-gray-900">{data.date}</strong>
            </div>
            <div className="bg-white rounded-lg px-4 py-2 shadow-sm border border-gray-100">
              <span className="text-gray-500">掃描股數：</span>
              <strong className="text-gray-900">{data.totalScanned.toLocaleString()}</strong>
            </div>
            <div className="bg-white rounded-lg px-4 py-2 shadow-sm border border-gray-100">
              <span className="text-gray-500">15–40% 回檔：</span>
              <strong className="text-primary">{totalInBuckets}</strong> 檔
            </div>
          </div>
        )}

        {/* Bucket Tables */}
        {loading && (
          <div className="text-center py-16 text-gray-400 animate-pulse">掃描中，請稍候…</div>
        )}

        {error && (
          <div className="text-center py-8 text-red-500 bg-red-50 rounded-lg border border-red-100">
            載入失敗：{error}
          </div>
        )}

        {data && (
          <>
            {(['b15_20', 'b20_25', 'b25_30', 'b30_35', 'b35_40'] as const).map((key) => (
              <BucketSection
                key={key}
                bucketKey={key}
                stocks={data.buckets[key]}
                selectedSymbol={selectedSymbol}
                onSelect={handleSelect}
                detailMap={detailMap}
                loadingSet={loadingSet}
              />
            ))}
          </>
        )}

        {/* Footer */}
        <div className="mt-8 text-xs text-gray-400 text-center">
          演算法：JG 回檔狀態機 · 反彈 ≥ 40% 重置段 · 查 250 交易日 · 本頁僅供研究參考
        </div>
      </div>
    </div>
  );
}
