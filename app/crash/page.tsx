'use client';
import { useEffect, useState } from 'react';

interface StockMeta {
  symbol: string;
  name: string;
  change: number;
  price?: number;
  hasChart: boolean;
}

interface AlertData {
  date: string;
  triggeredAt: string;
  ixicChange: number;
  marketLosers: StockMeta[];
  watchlistStocks: StockMeta[];
}

function ChartModal({ symbol, type, onClose }: { symbol: string; type: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: '95vw', maxHeight: '90vh' }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '-14px', right: '-14px',
          width: '30px', height: '30px', borderRadius: '50%',
          background: '#c0202a', color: '#fff', border: 'none',
          cursor: 'pointer', fontSize: '16px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1,
        }}>×</button>
        <img
          src={`/api/public/crash-alert/chart?symbol=${symbol}&type=${type}`}
          alt={`${symbol} 2yr chart`}
          style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block', borderRadius: '4px' }}
        />
      </div>
    </div>
  );
}

function ChartThumb({ stock, type }: { stock: StockMeta; type: string }) {
  const [open, setOpen] = useState(false);
  const isDown = stock.change < 0;
  return (
    <>
      <div onClick={() => stock.hasChart && setOpen(true)} style={{
        background: '#fff', borderRadius: '6px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        overflow: 'hidden', cursor: stock.hasChart ? 'pointer' : 'default',
        borderLeft: `3px solid ${isDown ? '#ef5350' : '#26a69a'}`,
      }}>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f0ece4' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a', fontFamily: 'Georgia,serif' }}>{stock.symbol}</span>
          <span style={{ fontSize: '15px', fontWeight: 700, color: isDown ? '#ef5350' : '#26a69a' }}>
            {stock.change > 0 ? '+' : ''}{stock.change.toFixed(2)}%
          </span>
          <span style={{ fontSize: '11px', color: '#8a8a8f', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stock.name}</span>
          {stock.hasChart && <span style={{ fontSize: '11px', color: '#c0202a', flexShrink: 0 }}>🔍</span>}
        </div>
        {stock.hasChart ? (
          <img
            src={`/api/public/crash-alert/chart?symbol=${stock.symbol}&type=${type}`}
            alt={stock.symbol}
            style={{ width: '100%', display: 'block', maxHeight: '160px', objectFit: 'cover', objectPosition: 'top' }}
          />
        ) : (
          <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: '13px' }}>
            圖表生成中...
          </div>
        )}
      </div>
      {open && <ChartModal symbol={stock.symbol} type={type} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function CrashPage() {
  const [alert, setAlert] = useState<AlertData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/public/crash-alert').then(r => r.json()).then(d => setAlert(d.alert)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const isToday = alert?.date === new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #f5f2ec; font-family: "Noto Sans TC", -apple-system, "PingFang TC", sans-serif; }
        @media (max-width: 768px) { .crash-layout { flex-direction: column !important; } .right-col { max-width: 100% !important; min-width: 0 !important; } }
      `}</style>
      <div style={{ minHeight: '100svh', background: '#f5f2ec' }}>

        {/* Header */}
        <header style={{ background: '#fff', borderBottom: '1px solid #e3ddd2', padding: '14px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <a href="/insights" style={{ fontSize: '12px', color: '#8a8a8f', textDecoration: 'none' }}>← 影子 JG</a>
            <h1 style={{ fontFamily: '"Noto Serif TC", Georgia, serif', fontSize: '22px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>
              ⚠️ 大跌警報
            </h1>
            {alert && (
              <span style={{ fontSize: '32px', fontWeight: 900, color: '#ef5350', fontFamily: 'Georgia, serif', lineHeight: 1 }}>
                IXIC {alert.ixicChange.toFixed(2)}%
              </span>
            )}
            {alert && (
              <span style={{ fontSize: '13px', color: '#8a8a8f', marginLeft: 'auto' }}>
                {alert.date}{!isToday && ' · 歷史紀錄'}
              </span>
            )}
          </div>
        </header>

        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 16px' }}>
          {loading && <div style={{ textAlign: 'center', padding: '4rem', color: '#8a8a8f' }}>載入中...</div>}

          {!loading && !alert && (
            <div style={{ textAlign: 'center', padding: '5rem', background: '#fff', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '52px', marginBottom: '16px' }}>📈</div>
              <div style={{ fontSize: '20px', color: '#1a1a1a', fontWeight: 600 }}>今日市場平靜</div>
              <div style={{ fontSize: '14px', color: '#8a8a8f', marginTop: '8px' }}>IXIC 未觸發大跌警報（跌幅 &lt; 1.5%）</div>
            </div>
          )}

          {!loading && alert && (
            <div className="crash-layout" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

              {/* ── LEFT: Top 10 losers list ── */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: '"Noto Serif TC", Georgia, serif', fontSize: '17px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 14px', paddingBottom: '8px', borderBottom: '2px solid #c0202a', display: 'inline-block' }}>
                  市場跌幅前十名
                </h2>

                {alert.marketLosers.length === 0 ? (
                  <div style={{ background: '#fff', borderRadius: '6px', padding: '20px', color: '#8a8a8f', fontSize: '14px', border: '2px dashed #e3ddd2', textAlign: 'center' }}>
                    名單準備中，等待觸發後自動填入
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {alert.marketLosers.map((s, i) => (
                      <div key={s.symbol} style={{
                        background: '#fff', borderRadius: '4px',
                        padding: '12px 16px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        display: 'flex', alignItems: 'center', gap: '12px',
                        borderLeft: `3px solid ${i < 3 ? '#c0202a' : '#e3ddd2'}`,
                      }}>
                        <span style={{
                          width: '24px', height: '24px', borderRadius: '50%',
                          background: i < 3 ? '#c0202a' : '#e3ddd2',
                          color: i < 3 ? '#fff' : '#8a8a8f',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '11px', fontWeight: 700, flexShrink: 0,
                        }}>{i + 1}</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', fontFamily: 'Georgia, serif', minWidth: '60px' }}>{s.symbol}</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: '#ef5350' }}>{s.change.toFixed(2)}%</span>
                        <span style={{ fontSize: '12px', color: '#8a8a8f', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                        {s.price && <span style={{ fontSize: '13px', color: '#2b2b2e', flexShrink: 0 }}>${s.price.toFixed(2)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── RIGHT: Watchlist thumbnails ── */}
              <div className="right-col" style={{ width: '300px', minWidth: '260px', flexShrink: 0 }}>
                <h2 style={{ fontFamily: '"Noto Serif TC", Georgia, serif', fontSize: '17px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 14px', paddingBottom: '8px', borderBottom: '2px solid #8a8a8f', display: 'inline-block' }}>
                  自選股監測
                </h2>

                {alert.watchlistStocks.length === 0 ? (
                  <div style={{ background: '#fff', borderRadius: '6px', padding: '20px', color: '#8a8a8f', fontSize: '14px', border: '2px dashed #e3ddd2', textAlign: 'center' }}>
                    自選股名單準備中
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {alert.watchlistStocks.slice(0, 2).map(s => (
                      <ChartThumb key={s.symbol} stock={s} type="watchlist" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
