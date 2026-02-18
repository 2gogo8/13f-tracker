'use client';

import { useEffect, useState } from 'react';

interface StatsData {
  summary: {
    totalCalls: number;
    totalErrors: number;
    avgResponseTime: number;
    uniqueEndpoints: number;
  };
  endpoints: Array<{
    endpoint: string;
    calls: number;
    errors: number;
    avgMs: number;
    lastCalled: number;
  }>;
  topSymbols: Array<{
    symbol: string;
    views: number;
  }>;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('確定要重置所有統計資料嗎？')) return;
    
    setResetting(true);
    try {
      await fetch('/api/admin/stats', { method: 'POST' });
      await fetchStats();
    } catch (error) {
      console.error('Failed to reset stats:', error);
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center">
        <div className="text-[#2d2d2d] text-lg">載入中...</div>
      </div>
    );
  }

  const formatTime = (timestamp: number) => {
    if (!timestamp) return '未使用';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-TW', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-['Playfair_Display'] text-[#2d2d2d] mb-2">
              後台監控面板
            </h1>
            <p className="text-[#666]">即時 API 呼叫統計與系統監控</p>
          </div>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="px-6 py-3 bg-[#2d2d2d] text-white rounded-lg hover:bg-[#1a1a1a] transition-colors disabled:opacity-50"
          >
            {resetting ? '重置中...' : '重置統計'}
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="apple-card p-6">
            <div className="text-sm text-[#666] mb-2">總 API 呼叫次數</div>
            <div className="text-4xl font-['Playfair_Display'] text-[#2d2d2d]">
              {stats?.summary.totalCalls.toLocaleString() || 0}
            </div>
          </div>
          
          <div className="apple-card p-6">
            <div className="text-sm text-[#666] mb-2">錯誤次數</div>
            <div className="text-4xl font-['Playfair_Display'] text-[#2d2d2d]">
              {stats?.summary.totalErrors || 0}
            </div>
          </div>
          
          <div className="apple-card p-6">
            <div className="text-sm text-[#666] mb-2">平均回應時間</div>
            <div className="text-4xl font-['Playfair_Display'] text-[#2d2d2d]">
              {stats?.summary.avgResponseTime || 0}
              <span className="text-lg ml-1">ms</span>
            </div>
          </div>
          
          <div className="apple-card p-6">
            <div className="text-sm text-[#666] mb-2">端點數量</div>
            <div className="text-4xl font-['Playfair_Display'] text-[#2d2d2d]">
              {stats?.summary.uniqueEndpoints || 0}
            </div>
          </div>
        </div>

        {/* Endpoints Table */}
        <div className="apple-card p-6 mb-8">
          <h2 className="text-2xl font-['Playfair_Display'] text-[#2d2d2d] mb-6">
            各端點統計
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e0e0d8]">
                  <th className="text-left py-3 px-4 text-sm text-[#666]">端點</th>
                  <th className="text-right py-3 px-4 text-sm text-[#666]">呼叫次數</th>
                  <th className="text-right py-3 px-4 text-sm text-[#666]">平均時間 (ms)</th>
                  <th className="text-right py-3 px-4 text-sm text-[#666]">錯誤</th>
                  <th className="text-right py-3 px-4 text-sm text-[#666]">最後呼叫</th>
                </tr>
              </thead>
              <tbody>
                {stats?.endpoints.map((endpoint) => (
                  <tr key={endpoint.endpoint} className="border-b border-[#e0e0d8]/50 hover:bg-[#fafaf5]">
                    <td className="py-3 px-4 font-mono text-sm text-[#2d2d2d]">
                      {endpoint.endpoint}
                    </td>
                    <td className="py-3 px-4 text-right text-[#2d2d2d]">
                      {endpoint.calls.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right text-[#2d2d2d]">
                      {endpoint.avgMs}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={endpoint.errors > 0 ? 'text-red-600' : 'text-[#666]'}>
                        {endpoint.errors}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-[#666]">
                      {formatTime(endpoint.lastCalled)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!stats?.endpoints || stats.endpoints.length === 0) && (
              <div className="text-center py-8 text-[#666]">尚無資料</div>
            )}
          </div>
        </div>

        {/* Top Symbols */}
        <div className="apple-card p-6">
          <h2 className="text-2xl font-['Playfair_Display'] text-[#2d2d2d] mb-6">
            熱門股票排行
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {stats?.topSymbols.map((item, index) => (
              <div
                key={item.symbol}
                className="p-4 bg-[#fafaf5] rounded-lg border border-[#e0e0d8]"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-[#999]">#{index + 1}</span>
                  <span className="font-bold text-lg text-[#2d2d2d]">{item.symbol}</span>
                </div>
                <div className="text-sm text-[#666] mt-1">
                  {item.views.toLocaleString()} 次瀏覽
                </div>
              </div>
            ))}
          </div>
          {(!stats?.topSymbols || stats.topSymbols.length === 0) && (
            <div className="text-center py-8 text-[#666]">尚無資料</div>
          )}
        </div>

        {/* Footer Note */}
        <div className="mt-8 text-center text-sm text-[#999]">
          <p>統計資料儲存於記憶體中，伺服器重啟後會重置</p>
          <p className="mt-1">每 30 秒自動更新</p>
        </div>
      </div>
    </div>
  );
}
