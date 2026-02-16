import Link from 'next/link';

const sectorMap: Record<string, string> = {
  'Technology': '科技',
  'Healthcare': '醫療保健',
  'Financial Services': '金融服務',
  'Consumer Cyclical': '非必需消費品',
  'Communication Services': '通訊服務',
  'Industrials': '工業',
  'Consumer Defensive': '必需消費品',
  'Energy': '能源',
  'Utilities': '公用事業',
  'Real Estate': '房地產',
  'Basic Materials': '基礎材料',
};

interface CompactStockRowProps {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changesPercentage: number;
  institutionalHolders?: number;
  institutionalCount?: number;
  quarterlyChange?: number;
  oversoldSignal?: string; // 'deep-value' | 'oversold' | 'overbought'
  deviation?: number;
}

export default function CompactStockRow({
  symbol,
  name,
  sector,
  price,
  changesPercentage,
  institutionalHolders,
  institutionalCount,
  quarterlyChange,
  oversoldSignal,
  deviation,
}: CompactStockRowProps) {
  const isPositive = changesPercentage >= 0;
  const hasQuarterlyChange = quarterlyChange !== undefined && quarterlyChange !== 0;
  const isQuarterlyPositive = quarterlyChange !== undefined && quarterlyChange > 0;

  return (
    <Link href={`/stock/${symbol}`}>
      <div className="flex items-center gap-4 px-4 py-2 hover:bg-white/[0.02] border-b border-white/[0.03] cursor-pointer transition-colors">
        {/* Symbol */}
        <div className="w-20 flex-shrink-0">
          <span className="text-sm font-bold text-primary">{symbol}</span>
        </div>

        {/* Company Name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-300 truncate">{name}</p>
        </div>

        {/* Price */}
        <div className="w-24 text-right flex-shrink-0">
          <span className="text-sm text-white font-medium">
            ${price.toFixed(2)}
          </span>
        </div>

        {/* Oversold Signal */}
        {oversoldSignal && (
          <div className="w-16 text-center flex-shrink-0">
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
              oversoldSignal === 'deep-value' ? 'bg-green-900/40 text-green-400' :
              oversoldSignal === 'oversold' ? 'bg-blue-900/40 text-blue-400' :
              oversoldSignal === 'overbought' ? 'bg-red-900/40 text-red-400' : ''
            }`}>
              {oversoldSignal === 'deep-value' ? '🟢' : oversoldSignal === 'oversold' ? '🔵' : '🔴'}
              {deviation !== undefined ? ` ${deviation.toFixed(1)}σ` : ''}
            </span>
          </div>
        )}

        {/* Change % */}
        <div className="w-20 text-right flex-shrink-0">
          <span
            className={`text-sm font-semibold ${
              isPositive ? 'text-accent' : 'text-primary'
            }`}
          >
            {isPositive ? '+' : ''}
            {changesPercentage.toFixed(2)}%
          </span>
        </div>

        {/* Sector */}
        <div className="w-32 flex-shrink-0 hidden lg:block">
          <span className="text-xs text-gray-500">
            {sectorMap[sector] || sector || 'N/A'}
          </span>
        </div>

        {/* Institutional Count */}
        {institutionalCount !== undefined && (
          <div className="w-16 text-right flex-shrink-0 hidden md:block">
            <span className="text-xs text-accent font-medium">
              {institutionalCount}
            </span>
          </div>
        )}

        {/* Quarterly Change */}
        {quarterlyChange !== undefined && (
          <div className="w-20 text-right flex-shrink-0 hidden lg:block">
            <span
              className={`text-xs font-semibold ${
                !hasQuarterlyChange
                  ? 'text-gray-500'
                  : isQuarterlyPositive
                  ? 'text-accent'
                  : 'text-primary'
              }`}
            >
              {hasQuarterlyChange ? (isQuarterlyPositive ? '+' : '') : ''}
              {quarterlyChange.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
