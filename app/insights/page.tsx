'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface Summary {
  _id: string;
  tags: string[];
  source: 'manual' | 'auto' | 'video';
  topic?: string;
  summary: { timelineAnalysis: string; keyNumbers: string; predictionVsReality: string };
  article?: string;
  articleTitle?: string;
  expertCount: number;
  publishedAt: string;
  createdAt: string;
}

// ── Taiwan time ──────────────────────────────────────────────────────────────
function getTaiwanDate() {
  return new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
}

function getCountdownTo6AM(): string {
  const now = new Date();
  const twNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const next6 = new Date(twNow);
  next6.setHours(6, 0, 0, 0);
  if (twNow.getHours() >= 6) next6.setDate(next6.getDate() + 1);
  const diff = next6.getTime() - twNow.getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Split pages ───────────────────────────────────────────────────────────────
function splitIntoPages(text: string, limit = 700): string[] {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  const pages: string[] = [];
  let cur = '';
  for (const p of paragraphs) {
    const next = cur ? cur + '\n\n' + p : p;
    if (cur && next.length > limit) { pages.push(cur); cur = p; }
    else { cur = next; }
  }
  if (cur) pages.push(cur);
  return pages.length ? pages : [text];
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderInline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/).map((part, k) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={k} style={{ color: '#1a1a1a', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      : <span key={k}>{part}</span>
  );
}

function renderMarkdown(raw: string) {
  if (!raw) return null;
  return raw.split(/\n\n+/).map((block, i) => {
    const t = block.trim();
    if (!t) return null;
    if (/^-{3,}$/.test(t))
      return <hr key={i} style={{ border: 'none', borderTop: '1px solid #e3ddd2', margin: '18px 0' }} />;
    if (/^#{1,3}\s/.test(t))
      return (
        <h3 key={i} style={{
          fontFamily: '"Noto Serif TC", Georgia, serif',
          fontSize: '17px', fontWeight: 700, color: '#c0202a',
          margin: '20px 0 10px', lineHeight: 1.4, letterSpacing: '0.01em',
        }}>
          {t.replace(/^#{1,3}\s+/, '')}
        </h3>
      );
    if (t.startsWith('> '))
      return (
        <div key={i} style={{
          borderLeft: '3px solid #c0202a', paddingLeft: '14px',
          color: '#8a8a8f', fontStyle: 'italic', fontSize: '16px',
          margin: '18px 0', lineHeight: 1.75,
        }}>
          {t.replace(/^>\s?/gm, '')}
        </div>
      );
    return (
      <p key={i} style={{ marginBottom: '18px', lineHeight: 1.85, fontSize: '16px', color: '#2b2b2e', fontFamily: '"Noto Sans TC","PingFang TC",-apple-system,sans-serif', letterSpacing: '0.01em' }}>
        {t.split('\n').map((line, j, arr) => (
          <span key={j}>{renderInline(line)}{j < arr.length - 1 && <br />}</span>
        ))}
      </p>
    );
  });
}

function charDelay(c: string) {
  if ([',', '，', '、'].includes(c)) return 80;
  if (['.', '。', '?', '？', '!', '！'].includes(c)) return 150;
  return 4;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [topicIdx, setTopicIdx] = useState(0);
  const [todayDate, setTodayDate] = useState('');
  const [countdown, setCountdown] = useState('');

  const [pageIdx, setPageIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [charIdx, setCharIdx] = useState(0);
  const [pageDone, setPageDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [navPage, setNavPage] = useState(0);
  const NAV_PER_PAGE = 4;
  const [crashAlert, setCrashAlert] = useState<{ixicChange:number;date:string;composite1:string|null;composite2:string|null;marketLosers:{symbol:string;name:string;change:number}[]} | null>(null);
  const [crashModal, setCrashModal] = useState<{stocks:{symbol:string;name:string;change:number}[];idx:number} | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);  // default on
  const audioRef = useRef<HTMLAudioElement>(null);

  // Taiwan date + countdown
  useEffect(() => {
    setTodayDate(getTaiwanDate());
    setCountdown(getCountdownTo6AM());
    const interval = setInterval(() => {
      setTodayDate(getTaiwanDate());
      setCountdown(getCountdownTo6AM());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-play after 5s delay (don't block initial page load)
  useEffect(() => {
    const timer = setTimeout(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          // Browser blocked autoplay — play on first interaction after delay
          const onInteract = () => {
            audio.play().then(() => setIsPlaying(true)).catch(() => {});
            document.removeEventListener('click', onInteract);
            document.removeEventListener('touchstart', onInteract);
          };
          document.addEventListener('click', onInteract, { once: true });
          document.addEventListener('touchstart', onInteract, { once: true });
        });
    }, 5000); // 5 second delay — page loads first
    return () => clearTimeout(timer);
  }, []);

  const toggleMusic = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  // Fetch summaries
  useEffect(() => {
    fetch('/api/insights?limit=10')
      .then(r => r.ok ? r.json() : [])
      .then(setSummaries)
      .catch(() => {})
      .finally(() => setLoading(false));
    // Fetch crash alert in parallel (non-blocking)
    fetch('/api/public/crash-alert')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.alert ? setCrashAlert(d.alert) : null)
      .catch(() => {});
  }, []);

  const active = summaries[topicIdx];
  const articleContent = active
    ? (active.article || [active.summary?.timelineAnalysis, active.summary?.keyNumbers, active.summary?.predictionVsReality].filter(Boolean).join('\n\n---\n\n'))
    : '';
  const pages = splitIntoPages(articleContent, 700);
  const isLastPage = pageIdx >= pages.length - 1;

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDisplayed(''); setCharIdx(0); setPageDone(false);
  }, [topicIdx, pageIdx]);

  useEffect(() => { setPageIdx(0); }, [topicIdx]);

  useEffect(() => {
    if (pageDone || !pages[pageIdx]) return;
    const current = pages[pageIdx];
    if (charIdx >= current.length) { setPageDone(true); return; }
    const c = current[charIdx];
    const delay = charDelay(c);
    // Use setTimeout for punctuation pauses, requestAnimationFrame for fast chars
    // This prevents background-tab throttling for normal characters
    if (delay <= 4) {
      const raf = requestAnimationFrame(() => {
        setDisplayed(d => d + c);
        setCharIdx(i => i + 1);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      timerRef.current = setTimeout(() => {
        setDisplayed(d => d + c);
        setCharIdx(i => i + 1);
      }, delay);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
  }, [charIdx, pageDone, pageIdx, pages]);

  const skipPage = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const cur = pages[pageIdx] || '';
    setDisplayed(cur); setCharIdx(cur.length); setPageDone(true);
  }, [pageIdx, pages]);

  const nextPage = useCallback(() => {
    if (pageIdx < pages.length - 1) setPageIdx(p => p + 1);
  }, [pageIdx, pages.length]);

  const prevPage = useCallback(() => {
    if (pageIdx > 0) setPageIdx(p => p - 1);
  }, [pageIdx]);

  const getLabel = (s: Summary, i: number) => {
    const raw = s.topic || s.tags[0] || `話題${i + 1}`;
    return raw.replace(/政策題材|題材|政策/g, '').trim().slice(0, 12) || `話題${i + 1}`;
  };

  const totalNavPages = Math.ceil(summaries.length / NAV_PER_PAGE);
  const visibleSummaries = summaries.slice(navPage * NAV_PER_PAGE, (navPage + 1) * NAV_PER_PAGE);

  return (
    <>
      <style>{`
        /* Fonts loaded via <link> in layout.tsx */
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #f5f2ec; }
        @keyframes cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes live-dot { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes cta-pulse { 0%,100%{box-shadow:0 2px 12px rgba(192,32,42,0.35)} 50%{box-shadow:0 4px 20px rgba(192,32,42,0.6)} }
        button:focus { outline: none; }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{
        height: '100svh', backgroundColor: '#f5f2ec',
        display: 'flex', flexDirection: 'column',
        fontFamily: '"Noto Sans TC", -apple-system, "PingFang TC", sans-serif',
        color: '#2b2b2e',
      }}>

        {/* ── Header ── */}
        <header style={{
          flexShrink: 0,
          background: '#ffffff',
          borderBottom: '1px solid #e3ddd2',
          padding: '14px 20px 12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          {/* Brand row */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', justifyContent: 'center', marginBottom: '2px' }}>
            <h1 style={{
              fontFamily: '"Noto Serif TC", "Source Han Serif", Georgia, serif',
              fontSize: '32px', fontWeight: 700, color: '#1a1a1a',
              margin: 0, lineHeight: 1.2, letterSpacing: '0.02em',
            }}>影子 JG</h1>
            <span style={{
              fontSize: '11px', color: '#8a8a8f', letterSpacing: '0.1em',
              fontStyle: 'italic',
            }}>Shadow JG</span>
          </div>
          <div style={{ textAlign: 'center', fontSize: '12px', color: '#8a8a8f', marginBottom: '10px', letterSpacing: '0.05em' }}>
            市場背後的反向觀察者
          </div>

          {/* LIVE + Date */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{
              display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
              background: '#c0202a', animation: 'live-dot 1.5s ease-in-out infinite', flexShrink: 0,
            }} />
            <span style={{ fontSize: '12px', color: '#c0202a', fontWeight: 700, letterSpacing: '0.12em' }}>LIVE</span>
            <span style={{ fontSize: '12px', color: '#8a8a8f' }}>{todayDate}</span>
            <span style={{ fontSize: '11px', color: '#8a8a8f' }}>· 每日更新</span>
          </div>

          {/* Countdown */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              background: '#f5f2ec', border: '1px solid #e3ddd2',
              borderTop: '2px solid #c0202a',
              padding: '6px 18px', borderRadius: '2px',
            }}>
              <span style={{ fontSize: '11px', color: '#8a8a8f', letterSpacing: '0.1em' }}>下次更新</span>
              <span style={{
                fontFamily: '"Noto Serif TC", Georgia, serif',
                fontSize: '22px', fontWeight: 700, color: '#1a1a1a',
                letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums',
              }}>{countdown}</span>
              <span style={{ fontSize: '11px', color: '#8a8a8f' }}>06:00 TST</span>
            </div>
          </div>
        </header>

        {/* ── Topic Nav ── */}
        {!loading && summaries.length > 0 && (
          <nav style={{
            flexShrink: 0,
            background: '#ffffff',
            borderBottom: '1px solid #e3ddd2',
          }}>
            <div style={{ display: 'flex', alignItems: 'stretch', maxWidth: '720px', margin: '0 auto' }}>
              {totalNavPages > 1 && (
                <button onClick={() => setNavPage(p => Math.max(0, p - 1))} disabled={navPage === 0}
                  style={{
                    flexShrink: 0, width: '32px', background: 'none', border: 'none',
                    borderRight: '1px solid #e3ddd2',
                    color: navPage === 0 ? '#e3ddd2' : '#c0202a',
                    fontSize: '16px', cursor: navPage === 0 ? 'default' : 'pointer',
                  }}>‹</button>
              )}
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {visibleSummaries.map((s, relIdx) => {
                  const idx = navPage * NAV_PER_PAGE + relIdx;
                  const isSel = idx === topicIdx;
                  return (
                    <button key={s._id} onClick={() => setTopicIdx(idx)} style={{
                      flex: 1, padding: '11px 8px', background: isSel ? '#fdfbf8' : 'none', border: 'none',
                      borderBottom: isSel ? '2.5px solid #c0202a' : '2.5px solid transparent',
                      borderRight: relIdx < visibleSummaries.length - 1 ? '1px solid #e3ddd2' : 'none',
                      color: isSel ? '#c0202a' : '#8a8a8f',
                      fontSize: '13px',
                      fontFamily: '"Noto Sans TC", "PingFang TC", -apple-system, sans-serif',
                      fontWeight: isSel ? 600 : 400,
                      letterSpacing: '0.02em',
                      cursor: 'pointer', whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      transition: 'color 0.2s, background 0.2s',
                      lineHeight: 1.4,
                    }}>
                      {getLabel(s, idx)}
                    </button>
                  );
                })}
                {Array.from({ length: NAV_PER_PAGE - visibleSummaries.length }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ flex: 1 }} />
                ))}
              </div>
              {totalNavPages > 1 && (
                <button onClick={() => setNavPage(p => Math.min(totalNavPages - 1, p + 1))}
                  disabled={navPage >= totalNavPages - 1}
                  style={{
                    flexShrink: 0, width: '32px', background: 'none', border: 'none',
                    borderLeft: '1px solid #e3ddd2',
                    color: navPage >= totalNavPages - 1 ? '#e3ddd2' : '#c0202a',
                    fontSize: '16px', cursor: navPage >= totalNavPages - 1 ? 'default' : 'pointer',
                  }}>›</button>
              )}
            </div>
            {totalNavPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', padding: '4px 0' }}>
                {Array.from({ length: totalNavPages }).map((_, i) => (
                  <div key={i} onClick={() => setNavPage(i)} style={{
                    width: i === navPage ? '14px' : '5px', height: '4px', borderRadius: '2px',
                    background: i === navPage ? '#c0202a' : '#e3ddd2',
                    cursor: 'pointer', transition: 'all 0.3s',
                  }} />
                ))}
              </div>
            )}
          </nav>
        )}

        {/* ── Article area ── */}
        <main style={{
          flex: 1, overflow: 'hidden',
          padding: '20px 16px 0',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center',
        }}>
          {loading ? (
            <div style={{ paddingTop: '4rem', color: '#8a8a8f', fontSize: '15px' }}>載入中...</div>
          ) : summaries.length === 0 ? (
            <div style={{ paddingTop: '4rem', color: '#8a8a8f', fontSize: '15px' }}>尚無文章</div>
          ) : (
            <div style={{
              width: '100%', maxWidth: '720px',
              flex: 1, overflow: 'hidden',
              background: '#ffffff',
              borderLeft: '3px solid #c0202a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              borderRadius: '0 4px 4px 0',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Card header */}
              <div style={{ flexShrink: 0, padding: '24px 32px 0' }}>
                {active?.articleTitle && (
                  <h2 style={{
                    fontFamily: '"Noto Serif TC", "Source Han Serif", Georgia, "Times New Roman", serif',
                    fontSize: 'clamp(18px, 3.5vw, 26px)', fontWeight: 700,
                    color: '#1a1a1a', lineHeight: 1.35, margin: '0 0 12px',
                    letterSpacing: '-0.01em',
                  }}>
                    {active.articleTitle}
                  </h2>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  {active?.topic && (
                    <span style={{
                      fontSize: '12px', color: '#c0202a', fontWeight: 600,
                      background: 'rgba(192,32,42,0.08)', padding: '2px 8px', borderRadius: '2px',
                    }}>
                      {active.topic.split('·')[0]}
                    </span>
                  )}
                  <span style={{ fontSize: '13px', color: '#8a8a8f' }}>
                    {new Date(active?.publishedAt || '').toLocaleDateString('zh-TW', {
                      timeZone: 'Asia/Taipei', year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </span>
                  {pages.length > 1 && (
                    <span style={{ fontSize: '13px', color: '#8a8a8f', marginLeft: 'auto' }}>
                      {pageIdx + 1} / {pages.length}
                    </span>
                  )}
                </div>
                <div style={{ height: '1px', background: '#e3ddd2', marginBottom: '0' }} />
              </div>

              {/* Content */}
              <div
                onClick={!pageDone ? skipPage : undefined}
                style={{
                  flex: 1, padding: '20px 32px', overflow: 'hidden',
                  cursor: !pageDone ? 'pointer' : 'default',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                <div style={{ flex: 1 }}>
                  {renderMarkdown(displayed)}
                  {!pageDone && (
                    <span style={{
                      display: 'inline-block', width: '2px', height: '18px',
                      background: '#c0202a', animation: 'cursor-blink 0.8s step-end infinite',
                      verticalAlign: 'text-bottom', marginLeft: '2px',
                    }} />
                  )}
                </div>
                {/* Bottom spacer */}
                <div style={{ flexShrink: 0, height: '80px' }} />
              </div>
            </div>
          )}
        </main>

        {/* ── Prev / Next page buttons ── */}
        {pageDone && !loading && summaries.length > 0 && (pageIdx > 0 || !isLastPage) && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '12px',
            paddingTop: '40px',
            paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 12px))',
            background: 'linear-gradient(transparent, #f5f2ec 55%)',
            zIndex: 9999,
          }}>
            {/* Prev page */}
            {pageIdx > 0 && (
              <button onClick={prevPage} style={{
                background: '#ffffff', color: '#2b2b2e',
                border: '1.5px solid #e3ddd2', borderRadius: '4px',
                padding: '11px 24px',
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: '14px', fontWeight: 500,
                letterSpacing: '0.04em', cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                transition: 'border-color 0.2s',
              }}>
                ◀ 上一頁
              </button>
            )}
            {/* Next page */}
            {!isLastPage && (
              <button onClick={nextPage} style={{
                background: '#c0202a', color: '#ffffff',
                border: 'none', borderRadius: '4px',
                padding: '12px 32px',
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: '15px', fontWeight: 600,
                letterSpacing: '0.06em', cursor: 'pointer',
                animation: 'cta-pulse 1.4s ease-in-out infinite',
                boxShadow: '0 2px 8px rgba(192,32,42,0.25)',
              }}>
                繼續閱讀 ▶
              </button>
            )}
            <div style={{ position: 'absolute', bottom: '6px', left: 0, right: 0, textAlign: 'center', fontSize: '10px', color: '#c0c0c0', letterSpacing: '0.15em' }}>
              {pageIdx + 1} / {pages.length}
            </div>
          </div>
        )}
      </div>

      {/* ── Crash Alert Section ── */}
      {crashAlert && (
        <>
          {isMobile ? (
            /* Mobile: bottom banner */
            <div style={{ position: 'fixed', bottom: 'max(80px, calc(env(safe-area-inset-bottom,0px) + 72px))', left: '16px', right: '16px', zIndex: 9990 }}>
              <a href="/crash" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#fff8f8', border: '1px solid #f0c0c0', borderRadius: '8px', borderLeft: '3px solid #c0202a', boxShadow: '0 2px 8px rgba(192,32,42,0.15)' }}>
                <span style={{ fontSize: '16px' }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#c0202a' }}>IXIC 大跌 {crashAlert.ixicChange.toFixed(2)}%</div>
                  <div style={{ fontSize: '11px', color: '#8a8a8f' }}>點擊看跌幅前十名 K 線圖 →</div>
                </div>
              </a>
            </div>
          ) : (
            /* Desktop: fixed thumbnails in left/right gutters */
            <>
              {/* Left gutter: stocks #1-5 */}
              {crashAlert.composite1 && (
                <div
                  onClick={() => setCrashModal({stocks: crashAlert.marketLosers.slice(0, 5), idx: 0})}
                  style={{
                    position: 'fixed',
                    top: '50%', transform: 'translateY(-50%)',
                    left: 'calc(50% - 360px - 228px - 16px)',
                    width: '220px',
                    cursor: 'pointer', zIndex: 100,
                    background: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
                    border: '1px solid #e3ddd2',
                    overflow: 'hidden',
                    transition: 'box-shadow 0.2s',
                  }}>
                  <div style={{ padding: '6px 10px', background: '#fff8f8', borderBottom: '1px solid #f0e8e8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: '#c0202a', fontWeight: 700 }}>⚠️ #1-5</span>
                    <span style={{ fontSize: '11px', fontWeight: 900, color: '#ef5350', fontFamily: 'Georgia,serif' }}>{crashAlert.ixicChange.toFixed(2)}%</span>
                    <span style={{ fontSize: '9px', color: '#aaa', marginLeft: 'auto' }}>🔍</span>
                  </div>
                  <img src={`data:image/png;base64,${crashAlert.composite1}`} alt="crash #1-5"
                    style={{ width: '100%', display: 'block' }} />
                </div>
              )}
              {/* Right gutter: stocks #6-10 */}
              {crashAlert.composite2 && (
                <div
                  onClick={() => setCrashModal({stocks: crashAlert.marketLosers.slice(5, 10), idx: 0})}
                  style={{
                    position: 'fixed',
                    top: '50%', transform: 'translateY(-50%)',
                    right: 'calc(50% - 360px - 228px - 16px)',
                    width: '220px',
                    cursor: 'pointer', zIndex: 100,
                    background: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
                    border: '1px solid #e3ddd2',
                    overflow: 'hidden',
                  }}>
                  <div style={{ padding: '6px 10px', background: '#fff8f8', borderBottom: '1px solid #f0e8e8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: '#8a8a8f', fontWeight: 700 }}>#6-10</span>
                    <a href="/crash" onClick={e=>e.stopPropagation()} style={{ fontSize: '9px', color: '#c0202a', textDecoration: 'none', marginLeft: 'auto' }}>全部 →</a>
                  </div>
                  <img src={`data:image/png;base64,${crashAlert.composite2}`} alt="crash #6-10"
                    style={{ width: '100%', display: 'block' }} />
                </div>
              )}
            </>
          )}

          {/* Chart modal */}
          {crashModal && (
            <div onClick={() => setCrashModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '8px', overflow: 'hidden', maxWidth: '95vw', maxHeight: '90vh', width: '680px', display: 'flex', flexDirection: 'column' }}>
                {/* Modal header */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e3ddd2', background: '#fff' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a1a', flex: 1 }}>
                    {crashModal.stocks[crashModal.idx]?.symbol} — 兩年日線圖 ({crashModal.idx+1}/{crashModal.stocks.length})
                  </span>
                  <button onClick={() => setCrashModal(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#8a8a8f', padding: '0 4px' }}>×</button>
                </div>
                {/* Chart */}
                <div style={{ flex: 1, overflow: 'hidden', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img
                    src={`/api/public/crash-alert/chart?symbol=${crashModal.stocks[crashModal.idx]?.symbol}&type=market`}
                    alt={crashModal.stocks[crashModal.idx]?.symbol}
                    style={{ maxWidth: '100%', maxHeight: '60vh', display: 'block' }}
                  />
                </div>
                {/* Prev / Next */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '12px 16px', borderTop: '1px solid #e3ddd2' }}>
                  <button
                    onClick={() => setCrashModal(m => m && m.idx > 0 ? {...m, idx: m.idx-1} : m)}
                    disabled={crashModal.idx === 0}
                    style={{ padding: '8px 20px', borderRadius: '4px', border: '1px solid #e3ddd2', background: '#fff', color: crashModal.idx === 0 ? '#ccc' : '#2b2b2e', cursor: crashModal.idx === 0 ? 'default' : 'pointer', fontSize: '14px' }}>
                    ◀ 上一支
                  </button>
                  <button
                    onClick={() => setCrashModal(m => m && m.idx < m.stocks.length-1 ? {...m, idx: m.idx+1} : m)}
                    disabled={crashModal.idx === crashModal.stocks.length-1}
                    style={{ padding: '8px 20px', borderRadius: '4px', border: 'none', background: '#c0202a', color: '#fff', cursor: crashModal.idx === crashModal.stocks.length-1 ? 'default' : 'pointer', fontSize: '14px', opacity: crashModal.idx === crashModal.stocks.length-1 ? 0.4 : 1 }}>
                    下一支 ▶
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Hidden audio element */}
      <audio ref={audioRef} loop preload="none" src="/audio/bg-music.mp3" />

      {/* Music toggle button — floating bottom-left */}
      <button
        onClick={toggleMusic}
        title={isPlaying ? '關閉背景音樂' : '開啟背景音樂'}
        style={{
          position: 'fixed',
          bottom: 'max(20px, calc(env(safe-area-inset-bottom, 0px) + 16px))',
          left: '16px',
          width: '42px', height: '42px',
          borderRadius: '50%',
          background: isPlaying ? '#c0202a' : '#ffffff',
          border: '1.5px solid #e3ddd2',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px',
          zIndex: 9998,
          transition: 'all 0.25s ease',
        }}
      >
        {isPlaying ? '🔊' : '🎵'}
      </button>
    </>
  );
}
