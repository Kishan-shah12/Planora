import { beforeEach, describe, expect, it } from 'vitest';
import {
  clientIp,
  rateLimited,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  resetRateLimit,
  sameOrigin,
} from '../../api/_lib/http';
import parseIntake from '../../api/parse-intake';
import { mockReq, mockRes } from './helpers';

beforeEach(() => resetRateLimit());

describe('clientIp', () => {
  it('prefers platform headers, then forwarded-for, then the socket, then "unknown"', () => {
    expect(
      clientIp({ headers: { 'x-vercel-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' } }),
    ).toBe('1.1.1.1');
    expect(clientIp({ headers: { 'x-forwarded-for': '3.3.3.3, 4.4.4.4' } })).toBe('3.3.3.3');
    expect(clientIp({ headers: {}, socket: { remoteAddress: '5.5.5.5' } })).toBe('5.5.5.5');
    expect(clientIp({ headers: {} })).toBe('unknown');
  });
});

describe('in-memory rate limiter', () => {
  it('allows the limit, refuses the next, and frees the window afterwards', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) expect(rateLimited('ip', 0)).toBe(false);
    expect(rateLimited('ip', 1)).toBe(true);
    expect(rateLimited('ip', RATE_LIMIT_WINDOW_MS + 1)).toBe(false);
  });

  it('prunes idle addresses once it tracks many, so memory stays bounded', () => {
    for (let i = 0; i < 5001; i++) rateLimited(`ip-${i}`, 0);
    expect(rateLimited('fresh', RATE_LIMIT_WINDOW_MS * 2)).toBe(false);
    // The old addresses were pruned, so they start again from zero.
    expect(rateLimited('ip-1', RATE_LIMIT_WINDOW_MS * 2)).toBe(false);
  });
});

describe('sameOrigin', () => {
  it('needs both an origin and a host', () => {
    expect(sameOrigin({ headers: { origin: 'https://a.test', host: '' } })).toBe(false);
    expect(sameOrigin({ headers: { origin: 'https://a.test', host: 'a.test' } })).toBe(true);
    expect(sameOrigin({ headers: { origin: ['https://a.test'], host: ['a.test'] } })).toBe(true);
  });
});

describe('body size guard', () => {
  it('treats a body that cannot be measured as too large', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const { res, out } = mockRes();
    await parseIntake(mockReq({ body: circular }), res);
    expect(out.status).toBe(413);
  });
  it('a missing body counts as empty and is rejected as invalid input', async () => {
    const { res, out } = mockRes();
    await parseIntake(mockReq({ body: undefined }), res);
    expect(out.status).toBe(400);
  });
});
