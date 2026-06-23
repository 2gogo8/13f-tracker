'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface Summary {
  _id: string;
  tags: string[];
  source: 'manual' | 'auto';
  topic?: string;
  summary: {
    timelineAnalysis: string;
    keyNumbers: string;
    predictionVsReality: string;
  };
  article?: string;
  articleTitle?: string;
  expertCount: number;
  publishedAt: string;
  createdAt: string;
}

/* ── Inline markdown renderer ── */
function renderInline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/).map((part, k) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={k} style={{ color: '#ffffff', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={k}>{part}</span>;
  });
}

function renderMarkdown(raw: string) {
  if (!raw) return null;
  const blocks = raw.split(/\n\n+/);
  return blocks.map((block, i) => {
    const t = block.trim();
    if (!t) return null;
    if (/^-{3,}$/.test(t)) {
      return <hr key={i} style={{ border: 'none', borderTop: '1px solid #cc0000', margin: '1.5rem 0', opacity: 0.4 }} />;
    }
    if (t.startsWith('## ')) {
      return (
        <div key={i}>
          <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '2rem 0 1rem' }} />
          <h3 style={{ fontFamily: "'Courier New', monospace", fontSize: '1.1rem', fontWeight: 700, color: '#cc0000', marginBottom: '0.75rem' }}>
            {t.replace(/^##\s+/, '')}
          </h3>
        </div>
      );
    }
    if (t.startsWith('> ')) {
      return (
        <div key={i} style={{ borderLeft: '3px solid #cc0000', paddingLeft: '1rem', color: '#999', fontStyle: 'italic', fontSize: '0.88rem', margin: '1rem 0', lineHeight: 1.8 }}>
          {t.replace(/^>\s?/gm, '')}
        </div>
      );
    }
    return (
      <p key={i} style={{ marginBottom: '1rem', lineHeight: 1.9 }}>
        {t.split('\n').map((line, j, arr) => (
          <span key={j}>{renderInline(line)}{j < arr.length - 1 && <br />}</span>
        ))}
      </p>
    );
  });
}

/* ── Paged Typewriter ── */
const TYPING_SPEEDS: Record<string, number> = {
  normal: 28,
  comma: 400,
  period: 700,
  newline: 900,
};

function getDelay(char: string): number {
  if ([',', '，', '、'].includes(char)) return TYPING_SPEEDS.comma;
  if (['.', '。', '?', '？', '!', '！'].includes(char)) return TYPING_SPEEDS.period;
  return TYPING_SPEEDS.normal;
}

function PagedArticle({ article, title, date }: { article: string; title?: string; date: string }) {
  const chunks = article.split(/\n\n+/).filter(Boolean);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [charIndex, setCharIndex] = useState(0);
  const [showContinue, setShowContinue] = useState(false);
  const [done, setDone] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navH = 110; // approximate header+nav height

  const currentChunkText = chunks[chunkIndex] || '';

  // Reset when chunk changes
  useEffect(() => {
    setDisplayed('');
    setCharIndex(0);
    setShowContinue(false);
    setDone(false);
  }, [chunkIndex]);

  // Typing tick
  useEffect(() => {
    if (showContinue || done) return;
    if (charIndex >= currentChunkText.length) {
      // Chunk finished — check if more chunks remain
      if (chunkIndex < chunks.length - 1) {
        // Check height: if we're near the limit, show continue button
        const contentEl = contentRef.current;
        const limit = window.innerHeight - navH - 80;
        if (contentEl && contentEl.scrollHeight >= limit) {
          setShowContinue(true);
        } else {
          // Room for next chunk — auto-advance after newline pause
          timerRef.current = setTimeout(() => {
            setChunkIndex((c) => c + 1);
          }, TYPING_SPEEDS.newline);
        }
      } else {
        setDone(true);
      }
      return;
    }

    const char = currentChunkText[charIndex];
    const delay = getDelay(char);
    timerRef.current = setTimeout(() => {
      const next = displayed + char;
      setDisplayed(next);
      setCharIndex((i) => i + 1);

      // Height check mid-typing
      const contentEl = contentRef.current;
      const limit = window.innerHeight - navH - 80;
      if (contentEl && contentEl.scrollHeight >= limit) {
        setShowContinue(true);
      }
    }, delay);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [charIndex, displayed, currentChunkText, showContinue, done, chunkIndex, chunks.length]);

  const handleContinue = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setChunkIndex((c) => c + 1);
  }, []);

  const handleSkip = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Show all remaining text at once
    const remaining = chunks.slice(chunkIndex).join('\n\n');
    setDisplayed(remaining);
    setCharIndex(remaining.length);
    setChunkIndex(chunks.length - 1);
    setShowContinue(false);
    setDone(true);
  }, [chunkIndex, chunks]);

  // Full text to render (for done state: all chunks up to current)
  const fullRendered = done
    ? article
    : chunks.slice(0, chunkIndex).join('\n\n') + (chunkIndex < chunks.length ? '\n\n' + displayed : '');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Title + date */}
      <div style={{ flexShrink: 0, padding: '1.25rem 1.5rem 0' }}>
        <div style={{ fontSize: '0.72rem', color: '#b8962e', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>
          {date}
        </div>
        {title && (
          <h2 style={{ fontFamily: "'Courier New', monospace", fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: 700, color: '#ffffff', lineHeight: 1.3, marginBottom: '1.25rem' }}>
            {title}
          </h2>
        )}
      </div>

      {/* Scrollable content area (but overflow hidden on parent) */}
      <div
        ref={contentRef}
        onClick={!done && !showContinue ? handleSkip : undefined}
        style={{
          flex: 1,
          padding: '0 1.5rem 1.5rem',
          fontSize: '0.93rem',
          lineHeight: 1.9,
          color: '#e8e8e8',
          cursor: !done && !showContinue ? 'pointer' : 'default',
          overflow: 'hidden',
        }}
      >
        {renderMarkdown(fullRendered)}
        {!done && !showContinue && (
          <span style={{ display: 'inline-block', width: '10px', height: '1em', background: '#cc0000', animation: 'blink-cursor 1s step-end infinite', verticalAlign: 'text-bottom', marginLeft: '2px' }} />
        )}
      </div>

      {/* Skip hint */}
      {!done && !showContinue && (
        <div style={{ textAlign: 'center', padding: '0 0 0.75rem', fontSize: '0.7rem', color: '#444', flexShrink: 0 }}>
          點擊畫面跳過
        </div>
      )}

      {/* ▶ 繼續 button */}
      {showContinue && !done && (
        <button
          onClick={handleContinue}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'transparent',
            border: '1px solid #cc0000',
            color: '#cc0000',
            fontFamily: "'Courier New', monospace",
            fontSize: '13px',
            padding: '8px 16px',
            cursor: 'pointer',
            animation: 'blink-btn 1.2s ease-in-out infinite',
            zIndex: 100,
          }}
        >
          ▶ 繼續
        </button>
      )}
    </div>
  );
}

