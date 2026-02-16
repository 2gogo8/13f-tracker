'use client';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="w-full max-w-2xl mx-auto mb-10">
      <input
        type="text"
        placeholder="搜尋股票代號或公司名稱..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-6 py-4 bg-[#111] rounded-xl focus:ring-1 focus:ring-[#D4AF37]/30 text-foreground placeholder-gray-500 text-base shadow-[0_2px_15px_rgba(0,0,0,0.3)]"
      />
    </div>
  );
}
