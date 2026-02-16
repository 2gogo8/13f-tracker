'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { StockQuote, CompanyProfile, FMPInstitutionalHolder, InstitutionalSummary } from '@/types';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStockData() {
      try {
        const [quoteRes, profileRes, instRes] = await Promise.all([
          fetch(`/api/quote/${symbol}`),
          fetch(`/api/profile/${symbol}`),
          fetch(`/api/institutional/${symbol}`),
        ]);

        const quoteData = await quoteRes.json();
        const profileData = await profileRes.json();
        const instData = await instRes.json();

        setQuote(quoteData[0] || null);
        setProfile(profileData[0] || null);
        setHolders(instData.holders || []);
        setSummary(instData.summary || null);
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

  return (
    <div className="min-h-screen py-12 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/" className="text-accent hover:text-accent/80 mb-8 inline-block text-sm font-light tracking-wide">
          ← 返回 S&P 500
        </Link>

        {/* Hero Section */}
        <div className="apple-card p-8 md:p-12 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-primary mb-2">{symbol}</h1>
              <p className="text-2xl text-white font-light mb-2">{profile?.companyName || quote.name}</p>
              <p className="text-sm text-gray-500 font-light">
                {profile?.sector} • {profile?.industry}
              </p>
            </div>
            <div className="text-right">
              <p className="text-5xl font-bold text-white mb-2">${quote.price.toFixed(2)}</p>
              <p className={`text-2xl font-light ${isPositive ? 'text-accent' : 'text-primary'}`}>
                {isPositive ? '+' : ''}${quote.change.toFixed(2)} ({isPositive ? '+' : ''}{(quote.changesPercentage ?? quote.changePercentage ?? 0).toFixed(2)}%)
              </p>
            </div>
          </div>

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

        {/* Institutional Summary */}
        {summary && (
          <div className="apple-card p-8 mb-8">
            <h2 className="text-2xl font-bold mb-2">13F 機構持倉摘要</h2>
            <p className="text-xs text-gray-500 font-light mb-8">統計期間：{summary.date}</p>
            
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

        {/* Top 20 Institutional Holders */}
        <div className="apple-card p-8 mb-8">
          <h2 className="text-2xl font-bold mb-8">前 20 大機構持倉</h2>
          
          {holders.length === 0 ? (
            <p className="text-gray-500 text-center py-12 font-light">暫無機構持倉資料</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-white/5">
                    <th className="text-left py-4 px-3 font-light">#</th>
                    <th className="text-left py-4 px-3 font-light">機構名稱</th>
                    <th className="text-right py-4 px-3 font-light">持股數</th>
                    <th className="text-right py-4 px-3 font-light">持倉市值</th>
                    <th className="text-right py-4 px-3 font-light">持股比例</th>
                    <th className="text-right py-4 px-3 font-light">增減股數</th>
                    <th className="text-right py-4 px-3 font-light">增減%</th>
                    <th className="text-center py-4 px-3 font-light">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map((h, i) => {
                    const chgPct = h.changeInSharesNumberPercentage;
                    const isUp = h.changeInSharesNumber > 0;
                    const isDown = h.changeInSharesNumber < 0;
                    return (
                      <tr key={`${h.cik}-${i}`} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 px-3 text-gray-500 border-b border-white/5">{i + 1}</td>
                        <td className="py-4 px-3 border-b border-white/5">
                          <p className="font-medium text-sm">{h.investorName}</p>
                          <p className="text-xs text-gray-500 mt-0.5">自 {h.firstAdded} • {h.holdingPeriod}Q</p>
                        </td>
                        <td className="text-right py-4 px-3 font-semibold border-b border-white/5">{formatShares(h.sharesNumber)}</td>
                        <td className="text-right py-4 px-3 font-semibold border-b border-white/5">{formatNumber(h.marketValue)}</td>
                        <td className="text-right py-4 px-3 font-semibold border-b border-white/5">{h.ownership?.toFixed(2)}%</td>
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

        {/* Company Description */}
        {profile?.description && (
          <div className="apple-card p-8">
            <h2 className="text-2xl font-bold mb-6">關於 {profile.companyName}</h2>
            <p className="text-gray-300 leading-relaxed text-base font-light mb-8">{profile.description}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-white/5">
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">執行長</p>
                <p className="text-sm font-semibold">{profile.ceo || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">員工數</p>
                <p className="text-sm font-semibold">{Number(profile.fullTimeEmployees).toLocaleString() || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">總部</p>
                <p className="text-sm font-semibold">{profile.city}, {profile.state}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">官網</p>
                <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent/80 transition-colors">
                  {profile.website?.replace('https://', '')}
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
