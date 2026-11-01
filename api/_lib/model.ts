import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import type { AiStreamEvent } from '../../src/schemas/index.js';
import { ApiFailure } from './http.js';

/**
 * Models to try, best first: the newest Gemini Flash models, then older and lighter ones that stay
 * available on the free tier. Each call walks the list until one answers, so a model that is out of
 * quota, overloaded, retired or silent is skipped. The lite models come after the full ones because they answer fast but share little of their thinking. (gemini-3.8-flash, 3.7-flash and 3.5-flash-lite
 * were left out: on free keys they accept the request and then never answer.)
 */
export const DEFAULT_CHAIN = [
  'gemini-4-argon',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
] as const;
export const DEFAULT_MODEL = DEFAULT_CHAIN[0];
/** A model that has not produced anything by now is stuck: move on to the next one. */
export const FIRST_CHUNK_TIMEOUT_MS = 5_000;
/** Once it is talking, the longest silence tolerated between two chunks. */
export const IDLE_TIMEOUT_MS = 10_000;
/** The whole chain stays inside this, under the function's 60 s limit. */
export const MODEL_TIMEOUT_MS = 30_000;
/** Longest thought summary passed to the browser. */
export const MAX_THOUGHT_CHARS = 1_200;

/** How long a model is set aside after a failure that only affects that model. */
export const COOLDOWN_MS = {
  quota: 60_000,
  busy: 30_000,
  slow: 300_000,
  retired: 3_600_000,
} as const;

const blockedUntil = new Map<string, number>();

export function resetModelHealth(): void {
  blockedUntil.clear();
}

/**
 * Models to try, in order: GEMINI_MODEL (one name or a comma-separated list), then the default
 * chain. Duplicates are removed, so the chain always has somewhere to go.
 */
export function modelChain(): string[] {
  const configured = (process.env.GEMINI_MODEL ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  return [...new Set([...configured, ...DEFAULT_CHAIN])];
}

const availableAt = (model: string) => blockedUntil.get(model) ?? 0;

/** Ready models first; if all are cooling down, try them anyway, soonest to recover first. */
function attemptOrder(now: number): string[] {
  const chain = modelChain();
  const ready = chain.filter((model) => availableAt(model) <= now);
  return ready.length > 0 ? ready : [...chain].sort((a, b) => availableAt(a) - availableAt(b));
}

/** How long to set a failing model aside; null when the failure says nothing about the model. */
function cooldownFor(error: unknown): number | null {
  if (error instanceof AttemptTimeout) return COOLDOWN_MS.slow;
  const status =
    typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
  if (status === 429) return COOLDOWN_MS.quota;
  if (status === 500 || status === 503) return COOLDOWN_MS.busy;
  if (status === 404) return COOLDOWN_MS.retired;
  return null;
}

/**
 * Thought summaries are always requested: Gemini 2.5 models take a token budget, newer ones a level.
 */
export function thinkingFor(model: string): ThinkingConfig {
  return model.startsWith('gemini-2.5')
    ? { includeThoughts: true, thinkingBudget: 512 }
    : { includeThoughts: true, thinkingLevel: ThinkingLevel.MEDIUM };
}

class AttemptTimeout extends Error {}

export interface ModelRequest {
  system: string;
  user: string;
  /** JSON Schema describing the required response shape. */
  jsonSchema: Record<string, unknown>;
  /** Receives the model's thought summaries and, at the end, which model answered. */
  onEvent?: (event: AiStreamEvent) => void;
}

/** One streamed attempt. A watchdog gives up on a model that goes quiet (see the timeouts above). */
async function attempt(
  ai: GoogleGenAI,
  model: string,
  request: ModelRequest,
  budgetMs: number,
): Promise<string> {
  const controller = new AbortController();
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let fail: (error: Error) => void;
  const silent = new Promise<never>((_, reject) => {
    fail = reject;
  });
  const arm = (ms: number) => {
    clearTimeout(watchdog);
    watchdog = setTimeout(
      () => {
        controller.abort();
        fail(new AttemptTimeout());
      },
      Math.min(ms, budgetMs),
    );
  };
  const run = async () => {
    const stream = await ai.models.generateContentStream({
      model,
      contents: request.user,
      config: {
        systemInstruction: request.system,
        responseMimeType: 'application/json',
        responseJsonSchema: request.jsonSchema,
        temperature: 0.4,
        thinkingConfig: thinkingFor(model),
        abortSignal: controller.signal,
      },
    });
    let text = '';
    for await (const chunk of stream) {
      arm(IDLE_TIMEOUT_MS);
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (!part.text) continue;
        if (part.thought) {
          request.onEvent?.({ type: 'thought', text: part.text.slice(0, MAX_THOUGHT_CHARS) });
        } else text += part.text;
      }
    }
    return text;
  };
  arm(FIRST_CHUNK_TIMEOUT_MS);
  try {
    return await Promise.race([run(), silent]);
  } finally {
    clearTimeout(watchdog);
  }
}

/**
 * The only place that talks to Gemini. Reads the key from the server environment, forces JSON
 * output, streams every attempt (so thought summaries can be shown while the model works), walks the
 * model chain inside one overall budget and reports which model answered. Errors carry codes only:
 * no prompt text, no key, no stack.
 */
export async function callModel(request: ModelRequest): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiFailure(503, 'AI_UNAVAILABLE');
  const ai = new GoogleGenAI({ apiKey });
  const deadline = Date.now() + MODEL_TIMEOUT_MS;
  let timedOut = false;
  for (const model of attemptOrder(Date.now())) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const text = await attempt(ai, model, request, remaining);
      blockedUntil.delete(model);
      request.onEvent?.({ type: 'model', model });
      return text;
    } catch (error) {
      if (error instanceof AttemptTimeout) timedOut = true;
      const cooldown = cooldownFor(error);
      if (cooldown !== null) blockedUntil.set(model, Date.now() + cooldown);
    }
  }
  if (timedOut) throw new ApiFailure(504, 'AI_TIMEOUT');
  console.error('gemini: every model failed');
  throw new ApiFailure(503, 'AI_UNAVAILABLE');
}
