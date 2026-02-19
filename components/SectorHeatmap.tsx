'use client';

import { useEffect, useState } from 'react';

interface SectorData {
  sector: string;
  etf: string;
  change10d: number;
  prices: number[];
}

function getColor(pct: number): string {
  if (pct > 4) return '#15803d';
  if (pct > 2) return '#16a34a';
  if (pct > 1) return '#22c55e';
  if (pct > 0.3) return '#4ade80';
  if (pct > -0.3) return '#d1d5db';
  if (pct > -1) return '#f87171';
  if (pct > -2) return '#ef4444';
  if (pct > -4) return '#dc2626';
  return '#991b1b';
}

function getTextColor(pct: number): string {
  if (Math.abs(pct) < 0.3) return '#374151';
  return '#fff';
}

// Mini sparkline SVG
function Sparkline({ prices, color }: { prices: number[]; color: string }) {
  if (prices.length < 2) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 48, h = 16;
  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w;
    const y = h - ((p - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className="opacity-50">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export default function SectorHeatmap() {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSectors() {
      try {
        const res = await fetch('/api/sector-performance-10d');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setSectors(data);
        }
      } catch {}
      setLoading(false);
    }
    fetchSectors();
  }, []);

  if (loading) {
    return (
      <div className="apple-card p-5 md:p-6">
        <h2 className="font-serif text-lg font-bold text-gray-900">產業板塊 10 日表現</h2>
        <p className="text-[10px] text-gray-500 mt-1">載入中...</p>
      </div>
    );
  }

  if (sectors.length === 0) return null;

  return (
    <div className="apple-card p-5 md:p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-serif text-lg font-bold text-gray-900">產業板塊 10 日表現</h2>
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
          近 10 個交易日
        </span>
      </div>
      <p className="text-[10px] text-gray-500 mb-4">
        以板塊 ETF 計算 | 含走勢線
      </p>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {sectors.map((sector) => {
          const bg = getColor(sector.change10d);
          const textCol = getTextColor(sector.change10d);
          const sparkColor = sector.change10d >= 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)';
          const isNeutral = Math.abs(sector.change10d) < 0.3;

          return (
            <div
              key={sector.sector}
              className="rounded-lg flex flex-col items-center justify-center text-center py-3 px-1 transition-all hover:scale-[1.03] cursor-default relative overflow-hidden"
              style={{ backgroundColor: bg, color: textCol }}
              title={`${sector.sector} (${sector.etf}): ${sector.change10d > 0 ? '+' : ''}${sector.change10d}%`}
            >
              <span className="font-bold text-[12px] leading-tight">{sector.sector}</span>
              <span className="font-mono font-bold text-sm mt-0.5">
                {sector.change10d > 0 ? '+' : ''}{sector.change10d.toFixed(1)}%
              </span>
              <div className="mt-1">
                <Sparkline prices={sector.prices} color={isNeutral ? '#6b7280' : sparkColor} />
              </div>
              <span className="text-[8px] opacity-50 mt-0.5">{sector.etf}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
