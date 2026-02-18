'use client';

import { useState } from 'react';

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

export interface PieChartProps {
  data: PieSlice[];
  title: string;
  subtitle?: string;
  size?: number; // kept for API compat, ignored
}

function formatValue(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}兆`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return n.toLocaleString();
}

export default function PieChart({ data, title, subtitle }: PieChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const total = data.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  // Sort descending
  const sorted = [...data]
    .map((s) => ({ ...s, pct: (s.value / total) * 100 }))
    .sort((a, b) => b.value - a.value);

  const maxPct = sorted[0]?.pct || 1;

  return (
    <div className="apple-card p-6 md:p-8">
      <div className="mb-8">
        <h2 className="font-serif text-2xl font-bold mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-gray-400 font-light">{subtitle}</p>}
      </div>

      {/* Stacked overview bar */}
      <div className="h-3 rounded-full overflow-hidden flex mb-8" style={{ background: 'rgba(200,200,200,0.2)' }}>
        {sorted.map((s, i) => (
          <div
            key={i}
            className="h-full transition-opacity duration-200 cursor-pointer"
            style={{
              width: `${s.pct}%`,
              backgroundColor: s.color,
              opacity: hoveredIndex === null || hoveredIndex === i ? 1 : 0.3,
            }}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        ))}
      </div>

      {/* Horizontal bars */}
      <div className="space-y-3">
        {sorted.map((s, i) => {
          const barWidth = (s.pct / maxPct) * 100;
          const isHovered = hoveredIndex === i;

          return (
            <div
              key={i}
              className="group cursor-pointer"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: s.color,
                      boxShadow: isHovered ? `0 0 8px ${s.color}80` : 'none',
                    }}
                  />
                  <span className={`text-sm font-medium truncate transition-colors ${
                    isHovered ? 'text-gray-900' : 'text-gray-600'
                  }`}>
                    {s.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <span className="text-xs text-gray-400 tabular-nums">{formatValue(s.value)}</span>
                  <span className={`text-sm font-bold tabular-nums w-14 text-right transition-colors ${
                    isHovered ? 'text-gray-900 glow-white' : 'text-accent'
                  }`}>
                    {s.pct.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(200,200,200,0.2)' }}>
                <div
                  className="h-full rounded-full chart-metallic transition-all duration-300"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: s.color,
                    opacity: hoveredIndex === null || isHovered ? 1 : 0.4,
                    boxShadow: isHovered ? `0 0 12px ${s.color}40` : 'none',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between items-center">
        <span className="text-xs text-gray-500">總計</span>
        <span className="text-sm font-semibold text-gray-500">{formatValue(total)}</span>
      </div>
    </div>
  );
}
