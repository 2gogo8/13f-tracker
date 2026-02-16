'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { StockQuote, CompanyProfile, FMPInstitutionalHolder, InstitutionalSummary, QuarterlyTrendData, HistoricalPrice } from '@/types';
import PieChart, { PieSlice } from '@/components/PieChart';
import PriceChart from '@/components/PriceChart';
import SupplyChain from '@/components/SupplyChain';
import CommentSection from '@/components/CommentSection';
import { getSupplyChain } from '@/data/supply-chain';

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function formatShares(n: number): string {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}

// Smart Money classification
type InvestorType = 'passive' | 'active';

function classifyInvestor(investorName: string): InvestorType {
  const name = investorName.toUpperCase();
  const passiveKeywords = [
    'VANGUARD',
    'BLACKROCK',
    'STATE STREET',
    'ISHARES',
    'SPDR',
    'INDEX',
    'PASSIVE',
    'ETF TRUST',
    'SCHWAB',
    'SSG',
    'SSGA'
  ];
  
  for (const keyword of passiveKeywords) {
    if (name.includes(keyword)) {
      return 'passive';
    }
  }
  
  return 'active';
}

function getConvictionWeight(holder: FMPInstitutionalHolder): number | null {
  // Try portfolioPercent or securityPercentOfPortfolio from API
  if (holder.portfolioPercent !== undefined && holder.portfolioPercent !== null) {
    return holder.portfolioPercent;
  }
  if (holder.securityPercentOfPortfolio !== undefined && holder.securityPercentOfPortfolio !== null) {
    return holder.securityPercentOfPortfolio;
  }
  // FMP weight field might be the portfolio weight (0-100)
  if (holder.weight !== undefined && holder.weight !== null && holder.weight > 0) {
    return holder.weight;
  }
  return null;
}

