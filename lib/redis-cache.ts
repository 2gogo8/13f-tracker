/**
 * Typed cache helpers with distributed lock (thundering herd protection).
 *
 * Usage:
 *   const data = await withCache('my-key', 1800, async () => expensiveFetch());
 */

import { redisGet, redisSet, acquireLock, releaseLock, redisKeys, redisDel } from './redis';

const LOCK_TTL = 120; // seconds — max time a scan is allowed to run

/**
 * Get cached value or compute it (with distributed lock on cache miss).
 * @param key       Redis key
 * @param ttl       Cache TTL in seconds
 * @param compute   Async function that returns fresh data
 * @param stale     If true, returns stale cached data while revalidating
 */
export async function withCache<T>(
  key: string,
  ttl: number,
  compute: () => Promise<T>,
  opts?: { staleOk?: boolean }
): Promise<T> {
  // 1. Try cache hit
  const cached = await redisGet(key);
  if (cached) {
    return JSON.parse(cached) as T;
  }

  // 2. Acquire distributed lock
  const lockKey = `lock:${key}`;
  const locked = await acquireLock(lockKey, LOCK_TTL);

  if (!locked) {
    // Another instance is computing — wait and retry
    await new Promise(r => setTimeout(r, 3000));
    const retry = await redisGet(key);
    if (retry) return JSON.parse(retry) as T;
    // If still empty after wait, compute anyway (lock holder may have failed)
  }

  try {
    // Double-check after acquiring lock (another instance may have just finished)
    const doubleCheck = await redisGet(key);
    if (doubleCheck) return JSON.parse(doubleCheck) as T;

    // 3. Compute fresh data
    const result = await compute();

    // 4. Store in cache
    await redisSet(key, JSON.stringify(result), ttl);

    return result;
  } finally {
    if (locked) await releaseLock(lockKey);
  }
}

/**
 * Warm cache without waiting for result (fire-and-forget).
 * Used by background cron jobs.
 */
export async function warmCache<T>(
  key: string,
  ttl: number,
  compute: () => Promise<T>
): Promise<{ warmed: boolean; fromLock: boolean }> {
  const lockKey = `lock:${key}`;
  const locked = await acquireLock(lockKey, LOCK_TTL);
  if (!locked) return { warmed: false, fromLock: true };

  try {
    const result = await compute();
    await redisSet(key, JSON.stringify(result), ttl);
    return { warmed: true, fromLock: false };
  } finally {
    await releaseLock(lockKey);
  }
}

/**
 * Clear all keys matching a pattern.
 * Used by admin cache-clear endpoint.
 */
export async function clearCachePattern(pattern: string): Promise<number> {
  const keys = await redisKeys(pattern);
  await Promise.all(keys.map(k => redisDel(k)));
  return keys.length;
}
