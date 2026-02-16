'use client';

import { useState } from 'react';

interface HistoricalPrice {
  date: string;
  close: number;
}

interface PriceChartProps {
  data: HistoricalPrice[];
  symbol: string;
  inline?: boolean;
}

export default function PriceChart({ data, symbol, inline }: PriceChartProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; price: number } | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="apple-card p-8">
        <h2 className="text-2xl font-bold mb-6">兩年股價走勢</h2>
        <div className="text-center py-12">
          <p className="text-gray-500 text-sm">暫無歷史價格資料</p>
        </div>
      </div>
    );
  }

  // Calculate chart dimensions
  const width = 800;
  const height = 300;
  const padding = { top: 40, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Get price range
  const prices = data.map(d => d.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;
  const priceBuffer = priceRange * 0.1; // 10% buffer

  // Determine chart color (gold if up, red if down)
  const firstPrice = data[0].close;
  const lastPrice = data[data.length - 1].close;
  const isUp = lastPrice >= firstPrice;
  const lineColor = isUp ? '#D4AF37' : '#C41E3A';
  const fillColor = isUp ? 'rgba(212, 175, 55, 0.1)' : 'rgba(196, 30, 58, 0.1)';

  // Create path for the line chart
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * chartWidth;
    const y = chartHeight - ((d.close - minPrice + priceBuffer) / (priceRange + 2 * priceBuffer)) * chartHeight;
    return { x, y, date: d.date, price: d.close };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  
  // Create fill area path (close the path at bottom)
  const fillPath = `${linePath} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;

  // X-axis labels (show ~6 evenly spaced dates)
  const xLabels = [];
  const labelCount = 6;
  for (let i = 0; i < labelCount; i++) {
    const index = Math.floor((i / (labelCount - 1)) * (data.length - 1));
    const point = points[index];
    const date = new Date(data[index].date);
    const label = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    xLabels.push({ x: point.x, label });
  }

  // Y-axis labels (min, mid, max)
  const yLabels = [
    { y: chartHeight, label: `$${minPrice.toFixed(2)}` },
    { y: chartHeight / 2, label: `$${((minPrice + maxPrice) / 2).toFixed(2)}` },
    { y: 0, label: `$${maxPrice.toFixed(2)}` }
  ];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left - padding.left;
    const y = e.clientY - rect.top - padding.top;

    if (x < 0 || x > chartWidth || y < 0 || y > chartHeight) {
      setTooltip(null);
      return;
    }

    // Find nearest point
    const index = Math.round((x / chartWidth) * (data.length - 1));
    const point = points[index];
    
    if (point) {
      setTooltip({
        x: point.x + padding.left,
        y: point.y + padding.top,
        date: point.date,
        price: point.price
      });
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  return (
    <div className={inline ? '' : 'apple-card p-6 sm:p-8'}>
      {!inline && (
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-bold">兩年股價走勢</h2>
        <div className="text-right">
          <p className="text-sm text-gray-400">目前價格</p>
          <p className={`text-xl sm:text-2xl font-bold ${isUp ? 'text-accent' : 'text-primary'}`}>
            ${lastPrice.toFixed(2)}
          </p>
          <p className={`text-xs sm:text-sm ${isUp ? 'text-accent' : 'text-primary'}`}>
            {isUp ? '+' : ''}{((lastPrice - firstPrice) / firstPrice * 100).toFixed(2)}%
          </p>
        </div>
      </div>
      )}

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onTouchMove={(e) => {
            const touch = e.touches[0];
            const svg = e.currentTarget;
            const rect = svg.getBoundingClientRect();
            const x = touch.clientX - rect.left - padding.left;
            const y = touch.clientY - rect.top - padding.top;

            if (x < 0 || x > chartWidth || y < 0 || y > chartHeight) {
              setTooltip(null);
              return;
            }

            const index = Math.round((x / chartWidth) * (data.length - 1));
            const point = points[index];
            
            if (point) {
              setTooltip({
                x: point.x + padding.left,
                y: point.y + padding.top,
                date: point.date,
                price: point.price
              });
            }
          }}
          onTouchEnd={handleMouseLeave}
        >
          <defs>
            <linearGradient id={`gradient-${symbol}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          <g transform={`translate(${padding.left}, ${padding.top})`}>
            {/* Y-axis grid lines */}
            {yLabels.map((label, i) => (
              <g key={i}>
                <line
                  x1={0}
                  y1={label.y}
                  x2={chartWidth}
                  y2={label.y}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="1"
                />
                <text
                  x={-10}
                  y={label.y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="#666"
                  fontSize="12"
                  fontFamily="system-ui"
                >
                  {label.label}
                </text>
              </g>
            ))}

            {/* X-axis grid lines */}
            {xLabels.map((label, i) => (
              <g key={i}>
                <line
                  x1={label.x}
                  y1={0}
                  x2={label.x}
                  y2={chartHeight}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="1"
                />
                <text
                  x={label.x}
                  y={chartHeight + 20}
                  textAnchor="middle"
                  fill="#666"
                  fontSize="12"
                  fontFamily="system-ui"
                >
                  {label.label}
                </text>
              </g>
            ))}

            {/* Fill area under the line */}
            <path
              d={fillPath}
              fill={`url(#gradient-${symbol})`}
            />

            {/* Price line */}
            <path
              d={linePath}
              fill="none"
              stroke={lineColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Tooltip indicator */}
            {tooltip && (
              <circle
                cx={tooltip.x - padding.left}
                cy={tooltip.y - padding.top}
                r="4"
                fill={lineColor}
                stroke="#fff"
                strokeWidth="2"
              />
            )}
          </g>

          {/* Tooltip */}
          {tooltip && (
            <g>
              <rect
                x={tooltip.x + 10}
                y={tooltip.y - 40}
                width="120"
                height="50"
                fill="rgba(0,0,0,0.9)"
                stroke={lineColor}
                strokeWidth="1"
                rx="4"
              />
              <text
                x={tooltip.x + 20}
                y={tooltip.y - 22}
                fill="#fff"
                fontSize="12"
                fontFamily="system-ui"
              >
                {new Date(tooltip.date).toLocaleDateString('zh-TW')}
              </text>
              <text
                x={tooltip.x + 20}
                y={tooltip.y - 6}
                fill={lineColor}
                fontSize="14"
                fontWeight="bold"
                fontFamily="system-ui"
              >
                ${tooltip.price.toFixed(2)}
              </text>
            </g>
          )}
        </svg>
      </div>

      <p className="text-xs text-gray-500 text-center mt-4">
        資料來源：過去兩年每日收盤價
      </p>
    </div>
  );
}
