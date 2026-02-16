'use client';

import { useEffect, useState } from 'react';
import StockCard from '@/components/StockCard';
import SearchBar from '@/components/SearchBar';
import SortSelect from '@/components/SortSelect';
import { SP500Stock, StockQuote, InstitutionalHolder, StockWithQuote, SortOption } from '@/types';

const sortOptions: SortOption[] = [
  { value: 'symbol', label: 'Symbol (A-Z)' },
  { value: 'holders', label: 'Most Institutional Holders' },
  { value: 'price-high', label: 'Highest Price' },
  { value: 'price-low', label: 'Lowest Price' },
  { value: 'change-high', label: 'Biggest Gainers' },
  { value: 'change-low', label: 'Biggest Losers' },
];

export default function Home() {
  const [stocks, setStocks] = useState<StockWithQuote[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<StockWithQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('symbol');

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch S&P 500 list
        const sp500Response = await fetch('/api/sp500');
        const sp500Data: SP500Stock[] = await sp500Response.json();

        // Fetch quotes and institutional holders for all stocks (in batches to avoid rate limits)
        const batchSize = 50;
        const enrichedStocks: StockWithQuote[] = [];

        for (let i = 0; i < sp500Data.length; i += batchSize) {
          const batch = sp500Data.slice(i, i + batchSize);
          const batchPromises = batch.map(async (stock) => {
            try {
              const [quoteRes, institutionalRes] = await Promise.all([
                fetch(`/api/quote/${stock.symbol}`),
                fetch(`/api/institutional/${stock.symbol}`),
              ]);

              const quoteData: StockQuote[] = await quoteRes.json();
              const institutionalData: InstitutionalHolder[] = await institutionalRes.json();

              return {
                ...stock,
                price: quoteData[0]?.price || 0,
                change: quoteData[0]?.change || 0,
                changesPercentage: quoteData[0]?.changesPercentage || 0,
                institutionalHolders: institutionalData?.length || 0,
              };
            } catch (error) {
              console.error(`Error fetching data for ${stock.symbol}:`, error);
              return {
                ...stock,
                price: 0,
                change: 0,
                changesPercentage: 0,
                institutionalHolders: 0,
              };
            }
          });

          const batchResults = await Promise.all(batchPromises);
          enrichedStocks.push(...batchResults);

          // Update UI after each batch
          setStocks([...enrichedStocks]);
          setFilteredStocks([...enrichedStocks]);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    // Filter stocks based on search term
    let filtered = stocks.filter(
      (stock) =>
        stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Sort stocks
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'symbol':
          return a.symbol.localeCompare(b.symbol);
        case 'holders':
          return (b.institutionalHolders || 0) - (a.institutionalHolders || 0);
        case 'price-high':
          return b.price - a.price;
        case 'price-low':
          return a.price - b.price;
        case 'change-high':
          return b.changesPercentage - a.changesPercentage;
        case 'change-low':
          return a.changesPercentage - b.changesPercentage;
        default:
          return 0;
      }
    });

    setFilteredStocks(filtered);
  }, [searchTerm, sortBy, stocks]);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-2">
          <span className="text-primary">13F</span> Tracker
        </h1>
        <p className="text-center text-gray-400">
          S&P 500 Institutional Holdings Viewer
        </p>
      </header>

      <div className="max-w-7xl mx-auto">
        <SearchBar value={searchTerm} onChange={setSearchTerm} />
        
        <div className="flex justify-between items-center mb-6">
          <p className="text-gray-400">
            {loading ? 'Loading...' : `${filteredStocks.length} stocks`}
          </p>
          <SortSelect value={sortBy} onChange={setSortBy} options={sortOptions} />
        </div>

        {loading && stocks.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="mt-4 text-gray-400">Loading S&P 500 stocks...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredStocks.map((stock) => (
                <StockCard key={stock.symbol} stock={stock} />
              ))}
            </div>

            {filteredStocks.length === 0 && !loading && (
              <div className="text-center py-20">
                <p className="text-gray-400">No stocks found matching &quot;{searchTerm}&quot;</p>
              </div>
            )}

            {loading && stocks.length > 0 && (
              <div className="text-center py-8">
                <p className="text-gray-400">
                  Loading data... ({stocks.length} / ~500)
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
