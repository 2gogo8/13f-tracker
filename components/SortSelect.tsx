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
      <label htmlFor="sort" className="block text-sm text-gray-400 mb-2">
        Sort by
      </label>
      <select
        id="sort"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-4 py-2 bg-secondary border border-gray-800 rounded-lg focus:outline-none focus:border-primary text-foreground cursor-pointer"
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
