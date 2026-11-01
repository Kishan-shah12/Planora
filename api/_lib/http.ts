import type { ZodType } from 'zod';
import type { AiStreamEvent } from '../../src/schemas/index.js';
import { CACHE_TTL_MS, cacheGet, cacheKey, cacheSet } from './cache.js';
import { incrementWindow, storeGet, storeKey, storeSet } from './store.js';

/** Structural subsets of the Vercel request/response so handlers are trivial to unit test. */
export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string };
}
export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  /** Present on real (Node) responses; used to stream thought summaries as NDJSON. */
  write?(chunk: string): unknown;
  end?(): unknown;
}

export const NDJSON = 'application/x-ndjson';

export const MAX_BODY_BYTES = 8 * 1024;
export const RATE_LIMIT_MAX = 20;
export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export type ErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'FORBIDDEN_ORIGIN'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_INPUT'
  | 'RATE_LIMITED'
  | 'AI_RESPONSE_INVALID'
  | 'AI_TIMEOUT'
  | 'AI_UNAVAILABLE'
  | 'INTERNAL';

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  constructor(status: number, code: ErrorCode) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function header(req: ApiRequest, name: string): string {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** Best-effort client address, used only as a rate-limit key. */
export function clientIp(req: ApiRequest): string {
  // Vercel sets these itself; prefer them over a header a caller could add.
  const platform = header(req, 'x-vercel-forwarded-for') || header(req, 'x-real-ip');
  const forwarded = header(req, 'x-forwarded-for').split(',')[0]?.trim();
  if (platform) return platform;
  if (forwarded) return forwarded;
  return req.socket?.remoteAddress ?? 'unknown';
}

const hits = new Map<string, number[]>();

/** Per-instance sliding-window limiter, used when no shared store is configured. */
export function rateLimited(ip: string, now: number = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

export function resetRateLimit(): void {
  hits.clear();
}

/** Shared fixed-window limit across all instances when a store is configured, else in memory. */
export async function isRateLimited(ip: string, now: number = Date.now()): Promise<boolean> {
  const window = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  const count = await incrementWindow(
    storeKey('rl', `${ip}:${window}`),
    RATE_LIMIT_WINDOW_MS / 1000,
  );
  return count === null ? rateLimited(ip, now) : count > RATE_LIMIT_MAX;
}

/** Validated AI results: shared store first (if configured), then this instance's memory. */
async function readCache(key: string): Promise<unknown> {
  const local = cacheGet(key);
  if (local !== undefined) return local;
  const shared = await storeGet(storeKey('cache', key));
  if (shared !== undefined) cacheSet(key, shared);
  return shared;
}

async function writeCache(key: string, value: unknown): Promise<void> {
  cacheSet(key, value);
  await storeSet(storeKey('cache', key), value, CACHE_TTL_MS / 1000);
}

function bodyBytes(body: unknown): number {
  if (typeof body === 'string') return Buffer.byteLength(body);
  try {
    // JSON.stringify returns undefined for undefined input, despite its declared type.
    const stringify: (value: unknown) => string | undefined = JSON.stringify;
    return Buffer.byteLength(stringify(body) ?? '');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Only our own pages may spend the AI quota. Browsers always send Origin on a POST; it must match
 * the host serving the API. Cross-site requests and clients that hide where they come from are
 * refused. (A determined server-side caller can still forge headers, which the rate limit covers.)
 */
export function sameOrigin(req: ApiRequest): boolean {
  const origin = header(req, 'origin');
  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host.split(',')[0]?.trim();
  } catch {
    return false;
  }
}

export interface HandlerConfig<I> {
  /** Route name, used as the cache namespace. */
  name: string;
  input: ZodType<I>;
  /** Returns data that has already been validated against the endpoint's output schema. */
  run: (input: I, onEvent?: (event: AiStreamEvent) => void) => Promise<unknown>;
}

function fail(res: ApiResponse, status: number, code: ErrorCode): void {
  res.status(status).json({ error: code });
}

function failureCode(error: unknown): ErrorCode {
  if (error instanceof ApiFailure) return error.code;
  console.error('api: unexpected failure');
  return 'INTERNAL';
}

/**
 * Streams one AI call as NDJSON: thought summaries and model switches as they happen, then exactly
 * one `result` (already validated) or `error` line. Headers go out first, so failures are lines too.
 */
async function streamRun<I>(
  res: ApiResponse,
  config: HandlerConfig<I>,
  input: I,
  key: string,
): Promise<void> {
  res.setHeader('Content-Type', `${NDJSON}; charset=utf-8`);
  res.setHeader('X-Accel-Buffering', 'no');
  res.status(200);
  const send = (line: unknown) => res.write?.(`${JSON.stringify(line)}\n`);
  try {
    const result = await config.run(input, send);
    await writeCache(key, result);
    send({ type: 'result', data: result });
  } catch (error) {
    send({ type: 'error', error: failureCode(error) });
  }
  res.end?.();
}

/** Shared pipeline: method guard, content type, rate limit, size cap, validate, run, respond. */
export function createHandler<I>(config: HandlerConfig<I>) {
  return async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      fail(res, 405, 'METHOD_NOT_ALLOWED');
      return;
    }
    if (!sameOrigin(req)) {
      fail(res, 403, 'FORBIDDEN_ORIGIN');
      return;
    }
    if (!header(req, 'content-type').toLowerCase().startsWith('application/json')) {
      fail(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
      return;
    }
    if (await isRateLimited(clientIp(req))) {
      res.setHeader('Retry-After', String(RATE_LIMIT_WINDOW_MS / 1000));
      fail(res, 429, 'RATE_LIMITED');
      return;
    }
    const declared = Number(header(req, 'content-length'));
    if (
      (Number.isFinite(declared) && declared > MAX_BODY_BYTES) ||
      bodyBytes(req.body) > MAX_BODY_BYTES
    ) {
      fail(res, 413, 'PAYLOAD_TOO_LARGE');
      return;
    }
    let body: unknown = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        fail(res, 400, 'INVALID_INPUT');
        return;
      }
    }
    const parsed = config.input.safeParse(body);
    if (!parsed.success) {
      fail(res, 400, 'INVALID_INPUT');
      return;
    }
    const key = cacheKey(config.name, parsed.data);
    const cached = await readCache(key);
    if (cached !== undefined) {
      res.setHeader('X-Cache', 'HIT');
      res.status(200).json(cached);
      return;
    }
    if (header(req, 'accept').includes(NDJSON) && res.write && res.end) {
      await streamRun(res, config, parsed.data, key);
      return;
    }
    try {
      const result = await config.run(parsed.data);
      await writeCache(key, result);
      res.status(200).json(result);
    } catch (error) {
      const code = failureCode(error);
      fail(res, error instanceof ApiFailure ? error.status : 500, code);
    }
  };
}
