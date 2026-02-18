'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SearchBar from '@/components/SearchBar';
import SortSelect from '@/components/SortSelect';
import PieChart, { PieSlice } from '@/components/PieChart';
import CompactStockRow from '@/components/CompactStockRow';
import HeatmapGrid from '@/components/HeatmapGrid';
import ScannerButtons, { ScannerType } from '@/components/ScannerButtons';
import SectorPerformanceBar from '@/components/SectorPerformanceBar';
import SentimentGauge from '@/components/SentimentGauge';
import TopPicks from '@/components/TopPicks';
import GrowthPicks from '@/components/GrowthPicks';
import TrendingNews from '@/components/TrendingNews';
import { DashboardStock, TopMoverStock, SortOption, SectorPerformance, TrendingNewsItem } from '@/types';

const sortOptions: SortOption[] = [
  { value: 'symbol', label: '代號 (A-Z)' },
  { value: 'price-high', label: '最高股價' },
  { value: 'price-low', label: '最低股價' },
  { value: 'change-high', label: '最大漲幅' },
  { value: 'change-low', label: '最大跌幅' },
];

type ViewMode = 'dashboard' | 'list';

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [stocks, setStocks] = useState<DashboardStock[]>([]);
  const [topMovers, setTopMovers] = useState<{
    topAccumulation: TopMoverStock[];
    topReduction: TopMoverStock[];
    allStocks: TopMoverStock[];
  } | null>(null);
  const [filteredStocks, setFilteredStocks] = useState<DashboardStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('symbol');
  const [activeScanner, setActiveScanner] = useState<ScannerType>(null);
  const [sectorPieData, setSectorPieData] = useState<PieSlice[]>([]);
  const [sectorQuarter, setSectorQuarter] = useState('');
  const [sectorPerformance, setSectorPerformance] = useState<SectorPerformance[]>([]);
  const [trendingNews, setTrendingNews] = useState<TrendingNewsItem[]>([]);
  const [oversoldSymbols, setOversoldSymbols] = useState<Set<string>>(new Set());
  const [oversoldData, setOversoldData] = useState<Map<string, { signal: string; deviation: number }>>(new Map());

  // Fetch industry summary
  useEffect(() => {
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

  // Fetch sector performance
  useEffect(() => {
    async function fetchSectorPerformance() {
      try {
        const res = await fetch('/api/sector-performance');
        const data = await res.json();
        if (Array.isArray(data)) setSectorPerformance(data);
      } catch (e) {
        console.error('Error fetching sector performance:', e);
      }
    }
    fetchSectorPerformance();
  }, []);

  // Fetch trending news
  useEffect(() => {
    async function fetchTrendingNews() {
      try {
        const res = await fetch('/api/trending-news');
        const data = await res.json();
        if (Array.isArray(data)) setTrendingNews(data);
      } catch (e) {
        console.error('Error fetching trending news:', e);
      }
    }
    fetchTrendingNews();
  }, []);

  // Fetch oversold scanner data when scanner is activated
  useEffect(() => {
    if (activeScanner !== 'oversold') return;
    if (oversoldSymbols.size > 0) return; // already fetched
    async function fetchOversold() {
      try {
        const res = await fetch('/api/oversold-scanner');
        const data = await res.json();
        if (Array.isArray(data)) {
          setOversoldSymbols(new Set(data.map((d: { symbol: string }) => d.symbol)));
          const map = new Map<string, { signal: string; deviation: number }>();
          data.forEach((d: { symbol: string; signal: string; deviation: number }) => {
            map.set(d.symbol, { signal: d.signal, deviation: d.deviation });
          });
          setOversoldData(map);
        }
      } catch (e) {
        console.error('Error fetching oversold data:', e);
      }
    }
    fetchOversold();
  }, [activeScanner, oversoldSymbols.size]);

  // Fetch dashboard data (all stocks with quotes)
  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const response = await fetch('/api/dashboard');
        const data = await response.json();
        if (Array.isArray(data)) {
          setStocks(data);
          setFilteredStocks(data);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, []);

  // Fetch top movers (institutional data for popular stocks)
  useEffect(() => {
    async function fetchTopMovers() {
      try {
        const response = await fetch('/api/top-movers');
        const data = await response.json();
        if (data && data.topAccumulation) setTopMovers(data);
      } catch (error) {
        console.error('Error fetching top movers:', error);
      }
    }
    fetchTopMovers();
  }, []);

  // Filter and sort stocks
  useEffect(() => {
    let filtered = stocks.filter(
      (stock) =>
        stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Apply scanner filters
    if (activeScanner === 'oversold') {
      filtered = filtered.filter(stock => oversoldSymbols.has(stock.symbol));
      // Sort by most oversold
      filtered.sort((a, b) => {
        const devA = oversoldData.get(a.symbol)?.deviation ?? 0;
        const devB = oversoldData.get(b.symbol)?.deviation ?? 0;
        return devA - devB;
      });
    } else if (activeScanner && topMovers) {
      const institutionalSymbols = new Set(topMovers.allStocks.map(s => s.symbol));
      filtered = filtered.filter(stock => institutionalSymbols.has(stock.symbol));

      if (activeScanner === 'accumulation') {
        // Filter stocks where institutional holdings increased >20%
        const accumulationSymbols = new Set(
          topMovers.allStocks
            .filter(s => {
              const previousHolding = s.investorsHolding - s.investorsHoldingChange;
              if (previousHolding <= 0) return false;
              const changeRatio = s.investorsHoldingChange / previousHolding;
              return changeRatio > 0.2;
            })
            .map(s => s.symbol)
        );
        filtered = filtered.filter(stock => accumulationSymbols.has(stock.symbol));
      } else if (activeScanner === 'selling') {
        // Filter stocks where institutional holdings decreased >20%
        const sellingSymbols = new Set(
          topMovers.allStocks
            .filter(s => {
              const previousHolding = s.investorsHolding - s.investorsHoldingChange;
              if (previousHolding <= 0) return false;
              const changeRatio = s.investorsHoldingChange / previousHolding;
              return changeRatio < -0.2;
            })
            .map(s => s.symbol)
        );
        filtered = filtered.filter(stock => sellingSymbols.has(stock.symbol));
      } else if (activeScanner === 'top-holdings') {
        // Top 20 by total institutional investment amount
        const topHoldingsSymbols = new Set(
          [...topMovers.allStocks]
            .sort((a, b) => b.totalInvested - a.totalInvested)
            .slice(0, 20)
            .map(s => s.symbol)
        );
        filtered = filtered.filter(stock => topHoldingsSymbols.has(stock.symbol));
      }
    }

    // Sort stocks
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'symbol':
          return a.symbol.localeCompare(b.symbol);
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
  }, [searchTerm, sortBy, stocks, activeScanner, topMovers, oversoldSymbols, oversoldData]);

  return (
    <div className="min-h-screen py-20 px-4 md:px-8">
      {/* Header */}
      <header className="mb-16 text-center">
        <h1 className="font-serif text-5xl md:text-7xl font-bold mb-6 tracking-tight leading-tight">
          <span className="gradient-text">JG</span><span className="text-white glow-white">的</span><span className="text-primary glow-red">反</span><span className="text-white glow-white">市場報告書</span>
        </h1>
        <div className="gradient-line mb-8"></div>
        <p className="text-gray-500 font-light text-lg tracking-[0.2em] uppercase">
          美股機構持倉戰情儀表板
        </p>
      </header>

      <div className="max-w-7xl mx-auto">
        {/* Search Bar */}
        <div className="mb-8">
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center gap-4 mb-10">
          <button
            onClick={() => setViewMode('dashboard')}
            className={`px-8 py-3 rounded-xl text-sm font-medium transition-all ${
              viewMode === 'dashboard'
                ? 'bg-primary text-white shadow-[0_4px_20px_rgba(196,30,58,0.3)]'
                : 'bg-[#111] text-gray-400 hover:bg-[#1A1A1A] hover:text-white'
            }`}
          >
            儀表板
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-8 py-3 rounded-xl text-sm font-medium transition-all ${
              viewMode === 'list'
                ? 'bg-primary text-white shadow-[0_4px_20px_rgba(196,30,58,0.3)]'
                : 'bg-[#111] text-gray-400 hover:bg-[#1A1A1A] hover:text-white'
            }`}
          >
            完整列表
          </button>
        </div>

        {/* Top Picks - Oversold + Large Cap */}
        <GrowthPicks />
        <TopPicks />

        {loading ? (
          <div className="text-center py-32">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
            <p className="mt-6 text-gray-500 font-light">載入美股數據中...</p>
          </div>
        ) : (
          <>
            {/* Dashboard View */}
            {viewMode === 'dashboard' && (
              <div className="space-y-16">
                {/* Market Sentiment Gauge */}
                <SentimentGauge />

                {/* Sector Performance Bar Chart */}
                <SectorPerformanceBar data={sectorPerformance} />

                {/* Top Accumulation Leaderboard */}
                {topMovers && topMovers.topAccumulation.length > 0 && (
                  <div className="apple-card p-4 sm:p-8">
                    <h2 className="font-serif text-2xl font-bold mb-6 flex items-center gap-3">
                      
                      機構加碼排行 Top 10
                    </h2>
                    <div className="space-y-1">
                      {topMovers.topAccumulation.map((stock, index) => (
                        <Link
                          key={stock.symbol}
                          href={`/stock/${stock.symbol}`}
                          className={`flex items-center gap-2 sm:gap-4 px-2 sm:px-4 py-3 rounded-lg transition-colors overflow-hidden ${
                            index === 0 ? 'bg-accent/10 border border-accent/20' : 'hover:bg-white/[0.02]'
                          }`}
                        >
                          <div className="w-6 sm:w-8 text-center flex-shrink-0">
                            <span className={`text-base sm:text-lg font-bold ${index === 0 ? 'text-accent' : 'text-gray-500'}`}>
                              {index + 1}
                            </span>
                          </div>
                          <div className="w-12 sm:w-20 flex-shrink-0">
                            <span className="text-xs sm:text-sm font-bold text-primary">{stock.symbol}</span>
                          </div>
                          <div className="flex-1 min-w-0 hidden sm:block">
                            <p className="text-sm text-gray-300 truncate">{stock.name}</p>
                          </div>
                          <div className="w-16 sm:w-24 text-right flex-shrink-0">
                            <span className="text-xs sm:text-sm text-white font-medium">${(stock.price ?? 0).toFixed(2)}</span>
                          </div>
                          <div className="w-16 sm:w-20 text-right flex-shrink-0">
                            <span className={`text-xs sm:text-sm font-semibold ${(stock.changesPercentage ?? 0) >= 0 ? 'text-accent' : 'text-primary'}`}>
                              {(stock.changesPercentage ?? 0) >= 0 ? '+' : ''}
                              {(stock.changesPercentage ?? 0).toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-24 sm:w-32 text-right flex-shrink-0 hidden md:block">
                            <span className="text-xs text-accent font-medium">
                              機構 +${((stock.totalInvestedChange ?? 0) / 1e9).toFixed(2)}B
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Smart Scanners */}
                <div>
                  <h2 className="text-xl font-bold mb-4 text-center">智慧篩選</h2>
                  <ScannerButtons
                    activeScanner={activeScanner}
                    onScannerChange={setActiveScanner}
                  />
                </div>

                {/* Trending News */}
                <TrendingNews news={trendingNews} />

                {/* Industry Pie Chart */}
                {sectorPieData.length > 0 && (
                  <PieChart
                    data={sectorPieData}
                    title="機構持倉產業分佈"
                    subtitle={`${sectorQuarter} 各產業機構投資金額比重`}
                    size={280}
                  />
                )}

                {/* Heatmap */}
                {topMovers && topMovers.allStocks.length > 0 && (
                  <div className="apple-card p-8">
                    <h2 className="font-serif text-2xl font-bold mb-6">機構持倉熱力圖</h2>
                    <p className="text-sm text-gray-400 mb-6">
                      綠色 = 機構加碼 | 紅色 = 機構減倉 | 灰色 = 持平
                    </p>
                    <HeatmapGrid
                      stocks={topMovers.allStocks.map(s => ({
                        symbol: s.symbol,
                        changeValue: s.totalInvested > 0 ? (s.totalInvestedChange / s.totalInvested) * 100 : 0,
                      }))}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Full List View */}
            {viewMode === 'list' && (
              <div>
                <div className="flex justify-between items-center mb-6 px-1">
                  <p className="text-sm text-gray-500">
                    {filteredStocks.length} 檔股票
                  </p>
                  <SortSelect value={sortBy} onChange={setSortBy} options={sortOptions} />
                </div>

                {/* Compact List Header */}
                <div className="apple-card overflow-hidden">
                  <div className="flex items-center gap-4 px-4 py-3 bg-[#111] border-b border-white/5 text-xs font-semibold text-gray-500">
                    <div className="w-20 flex-shrink-0">代號</div>
                    <div className="flex-1 min-w-0">公司名稱</div>
                    <div className="w-24 text-right flex-shrink-0">股價</div>
                    <div className="w-20 text-right flex-shrink-0">漲跌 %</div>
                    <div className="w-32 flex-shrink-0 hidden lg:block">產業</div>
                    <div className="w-16 text-right flex-shrink-0 hidden md:block">機構</div>
                    <div className="w-20 text-right flex-shrink-0 hidden lg:block">季變動</div>
                  </div>

                  {/* Stock Rows */}
                  <div className="max-h-[600px] overflow-y-auto">
                    {filteredStocks
                      .filter((stock) => {
                        // Filter out stocks with 0 institutional holders if data is available
                        if (topMovers) {
                          const institutionalData = topMovers.allStocks.find(
                            (s) => s.symbol === stock.symbol
                          );
                          return !institutionalData || institutionalData.investorsHolding > 0;
                        }
                        return true;
                      })
                      .map((stock) => {
                        // Look up institutional data
                        const institutionalData = topMovers?.allStocks.find(
                          (s) => s.symbol === stock.symbol
                        );
                        const previousHolding = institutionalData
                          ? institutionalData.investorsHolding - institutionalData.investorsHoldingChange
                          : 0;
                        const quarterlyChangePercent =
                          institutionalData && previousHolding > 0
                            ? (institutionalData.investorsHoldingChange / previousHolding) * 100
                            : undefined;

                        return (
                          <CompactStockRow
                            key={stock.symbol}
                            symbol={stock.symbol}
                            name={stock.name}
                            sector={stock.sector}
                            price={stock.price}
                            changesPercentage={stock.changesPercentage}
                            institutionalCount={institutionalData?.investorsHolding}
                            quarterlyChange={quarterlyChangePercent}
                            oversoldSignal={oversoldData.get(stock.symbol)?.signal}
                            deviation={oversoldData.get(stock.symbol)?.deviation}
                          />
                        );
                      })}
                  </div>

                  {filteredStocks.length === 0 && (
                    <div className="text-center py-16">
                      <p className="text-gray-500 text-sm">
                        找不到符合的股票 &quot;{searchTerm}&quot;
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
