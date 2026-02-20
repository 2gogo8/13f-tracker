'use client';

import { useEffect, useState } from 'react';

interface ConsensusData {
  symbol: string;
  targetHigh: number | null;
  targetLow: number | null;
  targetConsensus: number | null;
  targetMedian: number | null;
  lastMonthCount: number;
  lastMonthAvg: number | null;
  lastQuarterCount: number;
  lastQuarterAvg: number | null;
  lastYearCount: number;
  lastYearAvg: number | null;
  allTimeCount: number;
  publishers: string[];
}

interface Props {
  symbol: string;
  currentPrice?: number;
}

export default function AnalystConsensus({ symbol, currentPrice }: Props) {
  const [data, setData] = useState<ConsensusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/analyst-consensus/${symbol}`);
        const d = await res.json();
        if (d && !d.error) setData(d);
      } catch {}
      setLoading(false);
    }
    load();
  }, [symbol]);

  if (loading) {
    return (
      <div className="apple-card p-5 md:p-6">
        <h3 className="font-serif text-base font-bold text-gray-900">分析師共識</h3>
        <p className="text-[10px] text-gray-500 mt-1">載入中...</p>
      </div>
    );
  }

  if (!data || !data.targetConsensus) return null;

  const price = currentPrice || 0;
  const upside = price > 0 && data.targetConsensus
    ? ((data.targetConsensus - price) / price * 100)
    : null;

  // Visual gauge: position current price between targetLow and targetHigh
  const low = data.targetLow || data.targetConsensus * 0.8;
  const high = data.targetHigh || data.targetConsensus * 1.2;
  const range = high - low;
  const pricePct = range > 0 ? Math.max(0, Math.min(100, ((price - low) / range) * 100)) : 50;
  const consensusPct = range > 0 ? Math.max(0, Math.min(100, ((data.targetConsensus - low) / range) * 100)) : 50;

  return (
    <div className="apple-card p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-base font-bold text-gray-900">分析師共識</h3>
        <span className="text-[10px] text-gray-500">
          {data.lastYearCount} 位分析師（近一年）
        </span>
      </div>

      {/* Target Price Gauge */}
      <div className="mb-5">
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>最低 ${low.toFixed(0)}</span>
          <span>最高 ${high.toFixed(0)}</span>
        </div>
        <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
          {/* Gradient bar */}
          <div className="absolute inset-0 rounded-full" style={{
            background: 'linear-gradient(to right, #C41E3A, #D4AF37, #22c55e)'
          }} />
          {/* Current price marker */}
          {price > 0 && (
            <div
              className="absolute top-0 h-full w-0.5 bg-gray-900 z-10"
              style={{ left: `${pricePct}%` }}
              title={`現價 $${price.toFixed(2)}`}
            />
          )}
          {/* Consensus marker */}
          <div
            className="absolute -top-1 w-3 h-5 rounded-sm bg-white border-2 border-accent z-20"
            style={{ left: `${consensusPct}%`, transform: 'translateX(-50%)' }}
            title={`共識 $${data.targetConsensus.toFixed(2)}`}
          />
        </div>
        <div className="flex justify-between items-end mt-2">
          {price > 0 && (
            <span className="text-[10px] text-gray-600">
              現價 <span className="font-mono font-semibold text-gray-900">${price.toFixed(2)}</span>
            </span>
          )}
          <span className="text-[10px] text-gray-600">
            共識目標 <span className="font-mono font-bold text-accent">${data.targetConsensus.toFixed(2)}</span>
          </span>
        </div>
      </div>

      {/* Upside/Downside */}
      {upside !== null && (
        <div className={`text-center py-3 rounded-lg mb-4 ${
          upside >= 10 ? 'bg-green-50' : upside >= 0 ? 'bg-yellow-50' : 'bg-red-50'
        }`}>
          <span className={`text-lg font-bold font-mono ${
            upside >= 10 ? 'text-green-600' : upside >= 0 ? 'text-yellow-600' : 'text-primary'
          }`}>
            {upside >= 0 ? '+' : ''}{upside.toFixed(1)}%
          </span>
          <span className="text-[10px] text-gray-500 ml-2">
            {upside >= 10 ? '潛在上漲空間' : upside >= 0 ? '接近目標價' : '低於目標價'}
          </span>
        </div>
      )}

      {/* Period breakdown */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: '近一月', count: data.lastMonthCount, avg: data.lastMonthAvg },
          { label: '近一季', count: data.lastQuarterCount, avg: data.lastQuarterAvg },
          { label: '近一年', count: data.lastYearCount, avg: data.lastYearAvg },
        ].map((period) => (
          <div key={period.label} className="text-center p-2 rounded-lg bg-gray-50">
            <div className="text-[9px] text-gray-500 mb-1">{period.label}</div>
            <div className="text-sm font-mono font-bold text-gray-900">
              {period.avg ? `$${period.avg.toFixed(0)}` : '—'}
            </div>
            <div className="text-[9px] text-gray-400">{period.count} 位</div>
          </div>
        ))}
      </div>

      {/* Publishers */}
      {data.publishers.length > 0 && (
        <div className="text-[9px] text-gray-400 text-center">
          來源：{data.publishers.slice(0, 5).join('、')}{data.publishers.length > 5 ? ` 等 ${data.publishers.length} 家` : ''}
        </div>
      )}
    </div>
  );
}
