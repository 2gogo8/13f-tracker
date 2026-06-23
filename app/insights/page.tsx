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

/* ── Markdown Renderer (native, no deps) ── */
function renderMarkdown(raw: string) {
  if (!raw) return null;
  const blocks = raw.split(/\n\n+/);

  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

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

/* ── Paginated Article with Typewriter ── */
function PaginatedArticle({ summary }: { summary: Summary }) {
  const content = summary.article || [
    summary.summary.timelineAnalysis,
    summary.summary.keyNumbers,
    summary.summary.predictionVsReality,
  ].filter(Boolean).join('\n\n---\n\n');

  const chunks = content.split(/\n\n+/).filter(Boolean);

  const [chunkIndex, setChunkIndex] = useState(0);
  const [displayedChunks, setDisplayedChunks] = useState<string[]>([]);
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showContinue, setShowContinue] = useState(false);
  const [pageFinished, setPageFinished] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkIndexRef = useRef(0);

  // Max content height = viewport - 150px for header/nav
  const getMaxHeight = () => (typeof window !== 'undefined' ? window.innerHeight - 150 : 600);

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Check if content area is near full
  const isNearFull = useCallback(() => {
    if (!contentRef.current) return false;
    return contentRef.current.scrollHeight >= getMaxHeight();
  }, []);

  // Type one chunk character by character
  const typeChunk = useCallback((chunkText: string, onDone: () => void) => {
    setIsTyping(true);
    setTypingText('');
    let i = 0;
    intervalRef.current = setInterval(() => {
      i++;
      setTypingText(chunkText.slice(0, i));
      if (i >= chunkText.length) {
        clearTimer();
        setIsTyping(false);
        onDone();
      }
    }, 25);
  }, []);

  // Start typing from current chunkIndex
  const startTyping = useCallback(() => {
    const idx = chunkIndexRef.current;
    if (idx >= chunks.length) {
      setPageFinished(true);
      return;
    }
    typeChunk(chunks[idx], () => {
      // Chunk finished typing — commit it to displayed and check height
      setDisplayedChunks(prev => {
        const next = [...prev, chunks[chunkIndexRef.current]];
        // Use setTimeout to let React render before checking height
        setTimeout(() => {
          if (isNearFull()) {
            setShowContinue(true);
          } else {
            // Move to next chunk
            chunkIndexRef.current++;
            if (chunkIndexRef.current >= chunks.length) {
              setPageFinished(true);
            } else {
              startTyping();
            }
          }
        }, 50);
        return next;
      });
      setTypingText('');
    });
  }, [chunks, typeChunk, isNearFull]);

  // Initial start
  useEffect(() => {
    setDisplayedChunks([]);
    setTypingText('');
    setShowContinue(false);
    setPageFinished(false);
    setIsTyping(false);
    chunkIndexRef.current = 0;
    clearTimer();

    // Small delay to let the DOM settle
    const t = setTimeout(() => {
      startTyping();
    }, 100);

    return () => {
      clearTimer();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary._id]);

  // Handle "continue" — clear page and resume from next chunk
  const handleContinue = () => {
    clearTimer();
    chunkIndexRef.current++;
    setDisplayedChunks([]);
    setTypingText('');
    setShowContinue(false);
    setIsTyping(false);
    if (chunkIndexRef.current >= chunks.length) {
      setPageFinished(true);
      return;
    }
    setTimeout(() => startTyping(), 50);
  };

  // Skip typing — show current chunk immediately
  const handleSkip = () => {
    if (!isTyping) return;
    clearTimer();
    const currentChunk = chunks[chunkIndexRef.current];
    setTypingText('');
    setIsTyping(false);
    setDisplayedChunks(prev => {
      const next = [...prev, currentChunk];
      setTimeout(() => {
        if (isNearFull()) {
          setShowContinue(true);
        } else {
          chunkIndexRef.current++;
          if (chunkIndexRef.current >= chunks.length) {
            setPageFinished(true);
          } else {
            startTyping();
          }
        }
      }, 50);
      return next;
    });
  };

  const date = new Date(summary.publishedAt).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Build the text to render: displayed chunks joined + typing text
  const renderedText = [...displayedChunks, ...(typingText ? [typingText] : [])].join('\n\n');

  return (
    <div
      style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        ref={contentRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: 'clamp(1rem, 3vw, 2rem)',
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
        onClick={handleSkip}
        role="button"
        tabIndex={0}
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

        {/* Content */}
        <div
          style={{
            fontSize: '0.95rem',
            lineHeight: 1.9,
            color: '#e8e8e8',
          }}
        >
          {renderMarkdown(renderedText)}
        </div>

        {/* Typing indicator */}
        {isTyping && (
          <div
            style={{
              fontSize: '0.75rem',
              color: '#666666',
              marginTop: '0.5rem',
              animation: 'pulse 2s infinite',
            }}
          >
            點擊跳過打字效果
          </div>
        )}

        {/* Page finished */}
        {pageFinished && (
          <div
            style={{
              textAlign: 'center',
              marginTop: '2rem',
              fontSize: '0.8rem',
              color: '#666666',
            }}
          >
            — 全文完 —
          </div>
        )}
      </div>

      {/* Continue button — fixed bottom right, blinking */}
      {showContinue && (
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
            fontSize: '0.95rem',
            padding: '0.6rem 1.2rem',
            cursor: 'pointer',
            zIndex: 100,
            animation: 'blink 1.2s ease-in-out infinite',
            borderRadius: '4px',
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

  const handleTopicClick = (idx: number) => {
    setActiveIndex(idx);
  };

  return (
    <div
      style={{
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#080808',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
        color: '#e8e8e8',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* ── Header ── */}
      <header
        style={{
          paddingTop: '1.5rem',
          paddingBottom: '1rem',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: '0.7rem',
            color: '#b8962e',
            letterSpacing: '0.35em',
            textTransform: 'uppercase',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Intelligence Briefing
        </div>
        <h1
          style={{
            fontFamily: 'Georgia, "Noto Serif TC", serif',
            fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
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
            margin: '0.75rem auto 0',
            borderRadius: '2px',
          }}
        />
      </header>

      {/* ── Topic Navigation Buttons ── */}
      {!loading && summaries.length > 1 && (
        <nav
          style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            flexWrap: 'wrap',
            maxWidth: '800px',
            margin: '0 auto',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {summaries.map((s, idx) => {
            const isActive = idx === activeIndex;
            const label = s.topic || s.tags?.[0] || `話題 ${idx + 1}`;
            return (
              <button
                key={s._id}
                onClick={() => handleTopicClick(idx)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#1a1a1a',
                  border: isActive ? '1px solid #cc0000' : '1px solid #333333',
                  color: isActive ? '#ffffff' : '#aaaaaa',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  borderRadius: '4px',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.borderColor = '#555';
                    (e.currentTarget as HTMLElement).style.color = '#cccccc';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.borderColor = '#333333';
                    (e.currentTarget as HTMLElement).style.color = '#aaaaaa';
                  }
                }}
              >
                {label}
              </button>
            );
          })}
        </nav>
      )}

      {/* ── Content Area (fills remaining height) ── */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
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
            <p style={{ color: '#666666', marginTop: '1rem', fontSize: '0.85rem' }}>
              載入中...
            </p>
          </div>
        </div>
      ) : summaries.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#666666', fontSize: '1rem' }}>尚無情報</p>
        </div>
      ) : (
        <PaginatedArticle
          key={summaries[activeIndex]._id}
          summary={summaries[activeIndex]}
        />
      )}
    </div>
  );
}
