import { describe, expect, it } from 'vitest';
import {
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS,
  cacheGet,
  cacheKey,
  cacheSet,
  clearCache,
} from '../../api/_lib/cache';

describe('AI response cache', () => {
  it('expires entries after the TTL', () => {
    clearCache();
    const key = cacheKey('route', { a: 1 });
    cacheSet(key, { ok: true }, 0);
    expect(cacheGet(key, CACHE_TTL_MS - 1)).toEqual({ ok: true });
    expect(cacheGet(key, CACHE_TTL_MS)).toBeUndefined();
    expect(cacheGet('missing')).toBeUndefined();
  });

  it('is bounded: the oldest entry is evicted first', () => {
    clearCache();
    for (let i = 0; i <= CACHE_MAX_ENTRIES; i++) cacheSet(`k${i}`, i, 0);
    expect(cacheGet('k0', 1)).toBeUndefined();
    expect(cacheGet(`k${CACHE_MAX_ENTRIES}`, 1)).toBe(CACHE_MAX_ENTRIES);
  });

  it('keys depend on route and input', () => {
    expect(cacheKey('a', { x: 1 })).not.toBe(cacheKey('b', { x: 1 }));
    expect(cacheKey('a', { x: 1 })).not.toBe(cacheKey('a', { x: 2 }));
  });
});
