'use client';

import Link from 'next/link';

interface HeatmapStock {
  symbol: string;
  changeValue: number; // totalInvestedChange percentage
}

interface HeatmapGridProps {
  stocks: HeatmapStock[];
}

// Generate color based on change value
// Deep red (-10%+) → neutral gray (0%) → bright green (+10%+)
function getColorForChange(change: number): string {
  // Normalize to -1 to 1 range (cap at ±10%)
  const normalized = Math.max(-1, Math.min(1, change / 10));

  if (normalized < 0) {
    // Red shades for negative
    const intensity = Math.abs(normalized);
    const r = Math.round(139 + (196 - 139) * intensity); // #8B0000 to #C41E3A
    const g = Math.round(0 + (30 - 0) * intensity);
    const b = Math.round(0 + (58 - 0) * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (normalized > 0) {
    // Green shades for positive
    const intensity = normalized;
    const r = Math.round(34 + (212 - 34) * intensity); // Dark green to gold
    const g = Math.round(139 + (175 - 139) * intensity);
    const b = Math.round(34 + (55 - 34) * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Neutral gray
    return '#E8E4DD';
  }
}

export default function HeatmapGrid({ stocks }: HeatmapGridProps) {
  if (stocks.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400 text-sm">載入熱力圖資料中...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
      {stocks.map((stock) => (
        <Link
          key={stock.symbol}
          href={`/stock/${stock.symbol}`}
          className="aspect-square rounded flex items-center justify-center text-xs font-bold text-gray-900 cursor-pointer hover:scale-105 transition-transform shadow-lg"
          style={{ backgroundColor: getColorForChange(stock.changeValue) }}
          title={`${stock.symbol}: ${stock.changeValue > 0 ? '+' : ''}${stock.changeValue.toFixed(1)}%`}
        >
          {stock.symbol}
        </Link>
      ))}
    </div>
  );
}
