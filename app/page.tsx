'use client';

import { useEffect, useState } from 'react';
import StockCard from '@/components/StockCard';
import SearchBar from '@/components/SearchBar';
import SortSelect from '@/components/SortSelect';
import PieChart, { PieSlice } from '@/components/PieChart';
import { SP500Stock, StockQuote, InstitutionalHolder, StockWithQuote, SortOption } from '@/types';

const sortOptions: SortOption[] = [
  { value: 'symbol', label: '代號 (A-Z)' },
  { value: 'holders', label: '機構持股數' },
  { value: 'price-high', label: '最高股價' },
  { value: 'price-low', label: '最低股價' },
  { value: 'change-high', label: '最大漲幅' },
  { value: 'change-low', label: '最大跌幅' },
];

export default function Home() {
  const [stocks, setStocks] = useState<StockWithQuote[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<StockWithQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('symbol');
  const [sectorPieData, setSectorPieData] = useState<PieSlice[]>([]);
  const [sectorQuarter, setSectorQuarter] = useState('');

  useEffect(() => {
    // Fetch institutional industry summary separately
    async function fetchIndustrySummary() {
      try {
        const res = await fetch('/api/industry-summary');
        const data = await res.json();
        if (data.sectors) {
          const colors = [
            '#C41E3A', '#D4AF37', '#8B0000', '#B8860B', '#FF6B6B',
            '#FFD700', '#CD5C5C', '#DAA520', '#E8A87C', '#85677B',
            '#A0522D', '#8B4513', '#9B59B6'
          ];
          setSectorPieData(
            data.sectors.map((s: { sector: string; value: number }, i: number) => ({
              label: s.sector,
              value: s.value,
              color: colors[i % colors.length],
            }))
          );
          setSectorQuarter(data.quarter || '');
        }
      } catch (e) {
        console.error('Error fetching industry summary:', e);
      }
    }
    fetchIndustrySummary();
  }, []);

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
    <div className="min-h-screen py-16 px-4 md:px-8">
      <header className="mb-16 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-4 tracking-tight">
          <span className="gradient-text">JG</span>{' '}
          <span className="text-white">13F 機構報告書</span>
        </h1>
        <div className="gradient-line mb-6"></div>
        <p className="text-gray-400 font-light text-lg tracking-wide">
          S&P 500 機構持倉總覽
        </p>
      </header>

      <div className="max-w-7xl mx-auto">
        {/* Institutional Industry Pie Chart */}
        {sectorPieData.length > 0 && (
          <div className="mb-16">
            <PieChart
              data={sectorPieData}
              title="機構持倉產業分佈"
              subtitle={`${sectorQuarter} 各產業機構投資金額比重`}
              size={300}
            />
          </div>
        )}

        <SearchBar value={searchTerm} onChange={setSearchTerm} />
        
        <div className="flex justify-between items-center mb-8 px-1">
          <p className="text-sm text-gray-500">
            {loading ? '' : `${filteredStocks.length} 檔股票`}
          </p>
          <SortSelect value={sortBy} onChange={setSortBy} options={sortOptions} />
        </div>

        {loading && stocks.length === 0 ? (
          <div className="text-center py-32">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
            <p className="mt-6 text-gray-500 font-light">載入 S&P 500 股票中...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredStocks.map((stock) => (
                <StockCard key={stock.symbol} stock={stock} />
              ))}
            </div>

            {filteredStocks.length === 0 && !loading && (
              <div className="text-center py-32">
                <p className="text-gray-500 text-lg">找不到符合的股票 &quot;{searchTerm}&quot;</p>
              </div>
            )}

            {loading && stocks.length > 0 && (
              <div className="text-center py-12 mt-8">
                <p className="text-gray-600 text-sm">
                  載入資料中 ({stocks.length} / ~500)
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
