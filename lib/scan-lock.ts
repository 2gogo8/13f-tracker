// Prevents thundering herd: only one scan runs at a time per route
// Others wait for the result instead of triggering parallel scans

const locks = new Map<string, Promise<unknown>>();

export async function withScanLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = locks.get(key);
  if (existing) {
    // Another scan is running — wait for it
    return existing as Promise<T>;
  }
  
  const promise = fn().finally(() => {
    locks.delete(key);
  });
  
  locks.set(key, promise);
  return promise;
}

// Simple rate limiter: max N requests per window per key
const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }
  
  if (entry.count >= maxRequests) {
    return false; // blocked
  }
  
  entry.count++;
  return true; // allowed
}
