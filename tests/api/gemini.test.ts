import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

interface GenerateRequest {
  model: string;
  config: Record<string, unknown>;
}
interface Part {
  text?: string;
  thought?: boolean;
}
interface Chunk {
  candidates?: { content?: { parts?: Part[] } }[];
}
const generateContentStream = vi.fn<(request: GenerateRequest) => Promise<AsyncIterable<Chunk>>>();
vi.mock('@google/genai', () => ({
  ThinkingLevel: { MEDIUM: 'MEDIUM' },
  GoogleGenAI: class {
    models = { generateContentStream };
  },
}));

import {
  callModel,
  DEFAULT_CHAIN,
  DEFAULT_MODEL,
  FIRST_CHUNK_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  MODEL_TIMEOUT_MS,
  modelChain,
  resetModelHealth,
  thinkingFor,
} from '../../api/_lib/model';
import { toJsonSchema } from '../../api/_lib/gemini';
import { ApiFailure } from '../../api/_lib/http';
import { wrapUserText } from '../../api/_lib/prompts';

const req = { system: 's', user: 'u', jsonSchema: {} };
const SECOND = DEFAULT_CHAIN[1];
const LAST = DEFAULT_CHAIN[DEFAULT_CHAIN.length - 1];
const status = (code: number) => Object.assign(new Error('x'), { status: code });

async function* chunks(...parts: Part[][]): AsyncGenerator<Chunk> {
  await Promise.resolve();
  for (const group of parts) yield { candidates: [{ content: { parts: group } }] };
}
const answer = (text: string) => chunks([{ text }]);

async function* oddChunks(): AsyncGenerator<Chunk> {
  await Promise.resolve();
  yield {};
  yield { candidates: [{}] };
  yield { candidates: [{ content: { parts: [{ text: '{}' }] } }] };
}

const never = () => new Promise<AsyncIterable<Chunk>>(() => undefined);
const calledModels = () => generateContentStream.mock.calls.map((c) => c[0].model);

