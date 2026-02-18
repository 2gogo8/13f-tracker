'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-primary mb-4">載入發生錯誤</h2>
        <p className="text-gray-500 mb-6 text-sm">{error.message || '請重新整理頁面'}</p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          重新載入
        </button>
      </div>
    </div>
  );
}
