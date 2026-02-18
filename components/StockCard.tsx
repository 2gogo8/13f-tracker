import Link from 'next/link';
import { StockWithQuote } from '@/types';

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

interface StockCardProps {
  stock: StockWithQuote;
}

export default function StockCard({ stock }: StockCardProps) {
  const isPositive = stock.change >= 0;

  return (
    <Link href={`/stock/${stock.symbol}`}>
      <div className="apple-card p-6 cursor-pointer h-full">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-primary mb-1">{stock.symbol}</h3>
            <p className="text-sm text-gray-600 line-clamp-2 leading-snug">{stock.name}</p>
          </div>
          <div className="text-right ml-4 flex-shrink-0">
            <p className="text-xl font-semibold text-gray-900">
              ${stock.price?.toFixed(2) || 'N/A'}
            </p>
            {stock.change !== undefined && (
              <p className={`text-sm font-medium mt-0.5 ${isPositive ? 'text-accent' : 'text-primary'}`}>
                {isPositive ? '+' : ''}
                {stock.changesPercentage?.toFixed(2)}%
              </p>
            )}
          </div>
        </div>
        
        <div className="mt-5 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 mb-1">{sectorMap[stock.sector] || stock.sector || 'N/A'}</p>
        </div>
        
        {stock.institutionalHolders !== undefined && (
          <div className="mt-3">
            <p className="text-xs text-gray-400 mb-1">機構持股</p>
            <p className="text-base text-accent font-semibold">
              {stock.institutionalHolders}
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}
