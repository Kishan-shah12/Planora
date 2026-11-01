import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../api/_lib/cache';
import { isRateLimited, RATE_LIMIT_MAX, resetRateLimit } from '../../api/_lib/http';
import {
  incrementWindow,
  sharedStoreEnabled,
  storeGet,
  storeKey,
  storeSet,
} from '../../api/_lib/store';
import { mockReq, mockRes } from './helpers';

vi.mock('../../api/_lib/model', () => ({ callModel: vi.fn() }));
import { callModel } from '../../api/_lib/model';
import parseIntake from '../../api/parse-intake';

const model = vi.mocked(callModel);
const fetchMock = vi.fn<typeof fetch>();
const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const sentCommands = (call: number) =>
  JSON.parse(fetchMock.mock.calls[call]?.[1]?.body as string) as unknown[][];

beforeEach(() => {
  vi.stubEnv('KV_REST_API_URL', 'https://kv.example/');
  vi.stubEnv('KV_REST_API_TOKEN', 'secret-token');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  model.mockReset();
  resetRateLimit();
  clearCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('shared store (Upstash / Vercel KV REST)', () => {
  it('is enabled only with both URL and token', () => {
    expect(sharedStoreEnabled()).toBe(true);
    vi.stubEnv('KV_REST_API_TOKEN', '');
    expect(sharedStoreEnabled()).toBe(false);
  });

  it('counts a window with INCR + EXPIRE in one authenticated call', async () => {
    fetchMock.mockReturnValueOnce(reply([{ result: 3 }, { result: 1 }]));
    expect(await incrementWindow('k', 300)).toBe(3);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://kv.example/pipeline');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-token');
    expect(sentCommands(0)).toEqual([
      ['INCR', 'k'],
      ['EXPIRE', 'k', 300],
    ]);
  });

  it('treats a counter reply that is not a number as unavailable', async () => {
    fetchMock.mockReturnValueOnce(reply([{ result: '3' }, { result: 1 }]));
    expect(await incrementWindow('k', 300)).toBeNull();
  });

  it('falls back (returns null / undefined) when the store fails, never throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockReturnValueOnce(reply({}, 500));
    expect(await incrementWindow('k', 300)).toBeNull();
    fetchMock.mockReturnValueOnce(reply([{ error: 'WRONGTYPE' }]));
    expect(await storeGet('k')).toBeUndefined();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(storeSet('k', { a: 1 }, 60)).resolves.toBeUndefined();
    fetchMock.mockReturnValueOnce(reply('not an array'));
    expect(await incrementWindow('k', 300)).toBeNull();
    expect(spy.mock.calls.flat().join(' ')).not.toContain('secret-token');
    spy.mockRestore();
  });

  it('stores JSON with a TTL and reads it back; misses are undefined', async () => {
    fetchMock.mockReturnValueOnce(reply([{ result: 'OK' }]));
    await storeSet('k', { a: 1 }, 600);
    expect(sentCommands(0)).toEqual([['SET', 'k', '{"a":1}', 'EX', 600]]);
    fetchMock.mockReturnValueOnce(reply([{ result: '{"a":1}' }]));
    expect(await storeGet('k')).toEqual({ a: 1 });
    fetchMock.mockReturnValueOnce(reply([{ result: null }]));
    expect(await storeGet('k')).toBeUndefined();
  });

  it('keys are namespaced hashes, so user text never becomes a key', () => {
    const key = storeKey('cache', 'my secret wedding text');
    expect(key).toMatch(/^aayojan:cache:[0-9a-f]{64}$/);
    expect(key).not.toContain('secret');
  });

  it('the shared counter decides the rate limit across instances', async () => {
    fetchMock.mockReturnValueOnce(reply([{ result: RATE_LIMIT_MAX }, { result: 1 }]));
    expect(await isRateLimited('1.2.3.4')).toBe(false);
    fetchMock.mockReturnValueOnce(reply([{ result: RATE_LIMIT_MAX + 1 }, { result: 1 }]));
    expect(await isRateLimited('1.2.3.4')).toBe(true);
  });

  it('a handler serves a cached answer from the shared store without calling the model', async () => {
    const intake = {
      occasion: 'wedding',
      totalBudget: 800000,
      guests: 200,
      eventDate: null,
      vibe: null,
      nonNegotiables: [],
      city: null,
    };
    fetchMock
      .mockReturnValueOnce(reply([{ result: 1 }, { result: 1 }]))
      .mockReturnValueOnce(reply([{ result: JSON.stringify(intake) }]));
    const { res, out } = mockRes();
    await parseIntake(mockReq({ body: { text: 'shaadi' } }), res);
    expect(out.status).toBe(200);
    expect(out.body).toEqual(intake);
    expect(out.headers['X-Cache']).toBe('HIT');
    expect(model).not.toHaveBeenCalled();
  });

  it('a handler writes fresh answers to the shared store', async () => {
    const intake = {
      occasion: null,
      totalBudget: null,
      guests: null,
      eventDate: null,
      vibe: null,
      nonNegotiables: [],
      city: null,
    };
    model.mockResolvedValue(JSON.stringify(intake));
    fetchMock
      .mockReturnValueOnce(reply([{ result: 1 }, { result: 1 }]))
      .mockReturnValueOnce(reply([{ result: null }]))
      .mockReturnValueOnce(reply([{ result: 'OK' }]));
    const { res, out } = mockRes();
    await parseIntake(mockReq({ body: { text: 'new text' } }), res);
    expect(out.status).toBe(200);
    const write = sentCommands(2)[0];
    expect(write?.[0]).toBe('SET');
    expect(write?.[3]).toBe('EX');
  });
});
