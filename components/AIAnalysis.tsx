'use client';

import { useEffect, useState } from 'react';

interface AIAnalysisProps {
  symbol: string;
}

interface AnalysisData {
  analysis: string | null;
  consensus?: {
    targetHigh: number;
    targetLow: number;
    targetConsensus: number;
    targetMedian: number;
  } | null;
}

export default function AIAnalysis({ symbol }: AIAnalysisProps) {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalysis() {
      try {
        const res = await fetch(`/api/ai-analysis/${symbol}`);
        const d = await res.json();
        setData(d);
      } catch {}
      setLoading(false);
    }
    fetchAnalysis();
  }, [symbol]);

  if (loading) {
    return (
      <div className="apple-card p-6 md:p-8 mb-10">
        <h2 className="font-serif text-2xl font-bold mb-4">分析師觀點</h2>
        <div className="flex items-center gap-3 py-8">
          <div className="animate-pulse h-3 bg-white/5 rounded w-full" />
        </div>
        <p className="text-[10px] text-gray-600 text-center">AI 分析生成中...</p>
      </div>
    );
  }

  if (!data?.analysis) return null;

  return (
    <div className="apple-card p-6 md:p-8 mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-2xl font-bold">分析師觀點</h2>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-accent/10 text-accent/70 font-medium">
          AI Generated
        </span>
      </div>

      {/* Analyst Consensus */}
      {data.consensus && (
        <div className="flex items-center gap-4 mb-5 p-3 bg-black/30 rounded-lg">
          <div className="text-center flex-1">
            <p className="text-[10px] text-gray-500 mb-0.5">目標低</p>
            <p className="text-sm font-mono text-primary">${data.consensus.targetLow}</p>
          </div>
          <div className="text-center flex-1 border-x border-white/5 px-4">
            <p className="text-[10px] text-gray-500 mb-0.5">共識目標</p>
            <p className="text-lg font-mono font-bold text-accent glow-gold">${data.consensus.targetConsensus}</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-[10px] text-gray-500 mb-0.5">目標高</p>
            <p className="text-sm font-mono text-accent">${data.consensus.targetHigh}</p>
          </div>
        </div>
      )}

      {/* AI Analysis */}
      <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
        {data.analysis}
      </div>

      <p className="text-[9px] text-gray-700 mt-4">
        由 Gemini AI 生成，基於公開市場數據。僅供參考，非投資建議。
      </p>
    </div>
  );
}
