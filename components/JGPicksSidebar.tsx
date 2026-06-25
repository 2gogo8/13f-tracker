'use client';

import { useEffect, useState } from 'react';

interface PickResult {
  symbol: string;
  first_date: string;
  entry_price: number;
  current_price: number | null;
  return_pct: number | null;
  name?: string;
  mentionClose?: number;
  latestClose?: number;
  latestCloseDate?: string;
  lastUpdatedAt?: string;
}

interface ApiResponse {
  results: PickResult[];
  updated_at?: string;
}

function formatDate(d: string) {
  // "2025-07-24" → "25-07-24"
  return d.slice(2).replace(/-/g, '-');
}

function formatLatestCloseDate(d: string | undefined): string {
  if (!d) return '';
  const p = d.split('-');
  return p.length >= 3 ? `截至 ${p[1]}/${p[2]}` : d;
}

function formatPx(p: number): string {
  if (p >= 1000) return '$' + Math.round(p).toLocaleString('en-US');
  return '$' + p.toFixed(2);
}

export default function JGPicksSidebar() {
  const [picks, setPicks] = useState<PickResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/public/jg-picks')
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json() as Promise<ApiResponse>;
      })
      .then(data => {
        setPicks(data.results || []);
        if (data.updated_at) setUpdatedAt(data.updated_at);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      style={{
        width: '100%',
        background: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
        border: '1px solid #e3ddd2',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Sticky header */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: '1px solid #e3ddd2',
          background: '#ffffff',
          position: 'sticky',
          top: 0,
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#c0202a',
            fontFamily: '"Noto Sans TC", "PingFang TC", sans-serif',
          }}
        >
          📈 JG 提到過
        </span>
        <span style={{ fontSize: '9px', color: '#aaa' }}>
          {loading ? '更新中...' : ''}
        </span>
      </div>

      {/* Scrollable list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading && (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid #f0ede8',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div
                    style={{
                      width: '44px',
                      height: '12px',
                      background: 'linear-gradient(90deg,#eee 25%,#f5f5f5 50%,#eee 75%)',
                      backgroundSize: '200% 100%',
                      animation: 'skeleton-shimmer 1.2s infinite',
                      borderRadius: '3px',
                      marginBottom: '4px',
                    }}
                  />
                  <div
                    style={{
                      width: '36px',
                      height: '8px',
                      background: 'linear-gradient(90deg,#eee 25%,#f5f5f5 50%,#eee 75%)',
                      backgroundSize: '200% 100%',
                      animation: 'skeleton-shimmer 1.2s infinite',
                      borderRadius: '3px',
                    }}
                  />
                </div>
                <div
                  style={{
                    width: '36px',
                    height: '13px',
                    background: 'linear-gradient(90deg,#eee 25%,#f5f5f5 50%,#eee 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'skeleton-shimmer 1.2s infinite',
                    borderRadius: '3px',
                  }}
                />
              </div>
            ))}
          </>
        )}

        {!loading && error && (
          <div style={{ padding: '14px 10px', fontSize: '11px', color: '#aaa', textAlign: 'center' }}>
            資料載入中
          </div>
        )}

        {!loading && !error && picks.map((pick, idx) => {
          const pct = pick.return_pct;
          const isPos = pct != null && pct >= 0;
          const pctColor = pct == null ? '#aaa' : isPos ? '#22c55e' : '#ef5350';
          const pctText =
            pct == null
              ? '—'
              : `${isPos ? '+' : ''}${pct.toFixed(1)}%`;

          return (
            <div key={pick.symbol}>
              <div
                onClick={() => window.open(`/stock/${pick.symbol}`, '_blank')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 10px',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f8f6f2')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#1a1a1a',
                      lineHeight: 1.2,
                      fontFamily: '"Noto Sans TC", "PingFang TC", monospace',
                    }}
                  >
                    {pick.symbol}
                  </div>
                  <div style={{ fontSize: '9px', color: '#999', marginTop: '1px' }}>
                    提到 {formatDate(pick.first_date)}
                  </div>
                  {(pick.mentionClose != null && pick.latestClose != null && pick.latestCloseDate) ? (
                    <div style={{ fontSize: '8px', color: '#bbb', marginTop: '2px', lineHeight: 1.3 }}>
                      {formatPx(pick.mentionClose)} → {formatPx(pick.latestClose)} · {formatLatestCloseDate(pick.latestCloseDate)}
                    </div>
                  ) : pick.latestCloseDate ? (
                    <div style={{ fontSize: '8px', color: '#bbb', marginTop: '1px' }}>
                      {formatLatestCloseDate(pick.latestCloseDate)}
                    </div>
                  ) : null}
                </div>
                <div style={{ flex: 1, fontSize: '10px', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: '4px' }}>
                  {pick.name || ''}
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    fontSize: '12px',
                    fontWeight: 700,
                    color: pctColor,
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {pctText}
                </div>
              </div>
              {idx < picks.length - 1 && (
                <div style={{ height: '1px', background: '#f0ede8', margin: '0 8px' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Skeleton keyframe */}
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
