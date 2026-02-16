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
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="mt-4 text-gray-400">Loading {symbol}...</p>
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
          ← Back to S&P 500
        </Link>

        {/* Header */}
        <div className="bg-secondary border border-gray-800 rounded-lg p-6 mb-6">
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
              <p className={`text-xl ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}${quote.change.toFixed(2)} ({isPositive ? '+' : ''}{(quote.changesPercentage ?? quote.changePercentage ?? 0).toFixed(2)}%)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t border-gray-800">
            <div>
              <p className="text-xs text-gray-500">Market Cap</p>
              <p className="text-sm font-medium">{formatNumber(quote.marketCap)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Volume</p>
              <p className="text-sm font-medium">{formatShares(quote.volume)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">52W Range</p>
              <p className="text-sm font-medium">${quote.yearLow.toFixed(0)} - ${quote.yearHigh.toFixed(0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">50D Avg</p>
              <p className="text-sm font-medium">${quote.priceAvg50?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">200D Avg</p>
              <p className="text-sm font-medium">${quote.priceAvg200?.toFixed(2) || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Institutional Summary */}
        {summary && (
          <div className="bg-secondary border border-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-1">13F Institutional Summary</h2>
            <p className="text-xs text-gray-500 mb-4">Period: {summary.date}</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="text-center p-3 bg-background rounded-lg">
                <p className="text-2xl font-bold text-primary">{summary.investorsHolding?.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Institutional Holders</p>
                <p className={`text-xs mt-0.5 ${summary.investorsHoldingChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {summary.investorsHoldingChange >= 0 ? '+' : ''}{summary.investorsHoldingChange} vs prev Q
                </p>
              </div>
              <div className="text-center p-3 bg-background rounded-lg">
                <p className="text-2xl font-bold">{formatNumber(summary.totalInvested)}</p>
                <p className="text-xs text-gray-500 mt-1">Total Invested</p>
                <p className={`text-xs mt-0.5 ${summary.totalInvestedChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {summary.totalInvestedChange >= 0 ? '+' : ''}{formatNumber(summary.totalInvestedChange)}
                </p>
              </div>
              <div className="text-center p-3 bg-background rounded-lg">
                <p className="text-2xl font-bold">{summary.ownershipPercent?.toFixed(1)}%</p>
                <p className="text-xs text-gray-500 mt-1">Institutional Ownership</p>
              </div>
              <div className="text-center p-3 bg-background rounded-lg">
                <p className="text-2xl font-bold">{summary.putCallRatio?.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">Put/Call Ratio</p>
                <p className={`text-xs mt-0.5 ${(summary.putCallRatio || 0) <= 1 ? 'text-green-500' : 'text-red-500'}`}>
                  {(summary.putCallRatio || 0) <= 1 ? 'Bullish' : 'Bearish'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-2 bg-background rounded-lg">
                <p className="text-lg font-bold text-green-500">{summary.increasedPositions}</p>
                <p className="text-xs text-gray-500">Increased</p>
              </div>
              <div className="text-center p-2 bg-background rounded-lg">
                <p className="text-lg font-bold text-red-500">{summary.reducedPositions}</p>
                <p className="text-xs text-gray-500">Reduced</p>
              </div>
              <div className="text-center p-2 bg-background rounded-lg">
                <p className="text-lg font-bold text-accent">{summary.newPositions}</p>
                <p className="text-xs text-gray-500">New</p>
              </div>
              <div className="text-center p-2 bg-background rounded-lg">
                <p className="text-lg font-bold text-gray-400">{summary.closedPositions}</p>
                <p className="text-xs text-gray-500">Closed</p>
              </div>
            </div>
          </div>
        )}

        {/* Top 20 Institutional Holders */}
        <div className="bg-secondary border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Top 20 Institutional Holders</h2>
          
          {holders.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No institutional holders data available</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <th className="text-left py-2 px-2 font-medium">#</th>
                    <th className="text-left py-2 px-2 font-medium">Institution</th>
                    <th className="text-right py-2 px-2 font-medium">Shares</th>
                    <th className="text-right py-2 px-2 font-medium">Market Value</th>
                    <th className="text-right py-2 px-2 font-medium">Ownership</th>
                    <th className="text-right py-2 px-2 font-medium">Δ Shares</th>
                    <th className="text-right py-2 px-2 font-medium">Δ %</th>
                    <th className="text-center py-2 px-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map((h, i) => {
                    const chgPct = h.changeInSharesNumberPercentage;
                    const isUp = h.changeInSharesNumber > 0;
                    const isDown = h.changeInSharesNumber < 0;
                    return (
                      <tr key={`${h.cik}-${i}`} className="border-b border-gray-800/50 hover:bg-background transition-colors">
                        <td className="py-2.5 px-2 text-gray-500">{i + 1}</td>
                        <td className="py-2.5 px-2">
                          <p className="font-medium text-sm">{h.investorName}</p>
                          <p className="text-xs text-gray-500">Since {h.firstAdded} • {h.holdingPeriod}Q</p>
                        </td>
                        <td className="text-right py-2.5 px-2">{formatShares(h.sharesNumber)}</td>
                        <td className="text-right py-2.5 px-2">{formatNumber(h.marketValue)}</td>
                        <td className="text-right py-2.5 px-2">{h.ownership?.toFixed(2)}%</td>
                        <td className={`text-right py-2.5 px-2 ${isUp ? 'text-green-500' : isDown ? 'text-red-500' : 'text-gray-400'}`}>
                          {isUp ? '+' : ''}{formatShares(h.changeInSharesNumber)}
                        </td>
                        <td className={`text-right py-2.5 px-2 ${isUp ? 'text-green-500' : isDown ? 'text-red-500' : 'text-gray-400'}`}>
                          {isUp ? '+' : ''}{chgPct?.toFixed(1)}%
                        </td>
                        <td className="text-center py-2.5 px-2">
                          {h.isNew ? (
                            <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded">NEW</span>
                          ) : h.isSoldOut ? (
                            <span className="text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded">SOLD</span>
                          ) : isUp ? (
                            <span className="text-xs text-green-500">▲</span>
                          ) : isDown ? (
                            <span className="text-xs text-red-500">▼</span>
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
          <div className="bg-secondary border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">About {profile.companyName}</h2>
            <p className="text-gray-300 leading-relaxed text-sm">{profile.description}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-800">
              <div>
                <p className="text-xs text-gray-500">CEO</p>
                <p className="text-sm">{profile.ceo || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Employees</p>
                <p className="text-sm">{Number(profile.fullTimeEmployees).toLocaleString() || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">HQ</p>
                <p className="text-sm">{profile.city}, {profile.state}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Website</p>
                <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:text-accent">
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
