'use client';

import { useEffect, useState } from 'react';

interface SectorData {
  sector: string;
  changesPercentage: number;
}

const SECTOR_NAMES: Record<string, string> = {
  'Technology': '科技',
  'Healthcare': '醫療',
  'Financial Services': '金融',
  'Consumer Cyclical': '消費週期',
  'Communication Services': '通訊',
  'Industrials': '工業',
  'Consumer Defensive': '必需消費',
  'Energy': '能源',
  'Real Estate': '地產',
  'Utilities': '公用事業',
  'Basic Materials': '原物料',
};

function getColor(pct: number): string {
  if (pct > 2) return '#16a34a';    // deep green
  if (pct > 1) return '#22c55e';    // green
  if (pct > 0.3) return '#4ade80';  // light green
  if (pct > -0.3) return '#9ca3af'; // gray
  if (pct > -1) return '#f87171';   // light red
  if (pct > -2) return '#ef4444';   // red
  return '#C41E3A';                  // deep red (Cartier)
}

function getTextColor(pct: number): string {
  if (Math.abs(pct) > 1) return '#fff';
  return pct > -0.3 ? '#1f2937' : '#fff';
}

export default function SectorHeatmap() {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    async function fetchSectors() {
      try {
        const res = await fetch('/api/sector-performance');
        const data = await res.json();
        if (data.sectors && Array.isArray(data.sectors)) {
          setSectors(data.sectors.filter((s: SectorData) => s.sector && s.changesPercentage !== undefined));
          setIsLive(data.isLive !== false);
        }
      } catch {}
      setLoading(false);
    }
    fetchSectors();
  }, []);

  if (loading) {
    return (
      <div className="apple-card p-6">
        <h2 className="font-serif text-lg font-bold text-gray-900">產業板塊漲跌圖</h2>
        <p className="text-[10px] text-gray-500 mt-1">載入中...</p>
      </div>
    );
  }

  if (sectors.length === 0) return null;

  // Sort by absolute change for layout (biggest movers = biggest tiles)
  const sorted = [...sectors].sort((a, b) => Math.abs(b.changesPercentage) - Math.abs(a.changesPercentage));

  // Calculate tile sizes: bigger absolute change = bigger tile
  const maxAbs = Math.max(...sorted.map(s => Math.abs(s.changesPercentage)), 0.5);

  return (
    <div className="apple-card p-5 md:p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-serif text-lg font-bold text-gray-900">產業板塊漲跌圖</h2>
        {!isLive && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
            上個交易日數據
          </span>
        )}
      </div>
      <p className="text-[10px] text-gray-500 mb-4">
        即時產業板塊表現 | 面積 = 波動幅度
      </p>

      {/* Treemap-style grid */}
      <div className="grid grid-cols-4 gap-1.5 auto-rows-auto">
        {sorted.map((sector, idx) => {
          const pct = sector.changesPercentage;
          const bg = getColor(pct);
          const textCol = getTextColor(pct);
          const zhName = SECTOR_NAMES[sector.sector] || sector.sector;
          // First 4 sectors get 2-col span if they're big movers
          const isLarge = idx < 3 && Math.abs(pct) > 0.5;

          return (
            <div
              key={sector.sector}
              className={`rounded-lg flex flex-col items-center justify-center text-center transition-all hover:scale-[1.02] cursor-default ${
                isLarge ? 'col-span-2 py-5' : 'py-3'
              }`}
              style={{ backgroundColor: bg, color: textCol }}
            >
              <span className={`font-bold ${isLarge ? 'text-sm' : 'text-[11px]'} leading-tight`}>
                {zhName}
              </span>
              <span className={`font-mono font-bold ${isLarge ? 'text-lg' : 'text-xs'} mt-0.5`}>
                {pct > 0 ? '+' : ''}{pct.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
