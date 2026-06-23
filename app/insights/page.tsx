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

/* ── Split article into pages by char count ── */
function splitIntoPages(text: string, limit = 900): string[] {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  const pages: string[] = [];
  let cur = '';
  for (const p of paragraphs) {
    const next = cur ? cur + '\n\n' + p : p;
    if (cur && next.length > limit) {
      pages.push(cur);
      cur = p;
    } else {
      cur = next;
    }
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
      return <hr key={i} style={{ border: 'none', borderTop: '1px solid #cc0000', margin: '1.5rem 0', opacity: 0.35 }} />;
    if (t.startsWith('## '))
      return (
        <div key={i}>
          <hr style={{ border: 'none', borderTop: '1px solid #2a2a2a', margin: '1.75rem 0 0.75rem' }} />
          <h3 style={{ fontFamily: "'Courier New',monospace", fontSize: '1rem', fontWeight: 700, color: '#cc0000', marginBottom: '0.6rem' }}>
            {t.replace(/^##\s+/, '')}
          </h3>
        </div>
      );
    if (t.startsWith('> '))
      return (
        <div key={i} style={{ borderLeft: '3px solid #cc0000', paddingLeft: '0.875rem', color: '#999', fontStyle: 'italic', fontSize: '0.88rem', margin: '0.75rem 0', lineHeight: 1.8 }}>
          {t.replace(/^>\s?/gm, '')}
        </div>
      );
    return (
      <p key={i} style={{ marginBottom: '0.9rem', lineHeight: 1.85 }}>
        {t.split('\n').map((line, j, arr) => (
          <span key={j}>{renderInline(line)}{j < arr.length - 1 && <br />}</span>
        ))}
      </p>
    );
  });
}

/* ── Typed page delay per char ── */
function charDelay(c: string) {
  if ([',', '，', '、'].includes(c)) return 350;
  if (['.', '。', '?', '？', '!', '！'].includes(c)) return 600;
  return 22;
}

/* ── Paged Typewriter Component ── */
function PagedView({ article, title, date }: { article: string; title?: string; date: string }) {
  const pages = splitIntoPages(article, 850);
  const [pageIdx, setPageIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [charIdx, setCharIdx] = useState(0);
  const [pageDone, setPageDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on page change
  useEffect(() => {
    setDisplayed('');
    setCharIdx(0);
    setPageDone(false);
  }, [pageIdx]);

  // Typing tick
  useEffect(() => {
    if (pageDone) return;
    const current = pages[pageIdx] || '';
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
    setDisplayed(pages[pageIdx] || '');
    setCharIdx((pages[pageIdx] || '').length);
    setPageDone(true);
  }, [pageIdx, pages]);

  const nextPage = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (pageIdx < pages.length - 1) setPageIdx((p) => p + 1);
  }, [pageIdx, pages.length]);

  const isLastPage = pageIdx >= pages.length - 1;

  return (
    <>
      <div style={{ flexShrink: 0, padding: '1.25rem 1.5rem 0.5rem' }}>
        <div style={{ fontSize: '0.7rem', color: '#c9a84c', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>{date}</div>
        {title && (
          <h2 style={{ fontFamily: "'Courier New',monospace", fontSize: 'clamp(1rem, 3vw, 1.35rem)', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '1rem' }}>
            {title}
          </h2>
        )}
        {pages.length > 1 && (
          <div style={{ fontSize: '0.65rem', color: '#444', marginBottom: '0.25rem', fontFamily: "'Courier New',monospace" }}>
            {pageIdx + 1} / {pages.length}
          </div>
        )}
      </div>

      {/* Page content – only current page */}
      <div
        onClick={!pageDone ? skipPage : undefined}
        style={{
          flex: 1,
          padding: '0 1.5rem 1rem',
          fontSize: '0.9rem',
          lineHeight: 1.85,
          color: '#e8e8e8',
          overflow: 'hidden',
          cursor: !pageDone ? 'pointer' : 'default',
        }}
      >
        {renderMarkdown(displayed)}
        {!pageDone && (
          <span style={{ display: 'inline-block', width: '9px', height: '1.1em', background: '#cc0000', animation: 'cursor-blink 1s step-end infinite', verticalAlign: 'text-bottom', marginLeft: '2px' }} />
        )}
      </div>

      {!pageDone && (
        <div style={{ textAlign: 'center', padding: '0 0 0.5rem', fontSize: '0.65rem', color: '#333', flexShrink: 0 }}>
          點擊畫面跳過
        </div>
      )}

      {/* Continue button – teleported to portal-like fixed via sibling */}
      {pageDone && !isLastPage && (
        <ContinueBtn onClick={nextPage} />
      )}
    </>
  );
}

/* ── Continue button rendered at fixed position ── */
function ContinueBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: '28px',
        right: '28px',
        background: 'transparent',
        border: '1px solid #cc0000',
        color: '#cc0000',
        fontFamily: "'Courier New',monospace",
        fontSize: '13px',
        padding: '9px 18px',
        cursor: 'pointer',
        zIndex: 9999,
        animation: 'btn-blink 1.2s ease-in-out infinite',
        letterSpacing: '0.05em',
      }}
    >
      ▶ 繼續
    </button>
  );
}

