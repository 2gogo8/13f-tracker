'use client';

import { useEffect, useState } from 'react';

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
  expertCount: number;
  publishedAt: string;
  createdAt: string;
}

export default function InsightsPage() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSummaries() {
      try {
        const res = await fetch('/api/insights?limit=10');
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

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: '#FAFAF7',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <header className="pt-16 pb-12 px-4 text-center">
        <h1
          style={{
            fontFamily: 'Georgia, "Playfair Display", serif',
            fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
            fontWeight: 700,
            color: '#1A1A1A',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            marginBottom: '0.75rem',
          }}
        >
          專家觀點
        </h1>
        <p
          style={{
            fontSize: '0.875rem',
            color: '#999',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          Expert Insights
        </p>
        <div
          style={{
            width: '60px',
            height: '3px',
            background: '#C41E3A',
            margin: '1.5rem auto 0',
            borderRadius: '2px',
          }}
        />
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 pb-20">
        {loading ? (
          <div className="text-center py-20">
            <div
              className="inline-block animate-spin rounded-full h-8 w-8 border-b-2"
              style={{ borderColor: '#C41E3A' }}
            />
            <p style={{ color: '#999', marginTop: '1rem', fontSize: '0.875rem' }}>
              載入中...
            </p>
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-center py-20">
            <p style={{ color: '#999', fontSize: '1rem' }}>
              尚無專家觀點摘要
            </p>
            <p style={{ color: '#bbb', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              管理員可在後台生成摘要
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
            {summaries.map((s) => (
              <SummaryCard key={s._id} summary={s} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCard({ summary }: { summary: Summary }) {
  const date = new Date(summary.publishedAt).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article
      style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)',
        border: '1px solid #F0EEE9',
      }}
    >
      {/* Meta */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.25rem',
        }}
      >
        {summary.tags.map((tag) => (
          <span
            key={tag}
            style={{
              display: 'inline-block',
              padding: '0.25rem 0.75rem',
              borderRadius: '999px',
              backgroundColor: '#C41E3A12',
              color: '#C41E3A',
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            {tag}
          </span>
        ))}
        <span
          style={{
            fontSize: '0.75rem',
            color: '#AAA',
            marginLeft: 'auto',
          }}
        >
          {date} · {summary.expertCount} 位專家
        </span>
      </div>

      {/* Timeline Analysis */}
      <SummarySection
        icon="⏱"
        title="時間推論"
        content={summary.summary.timelineAnalysis}
      />

      <Divider />

      {/* Key Numbers */}
      <SummarySection
        icon="📊"
        title="關鍵數字"
        content={summary.summary.keyNumbers}
      />

      <Divider />

      {/* Prediction vs Reality */}
      <SummarySection
        icon="🎯"
        title="預測 vs 現實"
        content={summary.summary.predictionVsReality}
        highlight
      />
    </article>
  );
}

function SummarySection({
  icon,
  title,
  content,
  highlight,
}: {
  icon: string;
  title: string;
  content: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        ...(highlight
          ? {
              borderLeft: '3px solid #C41E3A',
              paddingLeft: '1.25rem',
              marginLeft: '-0.25rem',
            }
          : {}),
      }}
    >
      <h3
        style={{
          fontFamily: 'Georgia, "Playfair Display", serif',
          fontSize: '1.125rem',
          fontWeight: 700,
          color: '#1A1A1A',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span>{icon}</span>
        {title}
      </h3>
      <div
        style={{
          fontSize: '0.9rem',
          lineHeight: 1.8,
          color: '#444',
          whiteSpace: 'pre-wrap',
        }}
      >
        {renderMarkdown(content)}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <hr
      style={{
        border: 'none',
        borderTop: '1px solid #F0EEE9',
        margin: '1.5rem 0',
      }}
    />
  );
}

/** Minimal markdown-like rendering for bold and list items */
function renderMarkdown(text: string) {
  if (!text) return null;

  // Remove markdown headers (## / ### etc) since we have our own titles
  const cleaned = text.replace(/^#{1,4}\s+.*$/gm, '').trim();

  return cleaned.split('\n').map((line, i) => {
    // Bold
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={j} style={{ color: '#1A1A1A', fontWeight: 600 }}>
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });

    // List items
    if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
      return (
        <div key={i} style={{ paddingLeft: '1rem', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 0, color: '#C41E3A' }}>·</span>
          {parts.map((p, idx) => (typeof p === 'string' ? p.replace(/^[-•]\s/, '') : p))}
        </div>
      );
    }

    // Blockquote
    if (line.trim().startsWith('> ')) {
      return (
        <div
          key={i}
          style={{
            borderLeft: '2px solid #C41E3A',
            paddingLeft: '0.75rem',
            color: '#C41E3A',
            fontStyle: 'italic',
            fontSize: '0.8rem',
            margin: '0.5rem 0',
          }}
        >
          {line.replace(/^>\s?/, '')}
        </div>
      );
    }

    // Empty line
    if (!line.trim()) return <br key={i} />;

    return <div key={i}>{parts}</div>;
  });
}
