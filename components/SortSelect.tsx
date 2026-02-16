'use client';

import { SortOption } from '@/types';

interface SortSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SortOption[];
}

export default function SortSelect({ value, onChange, options }: SortSelectProps) {
  return (
    <div className="mb-6">
      <label htmlFor="sort" className="block text-sm text-gray-400 font-light mb-2">
        排序
      </label>
      <select
        id="sort"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:border-accent text-foreground cursor-pointer transition-all hover:border-accent/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
