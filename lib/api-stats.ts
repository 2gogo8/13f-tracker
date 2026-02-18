// In-memory stats (resets on cold start, but good enough for monitoring)
interface EndpointStats {
  calls: number;
  errors: number;
  totalMs: number;
  lastCalled: number;
}

interface SymbolStats {
  symbol: string;
  views: number;
}

const stats = new Map<string, EndpointStats>();
const symbolViews = new Map<string, number>();

export function trackApiCall(endpoint: string, durationMs: number, isError: boolean = false) {
  const existing = stats.get(endpoint);
  
  if (existing) {
    existing.calls += 1;
    existing.errors += isError ? 1 : 0;
    existing.totalMs += durationMs;
    existing.lastCalled = Date.now();
  } else {
    stats.set(endpoint, {
      calls: 1,
      errors: isError ? 1 : 0,
      totalMs: durationMs,
      lastCalled: Date.now()
    });
  }
}

export function trackSymbolView(symbol: string) {
  const existing = symbolViews.get(symbol);
  symbolViews.set(symbol, (existing || 0) + 1);
}

export function getStats() {
  return Object.fromEntries(stats);
}

export function getTopSymbols(limit: number = 10): SymbolStats[] {
  return Array.from(symbolViews.entries())
    .map(([symbol, views]) => ({ symbol, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

export function resetStats() {
  stats.clear();
  symbolViews.clear();
}
