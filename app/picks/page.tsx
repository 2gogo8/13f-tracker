import { Suspense } from 'react';
import AntiMarketPicks from '@/components/AntiMarketPicks';

export const metadata = {
  title: '反市場精選 | JG 選股',
  description: 'JG 反市場精選 — 精選強勢股即時掃描結果',
};

export default function PicksPage() {
  return (
    <main className="min-h-screen bg-[#f9f7f4] py-6 px-4">
      <div className="max-w-lg mx-auto">
        <Suspense fallback={null}>
          <AntiMarketPicks publicMode={true} />
        </Suspense>
      </div>
    </main>
  );
}
