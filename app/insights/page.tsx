'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface Summary {
  _id: string;
  tags: string[];
  source: 'manual' | 'auto';
  topic?: string;
  summary: { timelineAnalysis: string; keyNumbers: string; predictionVsReality: string };
  article?: string;
  articleTitle?: string;
  expertCount: number;
  publishedAt: string;
  createdAt: string;
}

/* ── Get Taiwan time date string ── */
function getTaiwanDate() {
  return new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}


/* ── Countdown to next 06:00 Taiwan update ── */
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
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/* ── Split article into pages by char count ── */
function splitIntoPages(text: string, limit = 600): string[] {
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

/* ── Inline markdown ── */
function renderInline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/).map((part, k) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={k} style={{ color: '#ffffff', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      : <span key={k}>{part}</span>
  );
}

function renderMarkdown(raw: string) {
  if (!raw) return null;
  return raw.split(/\n\n+/).map((block, i) => {
    const t = block.trim();
    if (!t) return null;
    if (/^-{3,}$/.test(t))
      return <hr key={i} style={{ border: 'none', borderTop: '1px solid #333333', margin: '12px 0' }} />;
    if (/^#{1,3}\s/.test(t))
      return (
        <h3 key={i} style={{ fontFamily: "'Courier New',monospace", fontSize: '16px', fontWeight: 700, color: '#cc0000', margin: '14px 0 5px', lineHeight: 1.3 }}>
          {t.replace(/^#{1,3}\s+/, '')}
        </h3>
      );
    if (t.startsWith('> '))
      return (
        <div key={i} style={{ borderLeft: '2px solid #cc0000', paddingLeft: '10px', color: '#999', fontStyle: 'italic', fontSize: '15px', margin: '8px 0', lineHeight: 1.65 }}>
          {t.replace(/^>\s?/gm, '')}
        </div>
      );
    return (
      <p key={i} style={{ marginBottom: '10px', lineHeight: 1.65, fontSize: '16px' }}>
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

/* ── Main Page ── */
export default function InsightsPage() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [topicIdx, setTopicIdx] = useState(0);
  const [todayDate, setTodayDate] = useState('');
  const [countdown, setCountdown] = useState('');

  // Pagination state
  const [pageIdx, setPageIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [charIdx, setCharIdx] = useState(0);
  const [pageDone, setPageDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [navPage, setNavPage] = useState(0);
  const NAV_PER_PAGE = 4; // tabs visible at once

  // Set Taiwan date on mount and refresh at midnight
  useEffect(() => {
    setTodayDate(getTaiwanDate());

    // Calculate ms until next midnight Taiwan time
    const now = new Date();
    const twMidnight = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    twMidnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = twMidnight.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' })).getTime();

    const t = setTimeout(() => {
      setTodayDate(getTaiwanDate());
      // After first midnight, refresh every 24h
      const interval = setInterval(() => setTodayDate(getTaiwanDate()), 24 * 60 * 60 * 1000);
      return () => clearInterval(interval);
    }, msUntilMidnight);

    return () => clearTimeout(t);
  }, []);

  // Countdown to next 06:00 update
  useEffect(() => {
    setCountdown(getCountdownTo6AM());
    const interval = setInterval(() => setCountdown(getCountdownTo6AM()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch('/api/insights?limit=5')
      .then((r) => (r.ok ? r.json() : []))
      .then(setSummaries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const active = summaries[topicIdx];
  const articleContent = active
    ? (active.article || [active.summary.timelineAnalysis, active.summary.keyNumbers, active.summary.predictionVsReality].filter(Boolean).join('\n\n---\n\n'))
    : '';
  const pages = splitIntoPages(articleContent, 600);
  const isLastPage = pageIdx >= pages.length - 1;

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDisplayed('');
    setCharIdx(0);
    setPageDone(false);
  }, [topicIdx, pageIdx]);

  useEffect(() => {
    setPageIdx(0);
  }, [topicIdx]);

  const totalNavPages = Math.ceil(summaries.length / NAV_PER_PAGE);
  const visibleSummaries = summaries.slice(navPage * NAV_PER_PAGE, (navPage + 1) * NAV_PER_PAGE);

  useEffect(() => {
    if (pageDone || !pages[pageIdx]) return;
    const current = pages[pageIdx];
    if (charIdx >= current.length) {
      setPageDone(true);
      return;
    }
    const c = current[charIdx];
    timerRef.current = setTimeout(() => {
      setDisplayed((d) => d + c);
      setCharIdx((i) => i + 1);
    }, charDelay(c));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [charIdx, pageDone, pageIdx, pages]);

  const skipPage = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const cur = pages[pageIdx] || '';
    setDisplayed(cur);
    setCharIdx(cur.length);
    setPageDone(true);
  }, [pageIdx, pages]);

  const nextPage = useCallback(() => {
    if (pageIdx < pages.length - 1) setPageIdx((p) => p + 1);
  }, [pageIdx, pages.length]);

  const getLabel = (s: Summary, i: number) => {
    const raw = s.topic || s.tags[0] || `話題${i + 1}`;
    return raw.replace(/政策題材|題材|政策/g, '').trim().slice(0, 7) || `話題${i + 1}`;
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #111111; height: 100%; }
        body { padding-bottom: env(safe-area-inset-bottom, 0px); }
        @keyframes cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes gold-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.97)} }
        @keyframes live-dot { 0%,100%{opacity:1} 50%{opacity:0.2} }
        button:focus { outline: none; }
      `}</style>

      <div style={{ height: '100svh', backgroundColor: '#111111', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', color: '#e8e8e8', position: 'relative' }}>

        {/* Header */}
        <header style={{ flexShrink: 0, padding: '8px 1rem 6px', textAlign: 'center', borderBottom: '1px solid #222', background: 'linear-gradient(180deg, #0d0d0d 0%, #111 100%)' }}>
          {/* Brand row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '2px' }}>
            <div style={{ width: '28px', height: '2px', background: '#cc0000' }} />
            <span style={{ fontSize: '0.55rem', color: '#c9a84c', letterSpacing: '0.4em', textTransform: 'uppercase' }}>Intelligence Briefing</span>
            <div style={{ width: '28px', height: '2px', background: '#cc0000' }} />
          </div>
          <h1 style={{ fontFamily: "'Courier New',monospace", fontSize: 'clamp(1.5rem,5vw,2.2rem)', fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: '0.06em' }}>JG 說真的</h1>

          {/* LIVE + Date row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#cc0000', animation: 'live-dot 1.5s ease-in-out infinite', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: '#cc0000', fontFamily: "'Courier New',monospace", fontWeight: 700, letterSpacing: '0.15em' }}>LIVE</span>
            <span style={{ fontSize: '11px', color: '#aaa', fontFamily: "'Courier New',monospace" }}>{todayDate}</span>
            <span style={{ fontSize: '10px', color: '#555', fontFamily: "'Courier New',monospace" }}>· 每日更新</span>
          </div>

          {/* Countdown box — most prominent element */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: '#1a1a1a', border: '1px solid #333',
            borderTop: '2px solid #c9a84c',
            padding: '5px 16px', borderRadius: '2px',
          }}>
            <span style={{ fontSize: '10px', color: '#c9a84c', fontFamily: "'Courier New',monospace", letterSpacing: '0.12em', textTransform: 'uppercase' }}>下次更新</span>
            <span style={{
              fontFamily: "'Courier New',monospace",
              fontSize: 'clamp(1.1rem,3.5vw,1.6rem)',
              fontWeight: 900,
              color: '#fff',
              letterSpacing: '0.08em',
              fontVariantNumeric: 'tabular-nums',
            }}>{countdown}</span>
            <span style={{ fontSize: '10px', color: '#555', fontFamily: "'Courier New',monospace" }}>06:00 TST</span>
          </div>
        </header>

        {/* Topic Nav */}
        {!loading && summaries.length > 0 && (
          <nav style={{ flexShrink: 0, backgroundColor: '#111', borderBottom: '1px solid #2a2a2a' }}>
            {/* Nav tabs row */}
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              {/* Prev arrow */}
              {totalNavPages > 1 && (
                <button
                  onClick={() => setNavPage(p => Math.max(0, p - 1))}
                  disabled={navPage === 0}
                  style={{
                    flexShrink: 0, width: '32px', background: 'none', border: 'none',
                    borderRight: '1px solid #2a2a2a',
                    color: navPage === 0 ? '#2a2a2a' : '#c9a84c',
                    fontSize: '16px', cursor: navPage === 0 ? 'default' : 'pointer',
                    fontFamily: "'Courier New',monospace",
                  }}
                >‹</button>
              )}

              {/* Visible tabs */}
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {visibleSummaries.map((s, relIdx) => {
                  const idx = navPage * NAV_PER_PAGE + relIdx;
                  const isSel = idx === topicIdx;
                  return (
                    <button
                      key={s._id}
                      onClick={() => setTopicIdx(idx)}
                      style={{
                        flex: 1, padding: '0.6rem 0.5rem', background: isSel ? '#1c1c1c' : 'none',
                        border: 'none',
                        borderBottom: isSel ? '2px solid #cc0000' : '2px solid transparent',
                        borderRight: relIdx < visibleSummaries.length - 1 ? '1px solid #2a2a2a' : 'none',
                        color: isSel ? '#ffffff' : '#666',
                        fontSize: 'clamp(0.68rem, 2vw, 0.8rem)',
                        fontFamily: "'Courier New',monospace",
                        fontWeight: isSel ? 700 : 400,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        transition: 'color 0.2s, background 0.2s',
                        letterSpacing: isSel ? '0.04em' : '0',
                      }}
                    >
                      {isSel && <span style={{ color: '#cc0000', marginRight: '4px' }}>▌</span>}
                      {getLabel(s, idx)}
                    </button>
                  );
                })}
                {/* Fill empty slots if last page has fewer tabs */}
                {Array.from({ length: NAV_PER_PAGE - visibleSummaries.length }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ flex: 1 }} />
                ))}
              </div>

              {/* Next arrow */}
              {totalNavPages > 1 && (
                <button
                  onClick={() => setNavPage(p => Math.min(totalNavPages - 1, p + 1))}
                  disabled={navPage >= totalNavPages - 1}
                  style={{
                    flexShrink: 0, width: '32px', background: 'none', border: 'none',
                    borderLeft: '1px solid #2a2a2a',
                    color: navPage >= totalNavPages - 1 ? '#2a2a2a' : '#c9a84c',
                    fontSize: '16px', cursor: navPage >= totalNavPages - 1 ? 'default' : 'pointer',
                    fontFamily: "'Courier New',monospace",
                  }}
                >›</button>
              )}
            </div>

            {/* Dot indicators when multiple pages */}
            {totalNavPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', padding: '4px 0' }}>
                {Array.from({ length: totalNavPages }).map((_, i) => (
                  <div
                    key={i}
                    onClick={() => setNavPage(i)}
                    style={{
                      width: i === navPage ? '14px' : '5px', height: '5px',
                      borderRadius: '3px',
                      background: i === navPage ? '#cc0000' : '#333',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                    }}
                  />
                ))}
              </div>
            )}
          </nav>
        )}

        {/* Article area */}
        <main style={{ flex: 1, overflow: 'hidden', maxWidth: '980px', width: '100%', margin: '0 auto', padding: '8px 12px 0', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ textAlign: 'center', paddingTop: '4rem', color: '#555' }}>載入情報中...</div>
          ) : summaries.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '4rem', color: '#555' }}>尚無情報</div>
          ) : (
            <div style={{ flex: 1, overflow: 'hidden', background: '#1a1a1a', borderLeft: '3px solid #7a0000', borderRadius: '4px', display: 'flex', flexDirection: 'column' }}>
              {/* Card header */}
              <div style={{ flexShrink: 0, padding: '12px 16px 6px' }}>
                {active?.articleTitle && (
                  <h2 style={{ fontFamily: "'Courier New',monospace", fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 700, color: '#fff', lineHeight: 1.25, margin: '0 0 8px' }}>
                    {active.articleTitle}
                  </h2>
                )}
                {pages.length > 1 && (
                  <div style={{ fontSize: '11px', color: '#444', fontFamily: "'Courier New',monospace" }}>
                    {pageIdx + 1} / {pages.length}
                  </div>
                )}
              </div>

              {/* Content */}
              <div
                onClick={!pageDone ? skipPage : undefined}
                style={{ flex: 1, padding: '0 16px', overflow: 'hidden', cursor: !pageDone ? 'pointer' : 'default', display: 'flex', flexDirection: 'column' }}
              >
                {renderMarkdown(displayed)}
                {!pageDone && (
                  <span style={{ display: 'inline-block', width: '9px', height: '1.1em', background: '#cc0000', animation: 'cursor-blink 1s step-end infinite', verticalAlign: 'text-bottom', marginLeft: '2px' }} />
                )}
                {/* Bottom spacer — keeps text away from browser toolbar */}
                <div style={{ flexShrink: 0, height: '72px', minHeight: '72px' }} />
              </div>
            </div>
          )}
        </main>

        {/* GOLD CONTINUE BUTTON */}
        {pageDone && !isLastPage && !loading && summaries.length > 0 && (
          <div
            onClick={nextPage}
            style={{
              position: 'fixed',
              bottom: 0, left: 0, right: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              paddingTop: '48px',
              paddingBottom: 'max(32px, calc(env(safe-area-inset-bottom, 0px) + 20px))',
              background: 'linear-gradient(transparent, #111111 40%)',
              zIndex: 9999,
              cursor: 'pointer',
            }}
          >
            <div style={{
              background: '#c9a84c',
              color: '#000000',
              fontFamily: "'Courier New',monospace",
              fontSize: '18px',
              fontWeight: 900,
              padding: '15px 56px',
              letterSpacing: '0.12em',
              animation: 'gold-pulse 1.3s ease-in-out infinite',
              minWidth: '240px',
              textAlign: 'center',
              userSelect: 'none',
            }}>
              ▶▶ 下一頁
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#c9a84c', letterSpacing: '0.2em', opacity: 0.6 }}>
              TAP TO CONTINUE
            </div>
          </div>
        )}
      </div>
    </>
  );
}
