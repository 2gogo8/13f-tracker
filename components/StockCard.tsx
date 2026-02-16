import Link from 'next/link';
import { StockWithQuote } from '@/types';

interface StockCardProps {
  stock: StockWithQuote;
}

export default function StockCard({ stock }: StockCardProps) {
  const isPositive = stock.change >= 0;

  return (
    <Link href={`/stock/${stock.symbol}`}>
      <div className="bg-secondary border border-gray-800 rounded-lg p-4 hover:border-primary transition-colors cursor-pointer h-full">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="text-lg font-bold text-primary">{stock.symbol}</h3>
            <p className="text-sm text-gray-400 line-clamp-1">{stock.name}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">
              ${stock.price?.toFixed(2) || 'N/A'}
            </p>
            {stock.change !== undefined && (
              <p className={`text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}
                {stock.changesPercentage?.toFixed(2)}%
              </p>
            )}
          </div>
        </div>
        
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-xs text-gray-500">Sector</p>
          <p className="text-sm text-gray-300">{stock.sector || 'N/A'}</p>
        </div>
        
        {stock.institutionalHolders !== undefined && (
          <div className="mt-2">
            <p className="text-xs text-gray-500">Institutional Holders</p>
            <p className="text-sm text-accent font-medium">
              {stock.institutionalHolders}
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}
