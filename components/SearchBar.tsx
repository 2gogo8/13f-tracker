'use client';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="w-full max-w-2xl mx-auto mb-6">
      <input
        type="text"
        placeholder="搜尋股票代號或公司名稱..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-secondary border border-border rounded-lg focus:outline-none focus:border-accent focus:shadow-[0_0_10px_rgba(212,175,55,0.2)] text-foreground placeholder-gray-500 transition-all"
      />
    </div>
  );
}