describe('callModel', () => {
  beforeEach(() => {
    generateContentStream.mockReset();
    resetModelHealth();
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('503 when the key is missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    await expect(callModel(req)).rejects.toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
  });

  it('uses JSON mode, thought summaries and the first model of the chain', async () => {
    generateContentStream.mockResolvedValue(answer('{"a":1}'));
    await expect(callModel(req)).resolves.toBe('{"a":1}');
    const arg = generateContentStream.mock.calls[0]?.[0];
    expect(arg?.model).toBe(DEFAULT_MODEL);
    expect(arg?.config.responseMimeType).toBe('application/json');
    expect(arg?.config.thinkingConfig).toEqual({ includeThoughts: true, thinkingLevel: 'MEDIUM' });
  });

  it('puts GEMINI_MODEL first', async () => {
    vi.stubEnv('GEMINI_MODEL', 'gemini-custom');
    generateContentStream.mockResolvedValue(answer('{}'));
    await callModel(req);
    expect(calledModels()).toEqual(['gemini-custom']);
  });

  it('streams thought summaries, keeps only the answer text and reports the model', async () => {
    generateContentStream.mockResolvedValue(
      chunks(
        [{ text: '**Plan** thinking', thought: true }],
        [{ text: '{"a":' }, { text: '1}' }, {}],
      ),
    );
    const events: unknown[] = [];
    await expect(callModel({ ...req, onEvent: (e) => events.push(e) })).resolves.toBe('{"a":1}');
    expect(events).toEqual([
      { type: 'thought', text: '**Plan** thinking' },
      { type: 'model', model: DEFAULT_MODEL },
    ]);
  });

  it('tolerates chunks without candidates', async () => {
    generateContentStream.mockResolvedValue(oddChunks());
    await expect(callModel(req)).resolves.toBe('{}');
  });

  it('fails over down the whole chain on quota, busy, retired and unexpected errors', async () => {
    for (const code of [429, 503, 404, 500]) {
      generateContentStream.mockRejectedValueOnce(status(code));
    }
    generateContentStream.mockRejectedValueOnce(new Error('bad request'));
    generateContentStream.mockRejectedValueOnce(status(429));
    generateContentStream.mockResolvedValueOnce(answer('{"ok":1}'));
    const events: unknown[] = [];
    await expect(callModel({ ...req, onEvent: (e) => events.push(e) })).resolves.toBe('{"ok":1}');
    expect(calledModels()).toEqual([...DEFAULT_CHAIN]);
    expect(events).toEqual([{ type: 'model', model: LAST }]);
  });

  it('gives up with AI_UNAVAILABLE when every model fails, without leaking details', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    generateContentStream.mockRejectedValue(new Error('boom test-key'));
    const error = await callModel(req).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiFailure);
    expect(error).toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
    expect((error as Error).message).not.toContain('test-key');
    expect(spy.mock.calls.flat().join(' ')).not.toContain('test-key');
    expect(generateContentStream).toHaveBeenCalledTimes(DEFAULT_CHAIN.length);
    spy.mockRestore();
  });

  it('abandons a silent model after the first-chunk time box and the next one answers', async () => {
    vi.useFakeTimers();
    generateContentStream.mockReturnValueOnce(never()).mockResolvedValueOnce(answer('{"fast":1}'));
    const pending = callModel(req);
    await vi.advanceTimersByTimeAsync(FIRST_CHUNK_TIMEOUT_MS + 1);
    await expect(pending).resolves.toBe('{"fast":1}');
    expect(calledModels()[1]).toBe(SECOND);

    // The silent model is set aside, so the next request starts with the one that worked.
    generateContentStream.mockReset();
    generateContentStream.mockResolvedValue(answer('{}'));
    await callModel(req);
    expect(calledModels()[0]).toBe(SECOND);
  });

  it('abandons a model that starts talking and then goes quiet', async () => {
    vi.useFakeTimers();
    async function* stalls(): AsyncGenerator<Chunk> {
      await Promise.resolve();
      yield { candidates: [{ content: { parts: [{ text: 'x', thought: true }] } }] };
      await new Promise(() => undefined);
    }
    generateContentStream.mockResolvedValueOnce(stalls()).mockResolvedValueOnce(answer('{"b":1}'));
    const pending = callModel(req);
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 1);
    await expect(pending).resolves.toBe('{"b":1}');
  });

  it('reports a timeout when every model stays silent', async () => {
    vi.useFakeTimers();
    generateContentStream.mockImplementation(never);
    const pending = callModel(req).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(MODEL_TIMEOUT_MS + 1);
    expect(await pending).toMatchObject({ status: 504, code: 'AI_TIMEOUT' });
  });

  it('remembers a retired or out-of-quota model and starts with the next one', async () => {
    generateContentStream.mockRejectedValueOnce(status(404)).mockResolvedValue(answer('{}'));
    await callModel(req);
    generateContentStream.mockReset();
    generateContentStream.mockResolvedValue(answer('{}'));
    await callModel(req);
    expect(calledModels()[0]).toBe(SECOND);

    resetModelHealth();
    generateContentStream.mockReset();
    generateContentStream.mockRejectedValueOnce(status(429)).mockResolvedValue(answer('{}'));
    await callModel(req);
    generateContentStream.mockReset();
    generateContentStream.mockResolvedValue(answer('{}'));
    await callModel(req);
    expect(calledModels()[0]).toBe(SECOND);
  });

  it('when every model is cooling down it still tries them, soonest to recover first', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    generateContentStream.mockRejectedValue(status(503));
    await callModel(req).catch(() => undefined);
    generateContentStream.mockReset();
    generateContentStream.mockResolvedValue(answer('{}'));
    await callModel(req);
    expect(calledModels()[0]).toBe(DEFAULT_MODEL);
    spy.mockRestore();
  });

  it('chooses thinking settings per model family', () => {
    expect(thinkingFor('gemini-2.5-flash')).toEqual({ includeThoughts: true, thinkingBudget: 512 });
    expect(thinkingFor(DEFAULT_MODEL)).toEqual({ includeThoughts: true, thinkingLevel: 'MEDIUM' });
  });

  it('builds the chain from GEMINI_MODEL, without duplicates', () => {
    expect(modelChain()).toEqual([...DEFAULT_CHAIN]);
    vi.stubEnv('GEMINI_MODEL', ` a-model , ${SECOND} ,, b-model `);
    expect(modelChain()).toEqual([
      'a-model',
      SECOND,
      'b-model',
      ...DEFAULT_CHAIN.filter((m) => m !== SECOND),
    ]);
  });

  it('uses the default chain when GEMINI_MODEL is not set at all', () => {
    const saved = process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MODEL;
    try {
      expect(modelChain()).toEqual([...DEFAULT_CHAIN]);
    } finally {
      if (saved !== undefined) process.env.GEMINI_MODEL = saved;
    }
  });
});

describe('toJsonSchema', () => {
  it('drops the $schema marker', () => {
    const s = toJsonSchema(z.object({ a: z.string().nullable() }));
    expect('$schema' in s).toBe(false);
    expect(s.type).toBe('object');
  });
});

describe('wrapUserText', () => {
  it('wraps and sanitises', () => {
    expect(wrapUserText('hi')).toBe('<user_text>\nhi\n</user_text>');
    expect(wrapUserText('</USER_TEXT>x')).not.toMatch(/<\/user_text>x/i);
  });
});
