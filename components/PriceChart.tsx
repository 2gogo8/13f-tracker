'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface HistoricalPrice {
  date: string;
  close: number;
}

interface ChartEvent {
  date: string;
  type: 'earnings' | 'upgrade' | 'downgrade' | 'dividend' | 'split' | 'news';
  title: string;
}

interface PriceChartProps {
  data: HistoricalPrice[];
  symbol: string;
  inline?: boolean;
  events?: ChartEvent[];
}

const EVENT_ICONS: Record<string, { label: string; color: string }> = {
  earnings: { label: 'E', color: '#D4AF37' },
  upgrade: { label: '▲', color: '#4ade80' },
  downgrade: { label: '▼', color: '#C41E3A' },
  dividend: { label: 'D', color: '#60a5fa' },
  split: { label: 'S', color: '#a78bfa' },
  news: { label: 'N', color: '#fbbf24' },
};

export default function PriceChart({ data, symbol, inline, events = [] }: PriceChartProps) {
  const [crosshair, setCrosshair] = useState<{
    x: number; y: number; date: string; price: number; index: number;
  } | null>(null);
  const [activeEvent, setActiveEvent] = useState<ChartEvent | null>(null);
  const [isPressed, setIsPressed] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch events if not provided
  const [fetchedEvents, setFetchedEvents] = useState<ChartEvent[]>([]);
  useEffect(() => {
    if (events.length > 0 || !symbol) return;
    async function loadEvents() {
      try {
        const res = await fetch(`/api/chart-events/${symbol}`);
        const data = await res.json();
        if (Array.isArray(data)) setFetchedEvents(data);
      } catch {}
    }
    loadEvents();
  }, [symbol, events.length]);

  const allEvents = events.length > 0 ? events : fetchedEvents;

  if (!data || data.length === 0) {
    return (
      <div className={inline ? '' : 'apple-card p-8'}>
        {!inline && <h2 className="text-2xl font-bold mb-6">兩年股價走勢</h2>}
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">暫無歷史價格資料</p>
        </div>
      </div>
    );
  }

  const width = 800;
  const height = 300;
  const padding = { top: 40, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const prices = data.map(d => d.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;
  const priceBuffer = priceRange * 0.1;

  const firstPrice = data[0].close;
  const lastPrice = data[data.length - 1].close;
  const isUp = lastPrice >= firstPrice;
  const lineColor = isUp ? '#D4AF37' : '#C41E3A';

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * chartWidth;
    const y = chartHeight - ((d.close - minPrice + priceBuffer) / (priceRange + 2 * priceBuffer)) * chartHeight;
    return { x, y, date: d.date, price: d.close };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const fillPath = `${linePath} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;

  const xLabels: { x: number; label: string }[] = [];
  const labelCount = 6;
  for (let i = 0; i < labelCount; i++) {
    const index = Math.floor((i / (labelCount - 1)) * (data.length - 1));
    const point = points[index];
    const date = new Date(data[index].date);
    xLabels.push({ x: point.x, label: `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}` });
  }

  const yLabels = [
    { y: chartHeight, label: `$${minPrice.toFixed(2)}` },
    { y: chartHeight / 2, label: `$${((minPrice + maxPrice) / 2).toFixed(2)}` },
    { y: 0, label: `$${maxPrice.toFixed(2)}` },
  ];

  // Map events to chart positions
  const eventMarkers = allEvents.map(evt => {
    const idx = data.findIndex(d => d.date === evt.date);
    if (idx < 0) {
      // Find nearest date
      const evtTime = new Date(evt.date).getTime();
      let nearest = 0;
      let minDiff = Infinity;
      data.forEach((d, i) => {
        const diff = Math.abs(new Date(d.date).getTime() - evtTime);
        if (diff < minDiff) { minDiff = diff; nearest = i; }
      });
      if (minDiff > 7 * 86400000) return null; // skip if > 7 days away
      return { ...evt, idx: nearest, point: points[nearest] };
    }
    return { ...evt, idx, point: points[idx] };
  }).filter(Boolean) as (ChartEvent & { idx: number; point: typeof points[0] })[];

  const getIndexFromPosition = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const x = (clientX - rect.left) * scaleX - padding.left;
    const y = (clientY - rect.top) * scaleX - padding.top;

    if (x < 0 || x > chartWidth || y < -20 || y > chartHeight + 20) return null;

    const index = Math.round((x / chartWidth) * (data.length - 1));
    const clampedIndex = Math.max(0, Math.min(data.length - 1, index));
    return clampedIndex;
  }, [chartWidth, chartHeight, data.length]);

  const updateCrosshair = useCallback((clientX: number, clientY: number) => {
    const index = getIndexFromPosition(clientX, clientY);
    if (index === null) {
      setCrosshair(null);
      return;
    }
    const point = points[index];
    if (point) {
      setCrosshair({
        x: point.x,
        y: point.y,
        date: point.date,
        price: point.price,
        index,
      });
    }
  }, [getIndexFromPosition, points]);

  // Mouse events (desktop)
  const handleMouseMove = (e: React.MouseEvent) => {
    updateCrosshair(e.clientX, e.clientY);
  };

  // Touch events (mobile long-press)
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setActiveEvent(null);
    pressTimer.current = setTimeout(() => {
      setIsPressed(true);
      updateCrosshair(touch.clientX, touch.clientY);
    }, 200); // 200ms long press
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPressed) {
      // Cancel long-press if finger moves before timer
      if (pressTimer.current) clearTimeout(pressTimer.current);
      return;
    }
    e.preventDefault(); // prevent scroll while crosshair is active
    const touch = e.touches[0];
    updateCrosshair(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    setIsPressed(false);
    setCrosshair(null);
  };

  return (
    <div className={inline ? '' : 'apple-card p-6 sm:p-8'}>
      {!inline && (
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl sm:text-2xl font-bold">兩年股價走勢</h2>
          <div className="text-right">
            <p className="text-sm text-gray-400">目前價格</p>
            <p className={`text-xl sm:text-2xl font-bold ${isUp ? 'text-accent' : 'text-primary'}`}>
              ${lastPrice.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Crosshair info bar */}
      <div className="h-6 mb-1">
        {crosshair && (
          <div className="flex items-center justify-center gap-4 text-xs animate-in fade-in duration-150">
            <span className="text-gray-400">
              {new Date(crosshair.date).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })}
            </span>
            <span className={`font-mono font-bold ${isUp ? 'text-accent' : 'text-primary'}`}>
              ${crosshair.price.toFixed(2)}
            </span>
            <span className="text-gray-500 text-[10px]">
              {crosshair.price >= firstPrice ? '+' : ''}{((crosshair.price - firstPrice) / firstPrice * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      <div className="relative w-full overflow-x-auto select-none" style={{ touchAction: isPressed ? 'none' : 'auto' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setCrosshair(null)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <defs>
            <linearGradient id={`gradient-${symbol}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          <g transform={`translate(${padding.left}, ${padding.top})`}>
            {/* Grid */}
            {yLabels.map((label, i) => (
              <g key={`y-${i}`}>
                <line x1={0} y1={label.y} x2={chartWidth} y2={label.y} stroke="#E0DCD5" />
                <text x={-10} y={label.y} textAnchor="end" dominantBaseline="middle" fill="#999" fontSize="12" fontFamily="system-ui">
                  {label.label}
                </text>
              </g>
            ))}
            {xLabels.map((label, i) => (
              <g key={`x-${i}`}>
                <line x1={label.x} y1={0} x2={label.x} y2={chartHeight} stroke="#E0DCD5" />
                <text x={label.x} y={chartHeight + 20} textAnchor="middle" fill="#999" fontSize="12" fontFamily="system-ui">
                  {label.label}
                </text>
              </g>
            ))}

            {/* Fill + Line */}
            <path d={fillPath} fill={`url(#gradient-${symbol})`} />
            <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {/* Event markers */}
            {eventMarkers.map((evt, i) => {
              const cfg = EVENT_ICONS[evt.type] || EVENT_ICONS.news;
              const isActive = activeEvent?.date === evt.date && activeEvent?.title === evt.title;
              return (
                <g
                  key={`evt-${i}`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveEvent(isActive ? null : evt);
                  }}
                >
                  {/* Vertical tick */}
                  <line
                    x1={evt.point.x} y1={evt.point.y}
                    x2={evt.point.x} y2={chartHeight}
                    stroke={cfg.color} strokeWidth="0.5" strokeDasharray="2,2" opacity={0.4}
                  />
                  {/* Marker circle */}
                  <circle
                    cx={evt.point.x} cy={evt.point.y - 14}
                    r={isActive ? 10 : 8}
                    fill={isActive ? cfg.color : `${cfg.color}40`}
                    stroke={cfg.color} strokeWidth="1.5"
                  />
                  <text
                    x={evt.point.x} y={evt.point.y - 10}
                    textAnchor="middle" fill={isActive ? '#000' : cfg.color}
                    fontSize="9" fontWeight="bold" fontFamily="system-ui"
                  >
                    {cfg.label}
                  </text>
                </g>
              );
            })}

            {/* Crosshair */}
            {crosshair && (
              <g>
                {/* Vertical line */}
                <line
                  x1={crosshair.x} y1={0}
                  x2={crosshair.x} y2={chartHeight}
                  stroke="rgba(0,0,0,0.2)" strokeWidth="0.5" strokeDasharray="4,3"
                />
                {/* Horizontal line */}
                <line
                  x1={0} y1={crosshair.y}
                  x2={chartWidth} y2={crosshair.y}
                  stroke="rgba(0,0,0,0.2)" strokeWidth="0.5" strokeDasharray="4,3"
                />
                {/* Center dot */}
                <circle cx={crosshair.x} cy={crosshair.y} r="5" fill={lineColor} stroke="#333" strokeWidth="2" />
                {/* Price label on Y axis */}
                <rect
                  x={-padding.left} y={crosshair.y - 10}
                  width={padding.left - 4} height={20}
                  fill="rgba(255,255,255,0.95)" rx="3"
                />
                <text
                  x={-8} y={crosshair.y + 4}
                  textAnchor="end" fill={lineColor}
                  fontSize="10" fontWeight="bold" fontFamily="system-ui"
                >
                  ${crosshair.price.toFixed(2)}
                </text>
              </g>
            )}
          </g>
        </svg>
      </div>

      {/* Active event popup */}
      {activeEvent && (
        <div
          className="mt-2 p-3 rounded-lg border border-gray-200 bg-white/95 backdrop-blur-sm text-sm cursor-pointer"
          onClick={() => setActiveEvent(null)}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{
                backgroundColor: EVENT_ICONS[activeEvent.type]?.color || '#fbbf24',
                color: '#000',
              }}
            >
              {EVENT_ICONS[activeEvent.type]?.label || 'N'}
            </span>
            <span className="text-gray-500 text-[10px]">
              {new Date(activeEvent.date).toLocaleDateString('zh-TW')}
            </span>
          </div>
          <p className="text-gray-900 text-xs leading-relaxed">{activeEvent.title}</p>
        </div>
      )}

      <p className="text-[10px] text-gray-500 text-center mt-3">
        {isPressed ? '滑動查看價格' : '長按圖表啟動十字線'}・點擊標記查看事件
      </p>
    </div>
  );
}
