'use client';

import { useState, useEffect } from 'react';

interface Comment {
  id: string;
  name: string;
  text: string;
  symbol: string;
  timestamp: number;
}

interface CommentSectionProps {
  symbol: string;
}

export default function CommentSection({ symbol }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Load comments from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`comments-${symbol}`);
      if (stored) {
        setComments(JSON.parse(stored));
      }
      // Also load saved name
      const savedName = localStorage.getItem('comment-username');
      if (savedName) setName(savedName);
    } catch {}
  }, [symbol]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !text.trim()) return;

    setSubmitting(true);

    const comment: Comment = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.trim(),
      text: text.trim(),
      symbol,
      timestamp: Date.now(),
    };

    // Save to localStorage
    const updated = [comment, ...comments];
    setComments(updated);
    localStorage.setItem(`comments-${symbol}`, JSON.stringify(updated));
    localStorage.setItem('comment-username', name.trim());

    // Send to backend (Discord notification for JG)
    try {
      await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comment),
      });
    } catch {}

    setText('');
    setSubmitting(false);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="apple-card p-6 md:p-8 mb-8">
      <h2 className="text-2xl font-bold mb-2">💬 提問與討論</h2>
      <p className="text-sm text-gray-500 mb-6">
        對 {symbol} 有疑問？留下你的問題，JG 會定期回覆
      </p>

      {/* Submit form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-3 mb-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="你的暱稱"
            className="flex-shrink-0 w-28 sm:w-36 bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent/50"
            maxLength={20}
            required
          />
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`關於 ${symbol} 的問題...`}
            className="flex-1 bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent/50"
            maxLength={500}
            required
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !name.trim() || !text.trim()}
            className="px-6 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {submitting ? '送出中...' : submitted ? '✅ 已送出' : '送出提問'}
          </button>
        </div>
      </form>

      {/* Comments list */}
      {comments.length > 0 && (
        <div className="space-y-3 border-t border-white/5 pt-4">
          <p className="text-xs text-gray-500">{comments.length} 則留言</p>
          {comments.slice(0, 20).map(c => (
            <div key={c.id} className="flex gap-3 p-3 bg-[#0A0A0A] rounded-lg">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">{c.name[0]?.toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-white">{c.name}</span>
                  <span className="text-[10px] text-gray-600">
                    {new Date(c.timestamp).toLocaleString('zh-TW')}
                  </span>
                </div>
                <p className="text-sm text-gray-300 mt-1 leading-relaxed">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
