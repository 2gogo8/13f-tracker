import Link from 'next/link';
import { StockWithQuote } from '@/types';

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
            <p className="text-sm text-gray-400 line-clamp-2 leading-snug">{stock.name}</p>
          </div>
          <div className="text-right ml-4 flex-shrink-0">
            <p className="text-xl font-semibold text-white">
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
        
        <div className="mt-5 pt-4 border-t border-white/5">
          <p className="text-xs text-gray-500 mb-1">{stock.sector || 'N/A'}</p>
        </div>
        
        {stock.institutionalHolders !== undefined && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-1">機構持股</p>
            <p className="text-base text-accent font-semibold">
              {stock.institutionalHolders}
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}
