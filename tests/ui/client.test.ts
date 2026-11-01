import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  explainTradeoffs,
  extractQuote,
  parseIntake,
  suggestIdeas,
} from '../../src/lib/api';
import { formatDate, signedINR, describeChanges } from '../../src/lib/format';
import { newId } from '../../src/lib/id';
import { todayISO } from '../../src/lib/today';
import { jsonResponse } from './helpers';

const intake = {
  occasion: null,
  totalBudget: null,
  guests: null,
  eventDate: null,
  vibe: null,
  nonNegotiables: [],
  city: null,
};

describe('api client', () => {
  it('posts JSON and validates the response', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(intake));
    await expect(parseIntake('hello', { fetcher: f })).resolves.toEqual(intake);
    expect(f).toHaveBeenCalledWith(
      '/api/parse-intake',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    [429, {}, 'rate_limited'],
    [413, {}, 'too_large'],
    [400, {}, 'invalid_input'],
    [415, {}, 'invalid_input'],
    [504, {}, 'timeout'],
    [503, { error: 'AI_UNAVAILABLE' }, 'ai_unavailable'],
    [502, { error: 'AI_RESPONSE_INVALID' }, 'ai_invalid'],
    [500, {}, 'server'],
  ])('maps HTTP %i to %s', async (status, body, kind) => {
    const f = vi.fn().mockResolvedValue(jsonResponse(body, status));
    await expect(parseIntake('x', { fetcher: f })).rejects.toMatchObject({ kind });
  });

  it('maps network failure, bad JSON and bad shapes', async () => {
    await expect(
      parseIntake('x', { fetcher: vi.fn().mockRejectedValue(new TypeError('offline')) }),
    ).rejects.toMatchObject({ kind: 'network' });
    await expect(
      parseIntake('x', {
        fetcher: vi.fn().mockResolvedValue(new Response('not json', { status: 200 })),
      }),
    ).rejects.toMatchObject({ kind: 'ai_invalid' });
    await expect(
      parseIntake('x', { fetcher: vi.fn().mockResolvedValue(jsonResponse({ occasion: 'rave' })) }),
    ).rejects.toMatchObject({ kind: 'ai_invalid' });
    await expect(
      parseIntake('x', {
        fetcher: vi.fn().mockResolvedValue(new Response('<html>', { status: 500 })),
      }),
    ).rejects.toMatchObject({ kind: 'server' });
  });

  it('times out slow requests', async () => {
    vi.useFakeTimers();
    const f = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const pending = parseIntake('x', { fetcher: f as unknown as typeof fetch }).catch(
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(40_001);
    expect(await pending).toMatchObject({ kind: 'timeout' });
    vi.useRealTimers();
  });

  it('a caller can cancel a request; cancelling is not reported as a timeout', async () => {
    const f = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const controller = new AbortController();
    const pending = parseIntake('x', {
      fetcher: f as unknown as typeof fetch,
      signal: controller.signal,
    }).catch((e: unknown) => e);
    controller.abort();
    expect(await pending).toMatchObject({ kind: 'cancelled' });
    const already = new AbortController();
    already.abort();
    await expect(
      parseIntake('x', { fetcher: f as unknown as typeof fetch, signal: already.signal }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('has friendly messages and wraps the other endpoints', async () => {
    expect(new ApiError('network').message).toMatch(/connection/);
    const quote = {
      vendorName: null,
      category: 'misc',
      totalPrice: null,
      pricePerPlate: null,
      guestMinimum: null,
      overtimeFeePerHour: null,
      taxIncluded: null,
      advancePercent: null,
      inclusions: [],
      exclusions: [],
      cancellationPolicy: null,
    };
    await expect(
      extractQuote('q', 'misc', { fetcher: vi.fn().mockResolvedValue(jsonResponse(quote)) }),
    ).resolves.toEqual(quote);
    await expect(
      explainTradeoffs(
        {
          occasion: 'wedding',
          guests: 1,
          totalBudget: 1,
          overBy: 1,
          priorities: [],
          options: [{ id: 'a', title: 't', coversRupees: 1, summary: 's' }],
        },
        { fetcher: vi.fn().mockResolvedValue(jsonResponse({ explanations: [] })) },
      ),
    ).resolves.toEqual({ explanations: [] });
    const ideas = {
      themes: [{ title: 't', description: 'd' }],
      activities: ['a'],
      foodStyle: ['f'],
      personalTouches: [],
      invitationLine: 'Join us for [names] on [date] at [venue].',
    };
    await expect(
      suggestIdeas(
        { occasion: 'wedding', vibe: '', guests: 1, budgetTier: 'modest', nonNegotiables: [] },
        { fetcher: vi.fn().mockResolvedValue(jsonResponse(ideas)) },
      ),
    ).resolves.toEqual(ideas);
  });
});

describe('format helpers', () => {
  it('formats dates and rupee diffs', () => {
    expect(formatDate('2026-07-15')).toContain('15');
    expect(formatDate('garbage')).toBe('garbage');
    expect(signedINR(40_000)).toBe('+₹40,000');
    expect(signedINR(-25_000)).toBe('−₹25,000');
    expect(
      describeChanges('wedding', [
        { category: 'photography', delta: 40_000 },
        { category: 'decor', delta: -25_000 },
      ]),
    ).toBe('Photography & video +₹40,000 · Decor −₹25,000');
  });
  it('today and ids', () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(newId()).not.toBe(newId());
  });
});
