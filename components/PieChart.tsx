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
  size?: number;
}

function formatValue(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}兆`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}億`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}百萬`;
  return n.toLocaleString();
}

export default function PieChart({ data, title, subtitle, size = 280 }: PieChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Calculate total and percentages
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  const dataWithPercentages = data.map(slice => ({
    ...slice,
    percentage: (slice.value / total) * 100
  }));

  // Generate SVG path for pie slice
  const createArc = (startAngle: number, endAngle: number, radius: number = 90) => {
    const start = polarToCartesian(100, 100, radius, endAngle);
    const end = polarToCartesian(100, 100, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      `M 100 100`,
      `L ${start.x} ${start.y}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
      'Z'
    ].join(' ');
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians)
    };
  };

  // Calculate angles for each slice
  let currentAngle = 0;
  const slicesWithAngles = dataWithPercentages.map((slice, index) => {
    const angle = (slice.value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle += angle;

    return {
      ...slice,
      startAngle,
      endAngle,
      path: createArc(startAngle, endAngle)
    };
  });

  return (
    <div className="apple-card p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-gray-400 font-light">{subtitle}</p>}
      </div>

      <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
        {/* Pie Chart */}
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full"
            style={{ filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3))' }}
          >
            {slicesWithAngles.map((slice, index) => (
              <g key={index}>
                <path
                  d={slice.path}
                  fill={slice.color}
                  stroke="rgba(0, 0, 0, 0.3)"
                  strokeWidth="0.5"
                  className="transition-all duration-200 cursor-pointer"
                  style={{
                    opacity: hoveredIndex === null || hoveredIndex === index ? 1 : 0.5,
                    transform: hoveredIndex === index ? 'scale(1.05)' : 'scale(1)',
                    transformOrigin: '100px 100px'
                  }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              </g>
            ))}
          </svg>

          {/* Tooltip */}
          {hoveredIndex !== null && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/90 border border-white/10 rounded-xl px-4 py-3 pointer-events-none z-10 backdrop-blur-sm">
              <p className="text-sm font-semibold text-white whitespace-nowrap">
                {dataWithPercentages[hoveredIndex].label}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {formatValue(dataWithPercentages[hoveredIndex].value)} ({dataWithPercentages[hoveredIndex].percentage.toFixed(1)}%)
              </p>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
          {dataWithPercentages.map((slice, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.02] transition-colors cursor-pointer"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div
                className="w-4 h-4 rounded-sm flex-shrink-0"
                style={{ backgroundColor: slice.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{slice.label}</p>
                <p className="text-xs text-gray-500">
                  {formatValue(slice.value)} ({slice.percentage.toFixed(1)}%)
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
