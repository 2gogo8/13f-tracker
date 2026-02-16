'use client';

export type ScannerType = 'accumulation' | 'selling' | 'top-holdings' | 'oversold' | null;

interface ScannerButtonsProps {
  activeScanner: ScannerType;
  onScannerChange: (scanner: ScannerType) => void;
}

export default function ScannerButtons({
  activeScanner,
  onScannerChange,
}: ScannerButtonsProps) {
  const scanners = [
    {
      type: 'accumulation' as ScannerType,
      emoji: '🔥',
      label: '大戶加碼',
      description: '機構投資人正在買入',
    },
    {
      type: 'selling' as ScannerType,
      emoji: '📉',
      label: '機構拋售',
      description: '機構投資人正在減倉',
    },
    {
      type: 'top-holdings' as ScannerType,
      emoji: '💎',
      label: '避險基金最愛',
      description: '最高機構持倉金額',
    },
    {
      type: 'oversold' as ScannerType,
      emoji: '🔵',
      label: '負乖離雷達',
      description: '超跌訊號：現價 < SMA20 - 2×ATR',
    },
  ];

  return (
    <div className="flex flex-wrap gap-3 justify-center mb-8">
      {scanners.map((scanner) => (
        <button
          key={scanner.type}
          onClick={() =>
            onScannerChange(
              activeScanner === scanner.type ? null : scanner.type
            )
          }
          className={`px-6 py-3 rounded-full text-sm font-medium transition-all ${
            activeScanner === scanner.type
              ? 'bg-accent text-black shadow-[0_4px_20px_rgba(212,175,55,0.3)]'
              : 'bg-[#111] text-gray-300 hover:bg-[#1A1A1A] hover:text-white'
          }`}
          title={scanner.description}
        >
          <span className="mr-2">{scanner.emoji}</span>
          {scanner.label}
        </button>
      ))}
    </div>
  );
}
