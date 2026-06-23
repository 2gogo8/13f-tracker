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

  // Pagination state
  const [pageIdx, setPageIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [charIdx, setCharIdx] = useState(0);
  const [pageDone, setPageDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        body { margin: 0; background: #111111; }
        @keyframes cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes gold-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.97)} }
        @keyframes live-dot { 0%,100%{opacity:1} 50%{opacity:0.2} }
        button:focus { outline: none; }
      `}</style>

      <div style={{ height: '100dvh', backgroundColor: '#111111', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', color: '#e8e8e8', position: 'relative' }}>

        {/* Header */}
        <header style={{ flexShrink: 0, padding: '10px 1rem 8px', textAlign: 'center', borderBottom: '1px solid #222' }}>
          <div style={{ fontSize: '0.6rem', color: '#c9a84c', letterSpacing: '0.35em', textTransform: 'uppercase', marginBottom: '3px' }}>Intelligence Briefing</div>
          <h1 style={{ fontFamily: "'Courier New',monospace", fontSize: 'clamp(1.3rem,4vw,1.8rem)', fontWeight: 700, color: '#fff', margin: 0 }}>JG 說真的</h1>
          <div style={{ width: '44px', height: '2px', background: '#cc0000', margin: '6px auto 6px' }} />

          {/* Date bar — Taiwan time, updates at midnight */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {/* LIVE dot */}
            <span style={{
              display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
              background: '#cc0000', animation: 'live-dot 1.5s ease-in-out infinite',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: '12px', color: '#cc0000', fontFamily: "'Courier New',monospace", fontWeight: 700, letterSpacing: '0.12em' }}>
              LIVE
            </span>
            <span style={{ fontSize: '12px', color: '#888', fontFamily: "'Courier New',monospace" }}>
              {todayDate}
            </span>
            <span style={{ fontSize: '11px', color: '#555', fontFamily: "'Courier New',monospace", letterSpacing: '0.08em' }}>
              · 每日更新
            </span>
          </div>
        </header>

        {/* Topic Nav */}
        {!loading && summaries.length > 0 && (
          <nav style={{ flexShrink: 0, backgroundColor: '#111', borderBottom: '1px solid #2a2a2a', display: 'flex', overflowX: 'auto', padding: '0 0.5rem' }}>
            {summaries.map((s, idx) => {
              const isSel = idx === topicIdx;
              return (
                <button key={s._id} onClick={() => setTopicIdx(idx)} style={{
                  flex: 'none', padding: '0.55rem 1rem', background: 'none', border: 'none',
                  borderBottom: isSel ? '2px solid #cc0000' : '2px solid transparent',
                  color: isSel ? '#fff' : '#555', fontSize: '0.78rem',
                  fontFamily: "'Courier New',monospace", fontWeight: isSel ? 700 : 400,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  borderRight: idx < summaries.length - 1 ? '1px solid #222' : 'none',
                }}>
                  {getLabel(s, idx)}
                </button>
              );
            })}
          </nav>
        )}

        {/* Article area */}
        <main style={{ flex: 1, overflow: 'hidden', maxWidth: '980px', width: '100%', margin: '0 auto', padding: '8px 12px', display: 'flex', flexDirection: 'column' }}>
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
                style={{ flex: 1, padding: '0 16px 8px', overflow: 'hidden', cursor: !pageDone ? 'pointer' : 'default' }}
              >
                {renderMarkdown(displayed)}
                {!pageDone && (
                  <span style={{ display: 'inline-block', width: '9px', height: '1.1em', background: '#cc0000', animation: 'cursor-blink 1s step-end infinite', verticalAlign: 'text-bottom', marginLeft: '2px' }} />
                )}
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
              padding: '48px 0 32px',
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
