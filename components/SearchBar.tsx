'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const router = useRouter();
  const [hint, setHint] = useState('');

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      const sym = value.trim().toUpperCase();
      // Navigate directly to stock page
      router.push(`/stock/${sym}`);
    }
  }, [value, router]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    // Show hint if it looks like a ticker
    if (v.trim().length >= 1 && v.trim().length <= 5 && /^[A-Za-z.]+$/.test(v.trim())) {
      setHint('按 Enter 直接查看個股');
    } else {
      setHint('');
    }
  }, [onChange]);

  return (
    <div className="w-full max-w-2xl mx-auto mb-10">
      <input
        type="text"
        placeholder="搜尋股票代號或公司名稱（按 Enter 直接查看）..."
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="w-full px-6 py-4 bg-[#111] rounded-xl focus:ring-1 focus:ring-accent/30 text-foreground placeholder-gray-500 text-base shadow-[0_2px_15px_rgba(0,0,0,0.3)]"
      />
      {hint && (
        <p className="text-[10px] text-accent/60 mt-1.5 text-center">{hint}</p>
      )}
    </div>
  );
}
