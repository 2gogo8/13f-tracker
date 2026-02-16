'use client';

import { SectorPerformance } from '@/types';

interface SectorPerformanceBarProps {
  data: SectorPerformance[];
}

export default function SectorPerformanceBar({ data }: SectorPerformanceBarProps) {
  if (data.length === 0) {
    return (
      <div className="apple-card p-8">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
          <span className="text-accent">📊</span>
          板塊資金流向
        </h2>
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">休市中，無資料顯示</p>
        </div>
      </div>
    );
  }

  // Sort by changesPercentage descending
  const sortedData = [...data].sort((a, b) => b.changesPercentage - a.changesPercentage);

  // Find max absolute value for scaling
  const maxAbsValue = Math.max(...sortedData.map((item) => Math.abs(item.changesPercentage)));
  const scale = maxAbsValue > 0 ? 100 / maxAbsValue : 1;

  return (
    <div className="apple-card p-8">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
        <span className="text-accent">📊</span>
        板塊資金流向
      </h2>
      <div className="space-y-3">
        {sortedData.map((sector) => {
          const isPositive = sector.changesPercentage >= 0;
          const barWidth = Math.abs(sector.changesPercentage * scale);

          return (
            <div key={sector.sector} className="flex items-center gap-4">
              {/* Sector Name */}
              <div className="w-28 text-right flex-shrink-0">
                <span className="text-sm text-gray-300 font-medium">{sector.sector}</span>
              </div>

              {/* Bar Container */}
              <div className="flex-1 relative h-8 flex items-center">
                {/* Zero Line (center) */}
                <div className="absolute left-1/2 w-px h-full bg-gray-700 z-0"></div>

                {/* Bar */}
                <div
                  className={`absolute h-6 rounded transition-all ${
                    isPositive ? 'bg-accent' : 'bg-primary'
                  }`}
                  style={{
                    [isPositive ? 'left' : 'right']: '50%',
                    width: `${barWidth / 2}%`,
                  }}
                ></div>
              </div>

              {/* Percentage Value */}
              <div className="w-20 text-left flex-shrink-0">
                <span
                  className={`text-sm font-semibold ${
                    isPositive ? 'text-accent' : 'text-primary'
                  }`}
                >
                  {isPositive ? '+' : ''}
                  {sector.changesPercentage.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