/* ── Main Page ── */
export default function InsightsPage() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    fetch('/api/insights?limit=5')
      .then((r) => r.ok ? r.json() : [])
      .then(setSummaries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getTopicLabel = (s: Summary) => {
    if (s.topic) return s.topic.replace('政策題材', '').replace('題材', '').trim().slice(0, 8);
    if (s.tags[0]) return s.tags[0].slice(0, 8);
    return `話題 ${summaries.indexOf(s) + 1}`;
  };

  const active = summaries[activeIndex];

  const date = active
    ? new Date(active.publishedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const articleContent = active
    ? (active.article || [active.summary.timelineAnalysis, active.summary.keyNumbers, active.summary.predictionVsReality].filter(Boolean).join('\n\n---\n\n'))
    : '';

  return (
    <div
      style={{
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#080808',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#e8e8e8',
      }}
    >
      <style>{`
        @keyframes blink-cursor { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes blink-btn { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>

      {/* Header */}
      <header style={{ flexShrink: 0, paddingTop: '1.5rem', paddingBottom: '1rem', textAlign: 'center', borderBottom: '1px solid #333' }}>
        <div style={{ fontSize: '0.65rem', color: '#c9a84c', letterSpacing: '0.35em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
          Intelligence Briefing
        </div>
        <h1 style={{ fontFamily: "'Courier New', monospace", fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 700, color: '#ffffff', margin: 0 }}>
          JG 說真的
        </h1>
        <div style={{ width: '48px', height: '2px', background: '#cc0000', margin: '0.75rem auto 0', borderRadius: '2px' }} />
      </header>

      {/* Topic Nav */}
      {!loading && summaries.length > 0 && (
        <nav style={{ flexShrink: 0, backgroundColor: '#111111', borderBottom: '1px solid #333333', display: 'flex', overflowX: 'auto', padding: '0 0.5rem' }}>
          {summaries.map((s, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={s._id}
                onClick={() => setActiveIndex(idx)}
                style={{
                  flex: 'none',
                  padding: '0.6rem 1rem',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #cc0000' : '2px solid transparent',
                  color: isActive ? '#ffffff' : '#666666',
                  fontSize: '0.8rem',
                  fontFamily: "'Courier New', monospace",
                  fontWeight: isActive ? 700 : 400,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                  letterSpacing: '0.03em',
                  borderRight: idx < summaries.length - 1 ? '1px solid #2a2a2a' : 'none',
                }}
              >
                {getTopicLabel(s)}
              </button>
            );
          })}
        </nav>
      )}

      {/* Content */}
      <main style={{ flex: 1, overflow: 'hidden', maxWidth: '760px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: '4rem', color: '#666' }}>載入中...</div>
        ) : summaries.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '4rem', color: '#666' }}>尚無情報</div>
        ) : (
          <div
            key={`${active._id}-${activeIndex}`}
            style={{
              flex: 1,
              overflow: 'hidden',
              background: '#1a1a1a',
              borderLeft: '3px solid #7a0000',
              margin: '1rem',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <PagedArticle
              article={articleContent}
              title={active.articleTitle}
              date={date}
            />
          </div>
        )}
      </main>
    </div>
  );
}