export default function StockDetailPage({ 
  params 
}: { 
  params: Promise<{ symbol: string }> 
}) {
  const { symbol } = use(params);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [holders, setHolders] = useState<FMPInstitutionalHolder[]>([]);
  const [summary, setSummary] = useState<InstitutionalSummary | null>(null);
  const [quarterlyTrend, setQuarterlyTrend] = useState<QuarterlyTrendData[]>([]);
  const [historicalData, setHistoricalData] = useState<HistoricalPrice[]>([]);
  const [stockNews, setStockNews] = useState<{ title: string; text: string; url: string; image?: string; site: string; date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'active' | 'passive'>('active');

  useEffect(() => {
    async function fetchStockData() {
      try {
        const [quoteRes, profileRes, instRes, trendRes, historicalRes] = await Promise.all([
          fetch(`/api/quote/${symbol}`),
          fetch(`/api/profile/${symbol}`),
          fetch(`/api/institutional/${symbol}`),
          fetch(`/api/institutional-trend/${symbol}`),
          fetch(`/api/historical/${symbol}`),
        ]);

        const quoteData = await quoteRes.json();
        const profileData = await profileRes.json();
        const instData = await instRes.json();
        const trendData = await trendRes.json();
        const historicalDataResponse = await historicalRes.json();

        setQuote(quoteData[0] || null);
        setProfile(profileData[0] || null);
        setHolders(instData.holders || []);
        setSummary(instData.summary || null);
        setQuarterlyTrend(Array.isArray(trendData) ? trendData : []);
        setHistoricalData(historicalDataResponse.historical || []);

        // Fetch news separately (non-blocking)
        fetch(`/api/stock-news/${symbol}`)
          .then(r => r.json())
          .then(d => { if (Array.isArray(d)) setStockNews(d); })
          .catch(() => {});

        setLoading(false);
      } catch (error) {
        console.error('Error fetching stock data:', error);
        setLoading(false);
      }
    }
    fetchStockData();
  }, [symbol]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
          <p className="mt-6 text-gray-500 font-light">載入中 {symbol}...</p>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-primary text-xl">無法載入股票資料</p>
          <Link href="/" className="text-accent hover:text-accent/80 mt-6 inline-block">← 返回</Link>
        </div>
      </div>
    );
  }

  const isPositive = quote.change >= 0;

  // Calculate ATR (14-day Average True Range)
  const atr14 = (() => {
    if (historicalData.length < 15) return null;
    // historicalData is newest-first, reverse for chronological
    const sorted = [...historicalData].reverse();
    const trValues: number[] = [];
    for (let i = 1; i < sorted.length && trValues.length < 14; i++) {
      const high = sorted[i].high ?? 0;
      const low = sorted[i].low ?? 0;
      const prevClose = sorted[i - 1].close ?? 0;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trValues.push(tr);
    }
    if (trValues.length === 0) return null;
    return trValues.reduce((a, b) => a + b, 0) / trValues.length;
  })();
  const atrPercent = atr14 && quote.price ? (atr14 / quote.price) * 100 : null;

  // Calculate SMA20 and Oversold/Overbought Signal
  const sma20 = (() => {
    if (historicalData.length < 20) return null;
    const recent20 = historicalData.slice(0, 20); // newest-first
    return recent20.reduce((sum, d) => sum + (d.close ?? 0), 0) / 20;
  })();

  type SignalLevel = 'deep-value' | 'oversold' | 'normal' | 'overbought';
  const signalLevel: SignalLevel = (() => {
    if (!sma20 || !atr14) return 'normal';
    const price = quote.price;
    if (price < sma20 - 3 * atr14) return 'deep-value';
    if (price < sma20 - 2 * atr14) return 'oversold';
    if (price > sma20 + 2 * atr14) return 'overbought';
    return 'normal';
  })();

  const signalConfig: Record<SignalLevel, { emoji: string; label: string; color: string; bg: string }> = {
    'deep-value': { emoji: '🟢', label: '極度超跌', color: 'text-green-400', bg: 'bg-green-900/40' },
    'oversold':   { emoji: '🔵', label: '超跌區域', color: 'text-blue-400', bg: 'bg-blue-900/40' },
    'normal':     { emoji: '⚪', label: '正常波動', color: 'text-gray-400', bg: 'bg-gray-800/40' },
    'overbought': { emoji: '🔴', label: '過熱', color: 'text-red-400', bg: 'bg-red-900/40' },
  };
  const signal = signalConfig[signalLevel];
  const deviation = sma20 && atr14 ? (quote.price - sma20) / atr14 : null;

  // Filter and sort holders based on Smart Money filter
  const filteredAndSortedHolders = (() => {
    let filtered = [...holders];
    
    if (filterType === 'active') {
      // Sort active managers first, then passive
      filtered.sort((a, b) => {
        const typeA = classifyInvestor(a.investorName);
        const typeB = classifyInvestor(b.investorName);
        if (typeA === 'active' && typeB === 'passive') return -1;
        if (typeA === 'passive' && typeB === 'active') return 1;
        return 0;
      });
    } else if (filterType === 'passive') {
      // Show only passive
      filtered = filtered.filter(h => classifyInvestor(h.investorName) === 'passive');
    }
    // 'all' shows everything as-is
    
    return filtered;
  })();

  // Prepare pie chart data for institutional holdings
  const pieColors = [
    '#C41E3A', '#D4AF37', '#8B0000', '#B8860B', '#FF6B6B', 
    '#FFD700', '#CD5C5C', '#DAA520', '#E8A87C', '#85677B'
  ];

  const institutionalPieData: PieSlice[] = holders.length > 0 ? (() => {
    const top10 = holders.slice(0, 10);
    const rest = holders.slice(10);
    
    const top10Data: PieSlice[] = top10.map((holder, index) => ({
      label: holder.investorName,
      value: holder.ownership || 0,
      color: pieColors[index] || '#666'
    }));

    if (rest.length > 0) {
      const restOwnership = rest.reduce((sum, h) => sum + (h.ownership || 0), 0);
      if (restOwnership > 0) {
        top10Data.push({
          label: '其他機構',
          value: restOwnership,
          color: '#555'
        });
      }
    }

    return top10Data;
  })() : [];

  return (
    <div className="min-h-screen py-12 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/" className="text-accent hover:text-accent/80 mb-8 inline-block text-sm font-light tracking-wide">
          ← 返回 S&P 500
        </Link>

        {/* Hero Section */}
        <div className="apple-card p-8 md:p-12 mb-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-10">
            <div>
              <h1 className="font-serif text-4xl md:text-5xl font-bold text-primary glow-red mb-3">{symbol}</h1>
              <p className="text-2xl text-white font-light mb-2">{profile?.companyName || quote.name}</p>
              <p className="text-sm text-gray-600 font-light tracking-wide">
                {profile?.sector} • {profile?.industry}
              </p>
            </div>
            <div className="text-right">
              <p className="text-5xl font-bold text-white glow-white mb-2">${quote.price.toFixed(2)}</p>
              <p className={`text-2xl font-light ${isPositive ? 'text-accent glow-gold' : 'text-primary glow-red'}`}>
                {isPositive ? '+' : ''}${quote.change.toFixed(2)} ({isPositive ? '+' : ''}{(quote.changesPercentage ?? quote.changePercentage ?? 0).toFixed(2)}%)
              </p>
              {atr14 !== null && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3 justify-end">
                    <span className="text-xs text-gray-500">ATR(14)</span>
                    <span className="text-sm font-semibold text-white">${atr14.toFixed(2)}</span>
                    {atrPercent !== null && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        atrPercent >= 4 ? 'bg-red-900/40 text-red-400' :
                        atrPercent >= 2 ? 'bg-yellow-900/40 text-yellow-400' :
                        'bg-green-900/40 text-green-400'
                      }`}>
                        {atrPercent.toFixed(1)}% 波動
                      </span>
                    )}
                  </div>
                  {sma20 !== null && (
                    <div className="flex items-center gap-3 justify-end">
                      <span className="text-xs text-gray-500">SMA(20)</span>
                      <span className="text-sm text-gray-300">${sma20.toFixed(2)}</span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${signal.bg} ${signal.color}`}>
                        {signal.emoji} {signal.label}
                      </span>
                      {deviation !== null && (
                        <span className="text-xs text-gray-500">
                          乖離 {deviation >= 0 ? '+' : ''}{deviation.toFixed(1)}σ
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Price Chart - between price and stats */}
          {historicalData.length > 0 && (
            <div className="pt-6 pb-2">
              <PriceChart data={historicalData} symbol={symbol} inline />
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 pt-8 border-t border-white/5">
            <div>
              <p className="text-xs text-gray-500 font-light mb-2">市值</p>
              <p className="text-lg font-semibold">{formatNumber(quote.marketCap)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-light mb-2">成交量</p>
              <p className="text-lg font-semibold">{formatShares(quote.volume)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-light mb-2">52週區間</p>
              <p className="text-lg font-semibold">${quote.yearLow.toFixed(0)} - ${quote.yearHigh.toFixed(0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-light mb-2">50日均</p>
              <p className="text-lg font-semibold">${quote.priceAvg50?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-light mb-2">200日均</p>
              <p className="text-lg font-semibold">${quote.priceAvg200?.toFixed(2) || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* 近期重大發展 */}
        {stockNews.length > 0 && (
          <div className="apple-card p-6 md:p-8 mb-10">
            <h2 className="text-2xl font-bold mb-6">近期重大發展</h2>
            <div className="space-y-6">
              {stockNews.map((news, i) => (
                <div
                  key={i}
                  className="p-4 bg-black/40 rounded-xl border-l-2 border-accent/50"
                >
                  <h3 className="text-base font-semibold text-white mb-3 leading-relaxed">{news.title}</h3>
                  <p className="text-sm text-gray-300 leading-relaxed mb-3 whitespace-pre-line">{news.text}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{news.site}</span>
                    <div className="flex items-center gap-3">
                      <span>{news.date ? new Date(news.date).toLocaleDateString('zh-TW') : ''}</span>
                      <a
                        href={news.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:text-accent/80"
                      >
                        原文 →
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comment / Q&A Section */}
        <CommentSection symbol={symbol} />

        {/* Supply Chain */}
        {(() => {
          const suppliers = getSupplyChain(symbol);
          return suppliers.length > 0 ? (
            <SupplyChain symbol={symbol} suppliers={suppliers} />
          ) : null;
        })()}

        {/* Price chart moved into hero card above */}

        {/* Institutional Summary */}
        {summary && (
          <div className="apple-card p-8 mb-10">
            <h2 className="text-2xl font-bold mb-2">13F 機構持倉摘要</h2>
            <p className="text-xs text-gray-500 font-light mb-10">統計期間：{summary.date}</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-5 bg-black/40 rounded-2xl">
                <p className="text-3xl font-bold text-primary mb-1">{summary.investorsHolding?.toLocaleString()}</p>
                <p className="text-xs text-gray-500 font-light mb-2">持倉機構數</p>
                <p className={`text-xs ${summary.investorsHoldingChange >= 0 ? 'text-accent' : 'text-primary'}`}>
                  {summary.investorsHoldingChange >= 0 ? '+' : ''}{summary.investorsHoldingChange} 較上季
                </p>
              </div>
              <div className="text-center p-5 bg-black/40 rounded-2xl">
                <p className="text-3xl font-bold mb-1">{formatNumber(summary.totalInvested)}</p>
                <p className="text-xs text-gray-500 font-light mb-2">總投資金額</p>
                <p className={`text-xs ${summary.totalInvestedChange >= 0 ? 'text-accent' : 'text-primary'}`}>
                  {summary.totalInvestedChange >= 0 ? '+' : ''}{formatNumber(summary.totalInvestedChange)}
                </p>
              </div>
              <div className="text-center p-5 bg-black/40 rounded-2xl">
                <p className="text-3xl font-bold mb-1">{summary.ownershipPercent?.toFixed(1)}%</p>
                <p className="text-xs text-gray-500 font-light mb-2">機構持股比例</p>
              </div>
              <div className="text-center p-5 bg-black/40 rounded-2xl">
                <p className="text-3xl font-bold mb-1">{summary.putCallRatio?.toFixed(2)}</p>
                <p className="text-xs text-gray-500 font-light mb-2">看跌/看漲比</p>
                <p className={`text-xs ${(summary.putCallRatio || 0) <= 1 ? 'text-accent' : 'text-primary'}`}>
                  {(summary.putCallRatio || 0) <= 1 ? '偏多' : '偏空'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-4 bg-black/40 rounded-xl">
                <p className="text-2xl font-bold text-accent mb-1">{summary.increasedPositions}</p>
                <p className="text-xs text-gray-500 font-light">增持</p>
              </div>
              <div className="text-center p-4 bg-black/40 rounded-xl">
                <p className="text-2xl font-bold text-primary mb-1">{summary.reducedPositions}</p>
                <p className="text-xs text-gray-500 font-light">減持</p>
              </div>
              <div className="text-center p-4 bg-black/40 rounded-xl">
                <p className="text-2xl font-bold text-accent mb-1">{summary.newPositions}</p>
                <p className="text-xs text-gray-500 font-light">新進</p>
              </div>
              <div className="text-center p-4 bg-black/40 rounded-xl">
                <p className="text-2xl font-bold text-gray-400 mb-1">{summary.closedPositions}</p>
                <p className="text-xs text-gray-500 font-light">清倉</p>
              </div>
            </div>
          </div>
        )}

        {/* Quarterly Trend Bar Chart */}
        {quarterlyTrend.length > 0 && (
          <div className="apple-card p-8 mb-10">
            <h2 className="text-2xl font-bold mb-10">機構持倉季度趨勢</h2>
            <div className="flex items-end justify-around gap-4 h-64">
              {quarterlyTrend.map((data, index) => {
                const prevValue = index > 0 ? quarterlyTrend[index - 1].totalInvested : data.totalInvested;
                const isIncrease = data.totalInvested >= prevValue;
                const maxValue = Math.max(...quarterlyTrend.map(d => d.totalInvested));
                const heightPercent = (data.totalInvested / maxValue) * 100;
                const barColor = index === 0 ? '#666' : isIncrease ? '#D4AF37' : '#C41E3A';
                
                return (
                  <div key={data.quarter} className="flex-1 flex flex-col items-center">
                    <div className="w-full flex flex-col items-center justify-end" style={{ height: '200px' }}>
                      <div className="text-xs text-gray-400 mb-2 font-medium">
                        {formatNumber(data.totalInvested)}
                      </div>
                      <div 
                        className="w-full rounded-t-lg transition-all duration-300 hover:opacity-80"
                        style={{ 
                          backgroundColor: barColor,
                          height: `${heightPercent}%`,
                          minHeight: '8px'
                        }}
                      />
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-sm font-semibold text-white">{data.quarter}</p>
                      <p className="text-xs text-gray-500 mt-1">{data.investorsHolding} 機構</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Institutional Holdings Pie Chart */}
        {institutionalPieData.length > 0 && (
          <div className="mb-10">
            <PieChart
              data={institutionalPieData}
              title="機構持股比例"
              size={300}
            />
          </div>
        )}

        {/* Top 20 Institutional Holders */}
        <div className="apple-card p-8 mb-10">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-bold">前 20 大機構持倉</h2>
            
            {/* Smart Money Filter Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilterType('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filterType === 'all'
                    ? 'bg-primary text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setFilterType('active')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filterType === 'active'
                    ? 'bg-primary text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                🎯 主動型優先
              </button>
              <button
                onClick={() => setFilterType('passive')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filterType === 'passive'
                    ? 'bg-primary text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                🏦 被動型
              </button>
            </div>
          </div>
          
          {holders.length === 0 ? (
            <p className="text-gray-500 text-center py-12 font-light">暫無機構持倉資料</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-white/5">
                    <th className="text-left py-4 px-3 font-light">#</th>
                    <th className="text-left py-4 px-3 font-light">類型</th>
                    <th className="text-left py-4 px-3 font-light">機構名稱</th>
                    <th className="text-right py-4 px-3 font-light">持股數</th>
                    <th className="text-right py-4 px-3 font-light">持倉市值</th>
                    <th className="text-right py-4 px-3 font-light">持股比例</th>
                    <th className="text-right py-4 px-3 font-light">信念權重</th>
                    <th className="text-right py-4 px-3 font-light">增減股數</th>
                    <th className="text-right py-4 px-3 font-light">增減%</th>
                    <th className="text-center py-4 px-3 font-light">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedHolders.map((h, i) => {
                    const chgPct = h.changeInSharesNumberPercentage;
                    const isUp = h.changeInSharesNumber > 0;
                    const isDown = h.changeInSharesNumber < 0;
                    const investorType = classifyInvestor(h.investorName);
                    const convictionWeight = getConvictionWeight(h);
                    
                    return (
                      <tr key={`${h.cik}-${i}`} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 px-3 text-gray-500 border-b border-white/5">{i + 1}</td>
                        <td className="py-4 px-3 border-b border-white/5">
                          <span className="text-xs">
                            {investorType === 'passive' ? '🏦' : '🎯'}
                          </span>
                        </td>
                        <td className="py-4 px-3 border-b border-white/5">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium text-sm">{h.investorName}</p>
                              <p className="text-xs text-gray-500 mt-0.5">自 {h.firstAdded} • {h.holdingPeriod}Q</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-right py-4 px-3 font-semibold border-b border-white/5">{formatShares(h.sharesNumber)}</td>
                        <td className="text-right py-4 px-3 font-semibold border-b border-white/5">{formatNumber(h.marketValue)}</td>
                        <td className="text-right py-4 px-3 font-semibold border-b border-white/5">{h.ownership?.toFixed(2)}%</td>
                        <td className="text-right py-4 px-3 font-semibold border-b border-white/5">
                          {convictionWeight !== null ? (
                            <span className={`${
                              convictionWeight > 10 
                                ? 'text-primary font-bold' 
                                : convictionWeight > 5 
                                ? 'text-primary' 
                                : ''
                            }`}>
                              {convictionWeight.toFixed(2)}%
                              {convictionWeight > 10 ? ' ⚡' : convictionWeight > 5 ? ' 🔥' : ''}
                            </span>
                          ) : (
                            <span className="text-gray-500">N/A</span>
                          )}
                        </td>
                        <td className={`text-right py-4 px-3 border-b border-white/5 ${isUp ? 'text-accent' : isDown ? 'text-primary' : 'text-gray-500'}`}>
                          {isUp ? '+' : ''}{formatShares(h.changeInSharesNumber)}
                        </td>
                        <td className={`text-right py-4 px-3 border-b border-white/5 ${isUp ? 'text-accent' : isDown ? 'text-primary' : 'text-gray-500'}`}>
                          {isUp ? '+' : ''}{chgPct?.toFixed(1)}%
                        </td>
                        <td className="text-center py-4 px-3 border-b border-white/5">
                          {h.isNew ? (
                            <span className="text-xs bg-accent/10 text-accent px-2.5 py-1 rounded-lg">新進</span>
                          ) : h.isSoldOut ? (
                            <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-lg">清倉</span>
                          ) : isUp ? (
                            <span className="text-xs text-accent">▲</span>
                          ) : isDown ? (
                            <span className="text-xs text-primary">▼</span>
                          ) : (
                            <span className="text-xs text-gray-500">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 公司簡介 */}
        {profile && (
          <div className="apple-card p-8">
            <h2 className="text-2xl font-bold mb-6">關於 {profile.companyName}</h2>
            {(profile.descriptionZh || profile.description) && (
              <p className="text-gray-300 leading-relaxed text-base font-light mb-10">
                {profile.descriptionZh || profile.description}
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-8 pt-6 border-t border-white/5">
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">公司名稱</p>
                <p className="text-base font-semibold">{profile.companyName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">產業類別</p>
                <p className="text-base font-semibold">{profile.sector} / {profile.industry}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">執行長</p>
                <p className="text-base font-semibold">{profile.ceo || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">員工人數</p>
                <p className="text-base font-semibold">{Number(profile.fullTimeEmployees).toLocaleString() || 'N/A'} 人</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">總部所在地</p>
                <p className="text-base font-semibold">{profile.city}, {profile.state} {profile.country}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">上市交易所</p>
                <p className="text-base font-semibold">{quote.exchange}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">IPO 日期</p>
                <p className="text-base font-semibold">{profile.ipoDate || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">官方網站</p>
                <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-base text-accent hover:text-accent/80 transition-colors">
                  {profile.website?.replace('https://www.', '').replace('https://', '')}
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
