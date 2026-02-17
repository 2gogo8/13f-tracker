'use client';

import Link from 'next/link';
import { TrendingNewsItem } from '@/types';

interface TrendingNewsProps {
  news: TrendingNewsItem[];
}

export default function TrendingNews({ news }: TrendingNewsProps) {
  if (news.length === 0) {
    return (
      <div className="apple-card p-6">
        <h2 className="font-serif text-2xl font-bold mb-4">今日熱點戰情</h2>
        <p className="text-gray-500 text-sm text-center py-4">休市中，無熱點新聞</p>
      </div>
    );
  }

  return (
    <div className="apple-card p-5 md:p-6">
      <h2 className="font-serif text-lg font-bold text-accent glow-gold mb-4">今日熱點戰情</h2>
      <div className="divide-y divide-white/[0.06]">
        {news.map((item, i) => (
          <a
            key={i}
            href={item.newsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 py-3 hover:bg-white/[0.02] transition-colors rounded px-1"
          >
            {/* Company Logo */}
            {item.newsImage ? (
              <div className="w-8 h-8 flex-shrink-0 rounded-md bg-white/10 flex items-center justify-center overflow-hidden">
                <img
                  src={item.newsImage}
                  alt={item.symbol}
                  className="w-6 h-6 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                />
              </div>
            ) : (
              <div className="w-8 h-8 flex-shrink-0 rounded-md bg-white/5 flex items-center justify-center">
                <span className="text-[10px] text-gray-500 font-mono">{item.symbol?.slice(0, 2)}</span>
              </div>
            )}

            {/* Headline + date */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white line-clamp-1 leading-snug">{item.newsTitle}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">
                <span className="text-primary font-medium">{item.symbol}</span>
                {' · '}
                {new Date(item.publishedDate).toLocaleDateString('zh-TW')}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
