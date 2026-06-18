'use client';

import AntiMarketPicks from '@/components/AntiMarketPicks';
import SlopeScanner from '@/components/SlopeScanner';
import TWSlopeScanner from '@/components/TWSlopeScanner';
import SectorHeatmap from '@/components/SectorHeatmap';
import TwAntiMarketPicks from '@/components/TwAntiMarketPicks';
import AnalystOverview from '@/components/AnalystOverview';

export default function ViewPage() {
  return (
    <div className="min-h-screen py-20 px-4 md:px-8">
      {/* Header — same as main page */}
      <header className="mb-16 text-center">
        <h1 className="font-serif text-5xl md:text-7xl font-bold mb-6 tracking-tight leading-tight">
          <span className="gradient-text">JG</span>
          <span className="text-gray-900 glow-white">的</span>
          <span className="text-primary glow-red">反</span>
          <span className="text-gray-900 glow-white">市場報告書</span>
        </h1>
        <div className="gradient-line mb-8"></div>
        <p className="text-gray-400 font-light text-lg tracking-[0.2em] uppercase">
          美股機構持倉戰情儀表板
        </p>
      </header>

      <div className="max-w-7xl mx-auto">
        {/* Anti-Market Picks — public mode (no controls) */}
        <AntiMarketPicks publicMode={true} />

        {/* Slope Scanner */}
        <SlopeScanner />
        <TWSlopeScanner />

        {/* Sector Heatmap */}
        <SectorHeatmap />

        {/* Taiwan Anti-Market Picks */}
        <TwAntiMarketPicks />

        {/* Analyst Overview */}
        <AnalystOverview />
      </div>
    </div>
  );
}
