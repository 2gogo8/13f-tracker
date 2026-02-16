'use client';

import Link from 'next/link';
import { TrendingNewsItem } from '@/types';

interface TrendingNewsProps {
  news: TrendingNewsItem[];
}

export default function TrendingNews({ news }: TrendingNewsProps) {
  if (news.length === 0) {
    return (
      <div className="apple-card p-8">
        <h2 className="font-serif text-2xl font-bold mb-6 flex items-center gap-3">
          
          今日熱點戰情
        </h2>
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">休市中，無熱點新聞</p>
        </div>
      </div>
    );
  }

  const sentimentConfig = {
    positive: { badge: '🟢 正面', color: 'text-accent' },
    negative: { badge: '🔴 負面', color: 'text-primary' },
    neutral: { badge: '🟡 中性', color: 'text-gray-400' },
  };

  return (
    <div className="apple-card p-8">
      <h2 className="font-serif text-2xl font-bold mb-6 flex items-center gap-3">
        
        今日熱點戰情
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {news.map((item) => {
          const sentimentInfo = sentimentConfig[item.sentiment];
          const isPositive = item.changesPercentage >= 0;

          return (
            <div
              key={item.symbol}
              className="bg-[#111] rounded-lg overflow-hidden border border-white/5 hover:border-accent/30 transition-all"
            >
              {/* Stock Info Header */}
              <div className="p-4 border-b border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <Link href={`/stock/${item.symbol}`}>
                    <span className="text-lg font-bold text-primary hover:text-accent transition-colors">
                      {item.symbol}
                    </span>
                  </Link>
                  <span className={`text-xs px-2 py-1 rounded ${sentimentInfo.color}`}>
                    {sentimentInfo.badge}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-white font-medium">${(item.price ?? 0).toFixed(2)}</span>
                  <span
                    className={`text-sm font-semibold ${
                      isPositive ? 'text-accent' : 'text-primary'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {(item.changesPercentage ?? 0).toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* News Content */}
              <a
                href={item.newsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 hover:bg-white/[0.02] transition-colors"
              >
                {/* News Image */}
                {item.newsImage && (
                  <div className="mb-3 rounded overflow-hidden">
                    <img
                      src={item.newsImage}
                      alt={item.newsTitle}
                      className="w-full h-32 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                {/* News Headline */}
                <h3 className="text-sm font-medium text-white mb-2 line-clamp-2 leading-relaxed">
                  {item.newsTitle}
                </h3>

                {/* News Meta */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{item.newsSite}</span>
                  <span>{new Date(item.publishedDate).toLocaleDateString('zh-TW')}</span>
                </div>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
