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
        placeholder="Search by ticker or company name..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-secondary border border-gray-800 rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-500"
      />
    </div>
  );
}
