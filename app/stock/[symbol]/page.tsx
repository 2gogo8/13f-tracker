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
          <p className="mt-4 text-gray-400">載入中 {symbol}...</p>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-xl">Failed to load stock data</p>
          <Link href="/" className="text-primary hover:text-accent mt-4 inline-block">← Back</Link>
        </div>
      </div>
    );
  }

  const isPositive = quote.change >= 0;

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/" className="text-primary hover:text-accent mb-6 inline-block text-sm">
          ← 返回 S&P 500
        </Link>

        {/* Header */}
        <div className="bg-secondary border border-border rounded-lg p-6 mb-6 hover:border-accent/30 transition-colors">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-primary">{symbol}</h1>
              <p className="text-xl text-gray-300">{profile?.companyName || quote.name}</p>
              <p className="text-sm text-gray-500 mt-1">
                {profile?.sector} • {profile?.industry}
              </p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold">${quote.price.toFixed(2)}</p>
              <p className={`text-xl ${isPositive ? 'text-accent' : 'text-primary'}`}>
                {isPositive ? '+' : ''}${quote.change.toFixed(2)} ({isPositive ? '+' : ''}{(quote.changesPercentage ?? quote.changePercentage ?? 0).toFixed(2)}%)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t border-border">
            <div>
              <p className="text-xs text-gray-500 font-light">市值</p>
              <p className="text-sm font-bold">{formatNumber(quote.marketCap)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-light">成交量</p>
              <p className="text-sm font-bold">{formatShares(quote.volume)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-light">52週區間</p>
              <p className="text-sm font-bold">${quote.yearLow.toFixed(0)} - ${quote.yearHigh.toFixed(0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-light">50日均</p>
              <p className="text-sm font-bold">${quote.priceAvg50?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-light">200日均</p>
              <p className="text-sm font-bold">${quote.priceAvg200?.toFixed(2) || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Institutional Summary */}
        {summary && (
          <div className="bg-secondary border border-border rounded-lg p-6 mb-6 hover:border-accent/30 transition-colors">
            <h2 className="text-xl font-bold mb-1">13F 機構持倉摘要</h2>
            <p className="text-xs text-gray-500 font-light mb-4">統計期間：{summary.date}</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="text-center p-3 bg-background rounded-lg border border-border">
                <p className="text-2xl font-bold text-primary">{summary.investorsHolding?.toLocaleString()}</p>
                <p className="text-xs text-gray-500 font-light mt-1">持倉機構數</p>
                <p className={`text-xs mt-0.5 ${summary.investorsHoldingChange >= 0 ? 'text-accent' : 'text-primary'}`}>
                  {summary.investorsHoldingChange >= 0 ? '+' : ''}{summary.investorsHoldingChange} 較上季
                </p>
              </div>
              <div className="text-center p-3 bg-background rounded-lg border border-border">
                <p className="text-2xl font-bold">{formatNumber(summary.totalInvested)}</p>
                <p className="text-xs text-gray-500 font-light mt-1">總投資金額</p>
                <p className={`text-xs mt-0.5 ${summary.totalInvestedChange >= 0 ? 'text-accent' : 'text-primary'}`}>
                  {summary.totalInvestedChange >= 0 ? '+' : ''}{formatNumber(summary.totalInvestedChange)}
                </p>
              </div>
              <div className="text-center p-3 bg-background rounded-lg border border-border">
                <p className="text-2xl font-bold">{summary.ownershipPercent?.toFixed(1)}%</p>
                <p className="text-xs text-gray-500 font-light mt-1">機構持股比例</p>
              </div>
              <div className="text-center p-3 bg-background rounded-lg border border-border">
                <p className="text-2xl font-bold">{summary.putCallRatio?.toFixed(2)}</p>
                <p className="text-xs text-gray-500 font-light mt-1">看跌/看漲比</p>
                <p className={`text-xs mt-0.5 ${(summary.putCallRatio || 0) <= 1 ? 'text-accent' : 'text-primary'}`}>
                  {(summary.putCallRatio || 0) <= 1 ? '偏多' : '偏空'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-2 bg-background rounded-lg border border-border">
                <p className="text-lg font-bold text-accent">{summary.increasedPositions}</p>
                <p className="text-xs text-gray-500 font-light">增持</p>
              </div>
              <div className="text-center p-2 bg-background rounded-lg border border-border">
                <p className="text-lg font-bold text-primary">{summary.reducedPositions}</p>
                <p className="text-xs text-gray-500 font-light">減持</p>
              </div>
              <div className="text-center p-2 bg-background rounded-lg border border-border">
                <p className="text-lg font-bold text-accent">{summary.newPositions}</p>
                <p className="text-xs text-gray-500 font-light">新進</p>
              </div>
              <div className="text-center p-2 bg-background rounded-lg border border-border">
                <p className="text-lg font-bold text-gray-400">{summary.closedPositions}</p>
                <p className="text-xs text-gray-500 font-light">清倉</p>
              </div>
            </div>
          </div>
        )}

        {/* Top 20 Institutional Holders */}
        <div className="bg-secondary border border-border rounded-lg p-6 mb-6 hover:border-accent/30 transition-colors">
          <h2 className="text-xl font-bold mb-4">前 20 大機構持倉</h2>
          
          {holders.length === 0 ? (
            <p className="text-gray-400 text-center py-8">暫無機構持倉資料</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-gray-500">
                    <th className="text-left py-2 px-2 font-light">#</th>
                    <th className="text-left py-2 px-2 font-light">機構名稱</th>
                    <th className="text-right py-2 px-2 font-light">持股數</th>
                    <th className="text-right py-2 px-2 font-light">持倉市值</th>
                    <th className="text-right py-2 px-2 font-light">持股比例</th>
                    <th className="text-right py-2 px-2 font-light">增減股數</th>
                    <th className="text-right py-2 px-2 font-light">增減%</th>
                    <th className="text-center py-2 px-2 font-light">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map((h, i) => {
                    const chgPct = h.changeInSharesNumberPercentage;
                    const isUp = h.changeInSharesNumber > 0;
                    const isDown = h.changeInSharesNumber < 0;
                    return (
                      <tr key={`${h.cik}-${i}`} className="border-b border-border/50 hover:bg-background/50 hover:shadow-[0_0_10px_rgba(212,175,55,0.1)] transition-all">
                        <td className="py-2.5 px-2 text-gray-500">{i + 1}</td>
                        <td className="py-2.5 px-2">
                          <p className="font-medium text-sm">{h.investorName}</p>
                          <p className="text-xs text-gray-500">自 {h.firstAdded} • {h.holdingPeriod}Q</p>
                        </td>
                        <td className="text-right py-2.5 px-2 font-bold">{formatShares(h.sharesNumber)}</td>
                        <td className="text-right py-2.5 px-2 font-bold">{formatNumber(h.marketValue)}</td>
                        <td className="text-right py-2.5 px-2 font-bold">{h.ownership?.toFixed(2)}%</td>
                        <td className={`text-right py-2.5 px-2 ${isUp ? 'text-accent' : isDown ? 'text-primary' : 'text-gray-400'}`}>
                          {isUp ? '+' : ''}{formatShares(h.changeInSharesNumber)}
                        </td>
                        <td className={`text-right py-2.5 px-2 ${isUp ? 'text-accent' : isDown ? 'text-primary' : 'text-gray-400'}`}>
                          {isUp ? '+' : ''}{chgPct?.toFixed(1)}%
                        </td>
                        <td className="text-center py-2.5 px-2">
                          {h.isNew ? (
                            <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded border border-accent/30">新進</span>
                          ) : h.isSoldOut ? (
                            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded border border-primary/30">清倉</span>
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
          <div className="bg-secondary border border-border rounded-lg p-6 hover:border-accent/30 transition-colors">
            <h2 className="text-xl font-bold mb-4">關於 {profile.companyName}</h2>
            <p className="text-gray-300 leading-relaxed text-sm">{profile.description}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
              <div>
                <p className="text-xs text-gray-500 font-light">執行長</p>
                <p className="text-sm font-bold">{profile.ceo || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light">員工數</p>
                <p className="text-sm font-bold">{Number(profile.fullTimeEmployees).toLocaleString() || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light">總部</p>
                <p className="text-sm font-bold">{profile.city}, {profile.state}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light">官網</p>
                <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:text-accent transition-colors">
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