/* ── Main Page ── */
export default function InsightsPage() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [topicIdx, setTopicIdx] = useState(0);

  useEffect(() => {
    fetch('/api/insights?limit=5')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { setSummaries(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getLabel = (s: Summary, i: number) => {
    const raw = s.topic || s.tags[0] || `話題${i + 1}`;
    return raw.replace(/政策題材|題材|政策/g, '').trim().slice(0, 7) || `話題${i + 1}`;
  };

  const active = summaries[topicIdx];
  const date = active
    ? new Date(active.publishedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const articleContent = active
    ? (active.article ||
        [active.summary.timelineAnalysis, active.summary.keyNumbers, active.summary.predictionVsReality]
          .filter(Boolean).join('\n\n---\n\n'))
    : '';

  return (
    <div
      style={{ height: '100dvh', overflow: 'hidden', backgroundColor: '#080808', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', color: '#e8e8e8' }}
    >
      <style>{`
        @keyframes cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes btn-blink { 0%,100%{opacity:1} 50%{opacity:0.25} }
        button:focus { outline: none; }
      `}</style>

      {/* Header */}
      <header style={{ flexShrink: 0, padding: '1.25rem 1rem 0.9rem', textAlign: 'center', borderBottom: '1px solid #222' }}>
        <div style={{ fontSize: '0.6rem', color: '#c9a84c', letterSpacing: '0.35em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Intelligence Briefing</div>
        <h1 style={{ fontFamily: "'Courier New',monospace", fontSize: 'clamp(1.3rem,4vw,1.8rem)', fontWeight: 700, color: '#fff', margin: 0 }}>JG 說真的</h1>
        <div style={{ width: '44px', height: '2px', background: '#cc0000', margin: '0.6rem auto 0', borderRadius: '1px' }} />
      </header>

      {/* Topic Nav */}
      {!loading && summaries.length > 0 && (
        <nav style={{ flexShrink: 0, backgroundColor: '#111', borderBottom: '1px solid #2a2a2a', display: 'flex', overflowX: 'auto', padding: '0 0.5rem' }}>
          {summaries.map((s, idx) => {
            const active = idx === topicIdx;
            return (
              <button
                key={s._id}
                onClick={() => setTopicIdx(idx)}
                style={{
                  flex: 'none',
                  padding: '0.55rem 1rem',
                  background: 'none',
                  border: 'none',
                  borderBottom: active ? '2px solid #cc0000' : '2px solid transparent',
                  color: active ? '#fff' : '#555',
                  fontSize: '0.78rem',
                  fontFamily: "'Courier New',monospace",
                  fontWeight: active ? 700 : 400,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                  borderRight: idx < summaries.length - 1 ? '1px solid #222' : 'none',
                }}
              >
                {getLabel(s, idx)}
              </button>
            );
          })}
        </nav>
      )}

      {/* Card */}
      <main style={{ flex: 1, overflow: 'hidden', maxWidth: '720px', width: '100%', margin: '0 auto', padding: '0.75rem', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: '4rem', color: '#555' }}>載入情報中...</div>
        ) : summaries.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '4rem', color: '#555' }}>尚無情報</div>
        ) : (
          <div
            key={`topic-${topicIdx}`}
            style={{ flex: 1, overflow: 'hidden', background: '#1a1a1a', borderLeft: '3px solid #7a0000', borderRadius: '6px', display: 'flex', flexDirection: 'column' }}
          >
            <PagedView article={articleContent} title={active?.articleTitle} date={date} />
          </div>
        )}
      </main>
    </div>
  );
}
