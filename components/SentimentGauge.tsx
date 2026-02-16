'use client';

import { useEffect, useState } from 'react';

interface Signal {
  name: string;
  score: number;
  label: string;
}

interface SentimentData {
  overall: number;
  label: string;
  emoji: string;
  signals: Signal[];
}

export default function SentimentGauge() {
  const [data, setData] = useState<SentimentData | null>(null);

  useEffect(() => {
    fetch('/api/market-sentiment')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {});
  }, []);

  if (!data) return null;

  const { overall, label, emoji, signals } = data;

  // Gauge needle rotation: -90deg (0) to +90deg (100)
  const rotation = -90 + (overall / 100) * 180;

  // Color based on score
  const getColor = (score: number) => {
    if (score >= 65) return '#D4AF37'; // gold = greedy/bullish
    if (score >= 45) return '#888';    // neutral
    return '#C41E3A';                   // red = fear
  };

  const gaugeColor = getColor(overall);

  return (
    <div className="apple-card p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <span>{emoji}</span>
        市場情緒指標
        <span className="text-sm font-normal text-gray-500 ml-2">Fear & Greed</span>
      </h2>

      <div className="flex flex-col md:flex-row items-center gap-6">
        {/* Gauge */}
        <div className="relative w-48 h-28 flex-shrink-0">
          <svg viewBox="0 0 200 110" className="w-full h-full">
            {/* Background arc */}
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="#1a1a1a"
              strokeWidth="16"
              strokeLinecap="round"
            />
            {/* Colored segments */}
            <path d="M 20 100 A 80 80 0 0 1 52 42" fill="none" stroke="#8B0000" strokeWidth="16" strokeLinecap="round" />
            <path d="M 52 42 A 80 80 0 0 1 100 20" fill="none" stroke="#C41E3A" strokeWidth="16" strokeLinecap="round" />
            <path d="M 100 20 A 80 80 0 0 1 148 42" fill="none" stroke="#888" strokeWidth="16" strokeLinecap="round" />
            <path d="M 148 42 A 80 80 0 0 1 165 62" fill="none" stroke="#B8860B" strokeWidth="16" strokeLinecap="round" />
            <path d="M 165 62 A 80 80 0 0 1 180 100" fill="none" stroke="#D4AF37" strokeWidth="16" strokeLinecap="round" />
            {/* Needle */}
            <g transform={`rotate(${rotation}, 100, 100)`}>
              <line x1="100" y1="100" x2="100" y2="30" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="100" cy="100" r="5" fill="white" />
            </g>
          </svg>
          {/* Score text */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
            <span className="text-3xl font-bold" style={{ color: gaugeColor }}>{overall}</span>
            <span className="text-xs text-gray-500 ml-1">/ 100</span>
          </div>
        </div>

        {/* Label + signals */}
        <div className="flex-1 min-w-0">
          <div className="text-center md:text-left mb-3">
            <span className="text-2xl font-bold" style={{ color: gaugeColor }}>{label}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {signals.map((s) => (
              <div key={s.name} className="bg-[#111] rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400">{s.name}</span>
                  <span className="text-xs font-bold" style={{ color: getColor(s.score) }}>{s.score}</span>
                </div>
                {/* Mini bar */}
                <div className="h-1.5 bg-[#222] rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${s.score}%`, backgroundColor: getColor(s.score) }}
                  />
                </div>
                <p className="text-[10px] text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
