import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, NDJSON, resetRateLimit, type ApiResponse } from '../../api/_lib/http';
import { clearCache } from '../../api/_lib/cache';
import { mockReq, mockRes } from './helpers';

vi.mock('../../api/_lib/model', () => ({ callModel: vi.fn() }));

import { callModel } from '../../api/_lib/model';
import askPlanner from '../../api/ask-planner';
import parseIntake from '../../api/parse-intake';

const model = vi.mocked(callModel);

const facts = {
  occasion: 'wedding',
  guests: 200,
  totalBudget: 800000,
  daysToEvent: 100,
  budget: [],
  insights: [],
};
const body = { question: 'What next?', history: [], facts };

/** A response that records NDJSON lines the way Node's ServerResponse would. */
function streamingRes() {
  const { res, out } = mockRes();
  const lines: unknown[] = [];
  let ended = false;
  const streaming: ApiResponse = {
    status: (code) => {
      res.status(code);
      return streaming;
    },
    json: (payload) => res.json(payload),
    setHeader: (name, value) => res.setHeader(name, value),
    write: (chunk) => {
      lines.push(
        ...chunk
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l) as unknown),
      );
    },
    end: () => {
      ended = true;
    },
  };
  return { streaming, out, lines, isEnded: () => ended };
}

const accept = { accept: `${NDJSON}, application/json` };

beforeEach(() => {
  resetRateLimit();
  clearCache();
  model.mockReset();
});

describe('streamed answers (NDJSON)', () => {
  it('forwards thoughts, then one validated result, then ends', async () => {
    model.mockImplementation((request) => {
      request.onEvent?.({ type: 'thought', text: '**Checking** the budget' });
      return Promise.resolve(JSON.stringify({ answer: 'Book the venue first.' }));
    });
    const { streaming, out, lines, isEnded } = streamingRes();
    await askPlanner(mockReq({ body, headers: accept }), streaming);
    expect(out.status).toBe(200);
    expect(out.headers['Content-Type']).toContain(NDJSON);
    expect(lines).toEqual([
      { type: 'thought', text: '**Checking** the budget' },
      { type: 'result', data: { answer: 'Book the venue first.' } },
    ]);
    expect(isEnded()).toBe(true);
  });

  it('reports failures as an error line, never leaking details', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    model.mockRejectedValueOnce(new ApiFailure(504, 'AI_TIMEOUT'));
    const first = streamingRes();
    await askPlanner(mockReq({ body, headers: accept }), first.streaming);
    expect(first.lines).toEqual([{ type: 'error', error: 'AI_TIMEOUT' }]);

    model.mockRejectedValueOnce(new Error('secret-key'));
    const second = streamingRes();
    await askPlanner(
      mockReq({ body: { ...body, question: 'Another?' }, headers: accept }),
      second.streaming,
    );
    expect(second.lines).toEqual([{ type: 'error', error: 'INTERNAL' }]);
    spy.mockRestore();
  });

  it('serves a cached answer as plain JSON even to a streaming caller', async () => {
    model.mockResolvedValue(JSON.stringify({ answer: 'Cached.' }));
    await askPlanner(mockReq({ body, headers: accept }), streamingRes().streaming);
    const again = streamingRes();
    await askPlanner(mockReq({ body, headers: accept }), again.streaming);
    expect(again.out.body).toEqual({ answer: 'Cached.' });
    expect(again.out.headers['X-Cache']).toBe('HIT');
    expect(model).toHaveBeenCalledTimes(1);
  });

  it('answers plain JSON when the caller does not ask for a stream, and streams every endpoint on request', async () => {
    model.mockResolvedValue(JSON.stringify({ answer: 'Plain.' }));
    const plain = mockRes();
    await askPlanner(mockReq({ body }), plain.res);
    expect(plain.out.body).toEqual({ answer: 'Plain.' });

    model.mockResolvedValue(
      JSON.stringify({
        occasion: null,
        totalBudget: null,
        guests: null,
        eventDate: null,
        vibe: null,
        nonNegotiables: [],
        city: null,
      }),
    );
    const other = streamingRes();
    await parseIntake(mockReq({ body: { text: 'hello' }, headers: accept }), other.streaming);
    expect(other.lines).toHaveLength(1);
    expect(other.lines[0]).toMatchObject({ type: 'result' });
    expect(other.out.status).toBe(200);
  });
});
