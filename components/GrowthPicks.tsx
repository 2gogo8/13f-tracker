'use client';

import Link from 'next/link';

// Curated high-growth picks: stocks with analyst consensus YoY revenue growth 40%+
// Updated manually based on FMP analyst estimates data
const GROWTH_PICKS = [
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    sector: 'AI 晶片',
    fy2026Rev: '$2,134億',
    fy2027Rev: '$3,302億',
    yoyGrowth: 54.7,
    analysts: 45,
    catalyst: 'Blackwell 全面出貨、資料中心 AI 需求爆發',
    confidence: 'high' as const,
  },
  {
    symbol: 'AVGO',
    name: 'Broadcom Inc.',
    sector: 'AI ASIC / 基礎設施',
    fy2026Rev: '$639億',
    fy2027Rev: '$1,390億',
    yoyGrowth: 45.2,
    analysts: 47,
    catalyst: 'Google TPU / Meta MTIA 定製晶片 + VMware 訂閱轉型',
    confidence: 'high' as const,
  },
  {
    symbol: 'SMCI',
    name: 'Super Micro Computer',
    sector: 'AI 伺服器',
    fy2026Rev: '$220億',
    fy2027Rev: '$556億',
    yoyGrowth: 52.0,
    analysts: 18,
    catalyst: 'AI 伺服器出貨量暴增、液冷技術領先',
    confidence: 'medium' as const,
  },
  {
    symbol: 'PLTR',
    name: 'Palantir Technologies',
    sector: 'AI 軟體平台',
    fy2026Rev: '$44.8億',
    fy2027Rev: '$101億',
    yoyGrowth: 42.0,
    analysts: 20,
    catalyst: 'AIP 平台政府+商業雙引擎、美國國防 AI 標準化',
    confidence: 'medium' as const,
  },
];

const confidenceConfig = {
  high: { label: '高確信', color: 'text-green-400', bg: 'bg-green-900/30' },
  medium: { label: '中確信', color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
};

export default function GrowthPicks() {
  return (
    <div className="apple-card p-5 md:p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-serif text-lg font-bold text-accent glow-gold">
            高成長精選
          </h2>
          <p className="text-[10px] text-gray-600 mt-0.5">
            分析師共識：2026→2027 營收 YoY ≥ 40%
          </p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-green-900/30 text-green-400 font-medium tracking-wider uppercase">
          Growth 40%+
        </span>
      </div>

      <div className="divide-y divide-accent/[0.15]">
        {GROWTH_PICKS.map((stock) => {
          const conf = confidenceConfig[stock.confidence];
          return (
            <Link
              key={stock.symbol}
              href={`/stock/${stock.symbol}`}
              className="block py-3.5 px-2 rounded transition-all active:bg-primary/10 hover:bg-white/[0.02] group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-serif text-base font-bold text-accent">{stock.symbol}</span>
                  <span className="text-[10px] text-gray-500">{stock.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${conf.bg} ${conf.color}`}>
                    {conf.label}
                  </span>
                  <span className="text-sm font-mono font-bold text-green-400">
                    +{stock.yoyGrowth.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>{stock.sector}</span>
                <span>{stock.fy2026Rev} → {stock.fy2027Rev}</span>
              </div>
              <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">
                {stock.catalyst}（{stock.analysts} 位分析師覆蓋）
              </p>
            </Link>
          );
        })}
      </div>

      <p className="text-[9px] text-gray-700 mt-3 text-center">
        基於分析師共識預估，僅供參考，非投資建議
      </p>
    </div>
  );
}
