import { createHash } from 'node:crypto';

/**
 * Optional shared store (Upstash Redis REST, which is what Vercel KV / the Vercel Upstash
 * integration provides). When its URL and token are configured, the rate limit and the AI cache
 * are shared by every serverless instance. Without them, callers fall back to per-instance memory.
 * No SDK: three Redis commands over one small REST call.
 */
export const STORE_TIMEOUT_MS = 1500;

interface StoreConfig {
  url: string;
  token: string;
}

function storeConfig(): StoreConfig | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

export function sharedStoreEnabled(): boolean {
  return storeConfig() !== null;
}

type Command = (string | number)[];

/** Runs commands in one round trip. Throws on any transport or Redis error. */
async function pipeline(config: StoreConfig, commands: Command[]): Promise<unknown[]> {
  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('store: http error');
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error('store: bad reply');
  return data.map((item: unknown) => {
    if (typeof item !== 'object' || item === null || 'error' in item || !('result' in item)) {
      throw new Error('store: command failed');
    }
    return item.result;
  });
}

/** Keys never contain user text: long or personal inputs are hashed. */
export function storeKey(namespace: string, value: string): string {
  return `aayojan:${namespace}:${createHash('sha256').update(value).digest('hex')}`;
}

/** Fixed-window counter. Returns the new count, or null when no shared store is available. */
export async function incrementWindow(key: string, windowSeconds: number): Promise<number | null> {
  const config = storeConfig();
  if (!config) return null;
  try {
    const [count] = await pipeline(config, [
      ['INCR', key],
      ['EXPIRE', key, windowSeconds],
    ]);
    return typeof count === 'number' ? count : null;
  } catch {
    console.error('store: rate-limit counter unavailable');
    return null;
  }
}

/** Cached JSON value, or undefined on a miss, a parse problem or an unavailable store. */
export async function storeGet(key: string): Promise<unknown> {
  const config = storeConfig();
  if (!config) return undefined;
  try {
    const [raw] = await pipeline(config, [['GET', key]]);
    return typeof raw === 'string' ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

/** Best-effort write; a failing store never breaks the request. */
export async function storeSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const config = storeConfig();
  if (!config) return;
  try {
    await pipeline(config, [['SET', key, JSON.stringify(value), 'EX', ttlSeconds]]);
  } catch {
    console.error('store: cache write failed');
  }
}
