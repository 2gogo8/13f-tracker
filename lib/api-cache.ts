import { NextResponse } from 'next/server';
import { trackApiCall } from './api-stats';

export function createCachedResponse(
  data: unknown,
  endpoint: string,
  durationMs: number,
  cacheSeconds: number,
  isError: boolean = false
): NextResponse {
  const response = NextResponse.json(data);
  const cacheControl = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`;
  response.headers.set('Cache-Control', cacheControl);
  response.headers.set('CDN-Cache-Control', cacheControl);
  trackApiCall(endpoint, durationMs, isError);
  return response;
}
