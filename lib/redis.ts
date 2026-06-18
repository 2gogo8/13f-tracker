/**
 * Redis client wrapper (Upstash REST API)
 * Falls back to in-memory Map when UPSTASH_REDIS_REST_URL is not set.
 */

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const USE_REDIS = !!(REST_URL && REST_TOKEN);

// ── In-memory fallback ────────────────────────────────────────────────────
const memStore = new Map<string, { value: string; expiresAt: number }>();

function memGet(key: string): string | null {
  const entry = memStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { memStore.delete(key); return null; }
  return entry.value;
}
function memSet(key: string, value: string, exSeconds: number): void {
  memStore.set(key, { value, expiresAt: Date.now() + exSeconds * 1000 });
}
function memDel(key: string): void { memStore.delete(key); }
function memKeys(pattern: string): string[] {
  const prefix = pattern.replace('*', '');
  return [...memStore.keys()].filter(k => k.startsWith(prefix));
}

// ── Upstash REST helpers ──────────────────────────────────────────────────
async function redisCmd(cmd: unknown[]): Promise<unknown> {
  const res = await fetch(`${REST_URL}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmd),
  });
  const json = await res.json() as { result: unknown; error?: string };
  if (json.error) throw new Error(`Redis error: ${json.error}`);
  return json.result;
}

// ── Public API ────────────────────────────────────────────────────────────
export async function redisGet(key: string): Promise<string | null> {
  if (!USE_REDIS) return memGet(key);
  return redisCmd(['GET', key]) as Promise<string | null>;
}

export async function redisSet(key: string, value: string, exSeconds: number): Promise<void> {
  if (!USE_REDIS) { memSet(key, value, exSeconds); return; }
  await redisCmd(['SET', key, value, 'EX', exSeconds]);
}

export async function redisDel(key: string): Promise<void> {
  if (!USE_REDIS) { memDel(key); return; }
  await redisCmd(['DEL', key]);
}

export async function redisKeys(pattern: string): Promise<string[]> {
  if (!USE_REDIS) return memKeys(pattern);
  return redisCmd(['KEYS', pattern]) as Promise<string[]>;
}

/**
 * Distributed lock via SET NX EX.
 * Returns true if lock acquired, false if already locked.
 */
export async function acquireLock(key: string, ttlSeconds = 120): Promise<boolean> {
  if (!USE_REDIS) {
    if (memGet(key)) return false;
    memSet(key, '1', ttlSeconds);
    return true;
  }
  const result = await redisCmd(['SET', key, '1', 'NX', 'EX', ttlSeconds]);
  return result === 'OK';
}

export async function releaseLock(key: string): Promise<void> {
  await redisDel(key);
}

export const isRedisEnabled = USE_REDIS;
