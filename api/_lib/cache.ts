/**
 * Tiny in-memory TTL cache for validated AI results. Identical requests (same endpoint, same
 * validated input) within the TTL are served without another model call. Best effort per
 * serverless instance; bounded so it can never grow without limit.
 */
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 200;

const store = new Map<string, { value: unknown; expires: number }>();

export function cacheKey(route: string, input: unknown): string {
  return `${route}:${JSON.stringify(input)}`;
}

export function cacheGet(key: string, now: number = Date.now()): unknown {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires <= now) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

export function cacheSet(key: string, value: unknown, now: number = Date.now()): void {
  if (store.size >= CACHE_MAX_ENTRIES) {
    // Maps keep insertion order, so the first key is the oldest entry.
    for (const oldest of store.keys()) {
      store.delete(oldest);
      break;
    }
  }
  store.set(key, { value, expires: now + CACHE_TTL_MS });
}

export function clearCache(): void {
  store.clear();
}
