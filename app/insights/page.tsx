'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

/* ── Types ── */
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

/* ── Typewriter Hook ── */
function useTypewriter(text: string, speed = 25) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    if (!text) { setDone(true); return; }
    let i = 0;
    intervalRef.current = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDone(true);
      }
    }, speed);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [text, speed]);

  const skip = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setDisplayed(text);
    setDone(true);
  }, [text]);

  return { displayed, done, skip };
}

/* ── Markdown Renderer (native, no deps) ── */
function renderMarkdown(raw: string) {
  if (!raw) return null;
  const blocks = raw.split(/\n\n+/);

  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    // Horizontal rule
    if (/^-{3,}$/.test(trimmed)) {
      return (
        <hr
          key={i}
          style={{
            border: 'none',
            borderTop: '1px solid #cc0000',
            margin: '1.75rem 0',
            opacity: 0.4,
          }}
        />
      );
    }

    // ## Heading
    if (trimmed.startsWith('## ')) {
      return (
        <div key={i}>
          <hr
            style={{
              border: 'none',
              borderTop: '1px solid #333333',
              margin: '2rem 0 1rem',
            }}
          />
          <h3
            style={{
              fontFamily: 'Georgia, "Noto Serif TC", serif',
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#cc0000',
              marginBottom: '0.75rem',
            }}
          >
            {trimmed.replace(/^##\s+/, '')}
          </h3>
        </div>
      );
    }

    // # Heading
    if (trimmed.startsWith('# ')) {
      return (
        <h2
          key={i}
          style={{
            fontFamily: 'Georgia, "Noto Serif TC", serif',
            fontSize: '1.4rem',
            fontWeight: 700,
            color: '#cc0000',
            marginBottom: '0.75rem',
            marginTop: '1.5rem',
          }}
        >
          {trimmed.replace(/^#\s+/, '')}
        </h2>
      );
    }

    // ### Heading
    if (trimmed.startsWith('### ')) {
      return (
        <h4
          key={i}
          style={{
            fontFamily: 'Georgia, "Noto Serif TC", serif',
            fontSize: '1.1rem',
            fontWeight: 700,
            color: '#cc0000',
            marginBottom: '0.5rem',
            marginTop: '1.25rem',
          }}
        >
          {trimmed.replace(/^###\s+/, '')}
        </h4>
      );
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const quoteText = trimmed.replace(/^>\s?/gm, '');
      return (
        <div
          key={i}
          style={{
            borderLeft: '3px solid #cc0000',
            paddingLeft: '1rem',
            color: '#999',
            fontStyle: 'italic',
            fontSize: '0.9rem',
            margin: '1rem 0',
            lineHeight: 1.8,
          }}
        >
          {quoteText}
        </div>
      );
    }

    // Paragraph with inline bold
    const lines = trimmed.split('\n');
    return (
      <p key={i} style={{ marginBottom: '1rem', lineHeight: 1.9 }}>
        {lines.map((line, j) => {
          const parts = renderInline(line);
          return (
            <span key={j}>
              {parts}
              {j < lines.length - 1 && <br />}
            </span>
          );
        })}
      </p>
    );
  });
}

function renderInline(line: string) {
  // Handle **bold**
  return line.split(/(\*\*[^*]+\*\*)/).map((part, k) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={k} style={{ color: '#ffffff', fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={k}>{part}</span>;
  });
}

/* ── Article Card with Typewriter ── */
function ArticleCard({ summary, isActive }: { summary: Summary; isActive: boolean }) {
  const content = summary.article || [
    summary.summary.timelineAnalysis,
    summary.summary.keyNumbers,
    summary.summary.predictionVsReality,
  ].filter(Boolean).join('\n\n---\n\n');

  const { displayed, done, skip } = useTypewriter(
    isActive ? content : '',
    25
  );

  const date = new Date(summary.publishedAt).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article
      style={{
        background: '#1a1a1a',
        borderRadius: '8px',
        padding: 'clamp(1.5rem, 4vw, 2.5rem)',
        borderLeft: '3px solid #7a0000',
        position: 'relative',
        cursor: done ? 'default' : 'pointer',
      }}
      onClick={() => { if (!done) skip(); }}
    >
      {/* Date */}
      <div
        style={{
          fontSize: '0.75rem',
          color: '#b8962e',
          letterSpacing: '0.1em',
          marginBottom: '0.75rem',
          fontWeight: 500,
        }}
      >
        {date}
      </div>

      {/* Title */}
      {summary.articleTitle && (
        <h2
          style={{
            fontFamily: 'Georgia, "Noto Serif TC", serif',
            fontSize: 'clamp(1.3rem, 3vw, 1.75rem)',
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.3,
            marginBottom: '1.5rem',
          }}
        >
          {summary.articleTitle}
        </h2>
      )}

      {/* Content with typewriter */}
      <div
        style={{
          fontSize: '0.95rem',
          lineHeight: 1.9,
          color: '#e8e8e8',
        }}
      >
        {done ? renderMarkdown(content) : renderMarkdown(displayed)}
      </div>

      {/* Skip hint */}
      {!done && (
        <div
          style={{
            textAlign: 'center',
            marginTop: '1rem',
            fontSize: '0.75rem',
            color: '#666666',
            animation: 'pulse 2s infinite',
          }}
        >
          點擊跳過打字效果
        </div>
      )}
    </article>
  );
}

/* ── Main Page ── */
export default function InsightsPage() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    async function fetchSummaries() {
      try {
        const res = await fetch('/api/insights?limit=5');
        if (res.ok) {
          const data = await res.json();
          setSummaries(data);
        }
      } catch (err) {
        console.error('Failed to fetch insights:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSummaries();
  }, []);

  const truncate = (s: string, max = 25) =>
    s.length > max ? s.slice(0, max) + '...' : s;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#080808',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
        color: '#e8e8e8',
      }}
    >
      {/* Pulse animation for skip hint */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* ── Header ── */}
      <header style={{ paddingTop: '3rem', paddingBottom: '2rem', textAlign: 'center' }}>
        <div
          style={{
            fontSize: '0.7rem',
            color: '#b8962e',
            letterSpacing: '0.35em',
            textTransform: 'uppercase',
            fontWeight: 500,
            marginBottom: '0.75rem',
          }}
        >
          Intelligence Briefing
        </div>
        <h1
          style={{
            fontFamily: 'Georgia, "Noto Serif TC", serif',
            fontSize: 'clamp(2rem, 5vw, 3rem)',
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          JG 說真的
        </h1>
        <div
          style={{
            width: '60px',
            height: '3px',
            background: '#cc0000',
            margin: '1.25rem auto 0',
            borderRadius: '2px',
          }}
        />
      </header>

      {/* ── Tab Navigation ── */}
      {!loading && summaries.length > 1 && (
        <nav
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            backgroundColor: '#111111',
            borderBottom: '1px solid #333333',
            display: 'flex',
            overflowX: 'auto',
            maxWidth: '800px',
            margin: '0 auto',
          }}
        >
          {summaries.map((s, idx) => {
            const isActive = idx === activeIndex;
            const label = s.articleTitle || s.topic || `文章 ${idx + 1}`;
            return (
              <button
                key={s._id}
                onClick={() => setActiveIndex(idx)}
                style={{
                  flex: 'none',
                  padding: '0.75rem 1.25rem',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #cc0000' : '2px solid transparent',
                  color: isActive ? '#ffffff' : '#666666',
                  fontSize: '0.8rem',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.2s, border-color 0.2s',
                  borderRight: idx < summaries.length - 1 ? '1px solid #333333' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.target as HTMLElement).style.color = '#999';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.target as HTMLElement).style.color = '#666666';
                }}
              >
                {truncate(label)}
              </button>
            );
          })}
        </nav>
      )}

      {/* ── Content ── */}
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem 4rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <div
              style={{
                display: 'inline-block',
                width: '32px',
                height: '32px',
                border: '2px solid #333333',
                borderTopColor: '#cc0000',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: '#666666', marginTop: '1rem', fontSize: '0.85rem' }}>
              載入中...
            </p>
          </div>
        ) : summaries.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <p style={{ color: '#666666', fontSize: '1rem' }}>尚無情報</p>
          </div>
        ) : (
          <ArticleCard
            key={summaries[activeIndex]._id}
            summary={summaries[activeIndex]}
            isActive={true}
          />
        )}
      </main>

      {/* ── CTA ── */}
      {!loading && summaries.length > 0 && (
        <footer
          style={{
            borderTop: '1px solid #333333',
            padding: '3rem 1rem',
            textAlign: 'center',
            background: '#0c0c0c',
          }}
        >
          <p
            style={{
              fontSize: '0.75rem',
              color: '#b8962e',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: '0.5rem',
            }}
          >
            Exclusive Access
          </p>
          <p
            style={{
              fontFamily: 'Georgia, "Noto Serif TC", serif',
              fontSize: '1.25rem',
              color: '#ffffff',
              fontWeight: 600,
              marginBottom: '1.5rem',
            }}
          >
            想要更多？加入付費頻道
          </p>
          <a
            href="https://www.youtube.com/@JGtalks"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '0.75rem 2.5rem',
              backgroundColor: '#cc0000',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 600,
              borderRadius: '6px',
              textDecoration: 'none',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = '#e00000'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = '#cc0000'; }}
          >
            立即加入
          </a>
        </footer>
      )}
    </div>
  );
}
