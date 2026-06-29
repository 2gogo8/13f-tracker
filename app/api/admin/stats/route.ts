export const maxDuration = 10;
import { NextResponse } from 'next/server';
import { getStats, getTopSymbols, resetStats } from '@/lib/api-stats';
import { checkAdminStatus } from '@/lib/admin';

export async function GET() {
  const auth = await checkAdminStatus();
  if (auth.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const stats = getStats();
  const topSymbols = getTopSymbols(20);
  
  // Calculate totals
  let totalCalls = 0;
  let totalErrors = 0;
  let totalMs = 0;
  
  const endpoints = Object.entries(stats).map(([endpoint, data]) => {
    totalCalls += data.calls;
    totalErrors += data.errors;
    totalMs += data.totalMs;
    
    return {
      endpoint,
      calls: data.calls,
      errors: data.errors,
      avgMs: data.calls > 0 ? Math.round(data.totalMs / data.calls) : 0,
      lastCalled: data.lastCalled,
    };
  });
  
  // Sort by call count descending
  endpoints.sort((a, b) => b.calls - a.calls);
  
  return NextResponse.json({
    summary: {
      totalCalls,
      totalErrors,
      avgResponseTime: totalCalls > 0 ? Math.round(totalMs / totalCalls) : 0,
      uniqueEndpoints: endpoints.length,
    },
    endpoints,
    topSymbols,
  });
}

export async function POST() {
  const auth = await checkAdminStatus();
  if (auth.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  resetStats();
  return NextResponse.json({ success: true, message: '統計已重置' });
}
