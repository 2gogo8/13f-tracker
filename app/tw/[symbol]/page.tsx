'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import PriceChart from '@/components/PriceChart';
import { twStocks } from '@/data/tw-stocks';
import { HistoricalPrice } from '@/types';

interface TwQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
}

interface HistoricalPriceRaw {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}兆`;
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)}億`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)}萬`;
  return n.toLocaleString();
}

function formatShares(n: number): string {
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)}億`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)}萬`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}

export default function TwStockDetailPage({ 
  params 
}: { 
  params: Promise<{ symbol: string }> 
}) {
  const { symbol } = use(params);
  const [quote, setQuote] = useState<TwQuote | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalPrice[]>([]);
  const [loading, setLoading] = useState(true);

  // Get stock info from tw-stocks.ts
  const stockInfo = twStocks.find(s => s.symbol === symbol);

  useEffect(() => {
    async function fetchStockData() {
      try {
        const [quoteRes, historicalRes] = await Promise.all([
          fetch(`/api/tw/quote/${symbol}`),
          fetch(`/api/tw/historical/${symbol}`),
        ]);

        const quoteData = await quoteRes.json();
        const historicalDataResponse: HistoricalPriceRaw[] = await historicalRes.json();

        setQuote(quoteData);
        // Historical data comes back newest-first, reverse to oldest-first for calculations
        // Convert date from number to string for PriceChart component
        const sortedHistorical: HistoricalPrice[] = Array.isArray(historicalDataResponse) 
          ? [...historicalDataResponse].reverse().map(d => ({
              ...d,
              date: new Date(d.date).toISOString().split('T')[0]
            }))
          : [];
        setHistoricalData(sortedHistorical);

        setLoading(false);
      } catch (error) {
        console.error('Error fetching TW stock data:', error);
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
          <p className="mt-6 text-gray-400 font-light">載入中 {symbol}...</p>
        </div>
      </div>
    );
  }

  if (!quote || quote.price === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-primary text-xl">無法載入股票資料</p>
          <Link href="/" className="text-accent hover:text-accent/80 mt-6 inline-block">← 返回總覽</Link>
        </div>
      </div>
    );
  }

  const isPositive = quote.change >= 0;

  // Calculate ATR (14-day Average True Range)
  const atr14 = (() => {
    if (historicalData.length < 15) return null;
    // historicalData is oldest-first (ascending by date)
    // Take the last 15 entries to calculate ATR from most recent 14 days
    const recent = historicalData.slice(-15);
    const trValues: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const high = recent[i].high ?? 0;
      const low = recent[i].low ?? 0;
      const prevClose = recent[i - 1].close ?? 0;
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
    const recent20 = historicalData.slice(-20); // data is oldest-first, take last 20
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
    'normal':     { emoji: '⚪', label: '正常波動', color: 'text-gray-500', bg: 'bg-gray-100/80' },
    'overbought': { emoji: '🔴', label: '過熱', color: 'text-red-400', bg: 'bg-red-900/40' },
  };
  const signal = signalConfig[signalLevel];
  const deviation = sma20 && atr14 ? (quote.price - sma20) / atr14 : null;

  return (
    <div className="min-h-screen py-12 px-4 md:px-8 relative overflow-hidden">
      {/* Watermark */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center z-0 select-none" aria-hidden="true">
        <div className="text-gray-900/[0.03] text-[120px] md:text-[200px] font-serif font-bold tracking-widest rotate-[-25deg] whitespace-nowrap">
          JG的反市場報告書
        </div>
      </div>
      <div className="max-w-6xl mx-auto relative z-10">
        <Link href="/" className="text-accent hover:text-accent/80 mb-8 inline-block text-sm font-light tracking-wide">
          ← 返回總覽
        </Link>

        {/* Hero Section */}
        <div className="apple-card p-8 md:p-12 mb-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-10">
            <div>
              <h1 className="font-serif text-4xl md:text-5xl font-bold text-primary glow-red mb-3">{symbol}</h1>
              <p className="text-2xl text-gray-900 font-light mb-2">{stockInfo?.name || symbol}</p>
              <p className="text-sm text-gray-400 font-light tracking-wide">
                {stockInfo?.sector || '台股'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-5xl font-bold text-gray-900 glow-white mb-2">{quote.price.toFixed(2)}</p>
              <p className={`text-2xl font-light ${isPositive ? 'text-accent glow-gold' : 'text-primary glow-red'}`}>
                {isPositive ? '+' : ''}{quote.change.toFixed(2)} ({isPositive ? '+' : ''}{quote.changePercent.toFixed(2)}%)
              </p>
              {atr14 !== null && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3 justify-end">
                    <span className="text-xs text-gray-400">ATR(14)</span>
                    <span className="text-sm font-semibold text-gray-900">{atr14.toFixed(2)}</span>
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
                      <span className="text-xs text-gray-400">SMA(20)</span>
                      <span className="text-sm text-gray-600">{sma20.toFixed(2)}</span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${signal.bg} ${signal.color}`}>
                        {signal.emoji} {signal.label}
                      </span>
                      {deviation !== null && (
                        <span className="text-xs text-gray-400">
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
              <PriceChart data={[...historicalData].reverse()} symbol={symbol} inline />
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-8 border-t border-gray-200">
            {quote.marketCap && (
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">市值</p>
                <p className="text-lg font-semibold">{formatNumber(quote.marketCap)}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 font-light mb-2">成交量</p>
              <p className="text-lg font-semibold">{formatShares(quote.volume)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-light mb-2">產業類別</p>
              <p className="text-lg font-semibold">{stockInfo?.sector || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* 關於股票 */}
        {stockInfo && (
          <div className="apple-card p-8">
            <h2 className="text-2xl font-bold mb-6">關於 {stockInfo.name}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-8 pt-6 border-t border-gray-200">
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">股票代號</p>
                <p className="text-base font-semibold">{symbol}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">公司名稱</p>
                <p className="text-base font-semibold">{stockInfo.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">產業類別</p>
                <p className="text-base font-semibold">{stockInfo.sector}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">交易所</p>
                <p className="text-base font-semibold">台灣證券交易所</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">幣別</p>
                <p className="text-base font-semibold">新台幣 (TWD)</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-light mb-2">資料來源</p>
                <p className="text-base font-semibold">Yahoo Finance</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
