'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Comment {
  id: string;
  name: string;
  text: string;
  symbol: string;
  timestamp: number;
}

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    // Collect all comments from localStorage
    const all: Comment[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('comments-')) {
        try {
          const items = JSON.parse(localStorage.getItem(key) || '[]');
          all.push(...items);
        } catch {}
      }
    }
    all.sort((a, b) => b.timestamp - a.timestamp);
    setComments(all);
    setLoading(false);
  }, []);

  const filtered = filter
    ? comments.filter(c => c.symbol.toUpperCase().includes(filter.toUpperCase()))
    : comments;

  // Group by symbol
  const grouped = filtered.reduce((acc, c) => {
    if (!acc[c.symbol]) acc[c.symbol] = [];
    acc[c.symbol].push(c);
    return acc;
  }, {} as Record<string, Comment[]>);

  const symbols = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen py-16 px-4 md:px-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="text-accent hover:text-accent/80 mb-8 inline-block text-sm">
          ← 返回首頁
        </Link>

        <h1 className="text-4xl font-bold mb-2">
          <span className="text-primary">💬</span> 留言管理後台
        </h1>
        <p className="text-gray-500 mb-8">
          共 {comments.length} 則留言，來自 {new Set(comments.map(c => c.symbol)).size} 檔股票
        </p>

        {/* Filter */}
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="搜尋股票代號..."
          className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent/50 mb-8"
        />

        {loading ? (
          <p className="text-gray-500 text-center py-16">載入中...</p>
        ) : comments.length === 0 ? (
          <div className="text-center py-16 apple-card p-8">
            <p className="text-gray-500 text-lg mb-2">尚無留言</p>
            <p className="text-gray-600 text-sm">
              留言會從各股票詳情頁的「提問與討論」區塊收集
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {symbols.map(sym => (
              <div key={sym} className="apple-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <Link href={`/stock/${sym}`} className="flex items-center gap-3 hover:opacity-80">
                    <span className="text-lg font-bold text-primary">{sym}</span>
                    <span className="text-xs text-gray-500">{grouped[sym].length} 則</span>
                  </Link>
                </div>
                <div className="space-y-3">
                  {grouped[sym].map(c => (
                    <div key={c.id} className="flex gap-3 p-3 bg-[#0A0A0A] rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">{c.name[0]?.toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white">{c.name}</span>
                          <span className="text-[10px] text-gray-600">
                            {new Date(c.timestamp).toLocaleString('zh-TW')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300 mt-1">{c.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Export button */}
        {comments.length > 0 && (
          <div className="mt-8 text-center">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(comments, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `comments-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-6 py-3 bg-accent/20 text-accent rounded-lg text-sm font-medium hover:bg-accent/30 transition-all"
            >
              📥 匯出所有留言 (JSON)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
