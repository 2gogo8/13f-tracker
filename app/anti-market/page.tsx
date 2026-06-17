import AntiMarketPicks from '@/components/AntiMarketPicks';
import Link from 'next/link';

export const metadata = {
  title: '反市場精選 - JG的反市場報告書',
  description: '美股反市場精選：連續下跌但基本面強勁的優質標的',
};

export default function AntiMarketPage() {
  return (
    <div className="min-h-screen py-12 px-4 md:px-8 relative overflow-hidden">
      {/* Watermark */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center z-0 select-none" aria-hidden="true">
        <div className="text-gray-900/[0.03] text-[120px] md:text-[200px] font-serif font-bold tracking-widest rotate-[-25deg] whitespace-nowrap">
          JG的反市場報告書
        </div>
      </div>

      <div className="max-w-2xl mx-auto relative z-10">
        <Link href="/" className="text-accent hover:text-accent/80 mb-8 inline-block text-sm font-light tracking-wide">
          ← 返回總覽
        </Link>

        {/* Page Title */}
        <div className="mb-6">
          <h1 className="font-serif text-3xl md:text-4xl font-bold">
            <span className="text-primary glow-red">美股反</span>
            <span className="text-gray-900">市場精選</span>
          </h1>
          <p className="text-sm text-gray-400 mt-2 font-light tracking-wide">
            CONTRARIAN · 逢低買進體質好的公司
          </p>
        </div>

        <AntiMarketPicks />
      </div>
    </div>
  );
}
