import Link from 'next/link';
import { StockWithQuote } from '@/types';

interface StockCardProps {
  stock: StockWithQuote;
}

export default function StockCard({ stock }: StockCardProps) {
  const isPositive = stock.change >= 0;

  return (
    <Link href={`/stock/${stock.symbol}`}>
      <div className="bg-secondary border border-border rounded-lg p-4 hover:border-accent hover:shadow-[0_0_15px_rgba(212,175,55,0.15)] transition-all cursor-pointer h-full">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="text-lg font-bold text-primary">{stock.symbol}</h3>
            <p className="text-sm text-gray-400 line-clamp-1">{stock.name}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">
              ${stock.price?.toFixed(2) || 'N/A'}
            </p>
            {stock.change !== undefined && (
              <p className={`text-sm ${isPositive ? 'text-accent' : 'text-primary'}`}>
                {isPositive ? '+' : ''}
                {stock.changesPercentage?.toFixed(2)}%
              </p>
            )}
          </div>
        </div>
        
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-gray-500 font-light">產業</p>
          <p className="text-sm text-gray-300 font-bold">{stock.sector || 'N/A'}</p>
        </div>
        
        {stock.institutionalHolders !== undefined && (
          <div className="mt-2">
            <p className="text-xs text-gray-500 font-light">機構持股數</p>
            <p className="text-sm text-accent font-bold">
              {stock.institutionalHolders}
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}
