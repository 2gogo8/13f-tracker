'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F3EF] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="apple-card p-8 text-center">
          {/* Title */}
          <h1 className="font-serif text-2xl font-bold mb-1">
            <span className="text-accent">JG</span>
            <span className="text-gray-900">的</span>
            <span className="text-primary font-black">反</span>
            <span className="text-gray-900">市場報告書</span>
          </h1>
          <p className="text-xs text-gray-400 mb-8">請輸入密碼以繼續</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              placeholder="密碼"
              className={`w-full px-4 py-3 rounded-xl border text-center text-lg tracking-[0.5em] bg-gray-50 focus:outline-none focus:ring-2 transition-all ${
                error 
                  ? 'border-red-400 focus:ring-red-200' 
                  : 'border-gray-200 focus:ring-accent/30'
              }`}
              autoFocus
              inputMode="numeric"
            />
            {error && (
              <p className="text-primary text-xs">密碼錯誤，請重新輸入</p>
            )}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 rounded-xl bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              {loading ? '驗證中...' : '進入'}
            </button>
          </form>

          <p className="text-[10px] text-gray-300 mt-6">僅供授權用戶使用</p>
        </div>
      </div>
    </div>
  );
}
