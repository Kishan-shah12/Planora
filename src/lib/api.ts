import type { ZodType } from 'zod';
import {
  AiStreamLineSchema,
  ExplanationsSchema,
  IdeasSchema,
  IntakeParseSchema,
  PlanReviewSchema,
  PlannerAnswerSchema,
  QuoteSchema,
  type AiStreamEvent,
  type Category,
  type Explanations,
  type Ideas,
  type IntakeParse,
  type PlanReview,
  type PlannerAnswer,
  type Quote,
} from '../schemas';
import type {
  AskPlannerRequestSchema,
  ExplainTradeoffsRequestSchema,
  ReviewPlanRequestSchema,
  SuggestIdeasRequestSchema,
} from '../schemas';
import type { z } from 'zod';

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'too_large'
  | 'invalid_input'
  | 'ai_invalid'
  | 'ai_unavailable'
  | 'cancelled'
  | 'server';

const MESSAGES: Record<ApiErrorKind, string> = {
  network: 'Could not reach the AI service. Check your connection and try again.',
  timeout: 'The AI took too long to answer. Please try again.',
  rate_limited: 'Too many AI requests. Please wait a few minutes and try again.',
  too_large: 'That text is too long. Please shorten it and try again.',
  invalid_input: 'That input could not be used. Please check it and try again.',
  ai_invalid: 'The AI gave an answer we could not trust. Please try again.',
  ai_unavailable: 'AI help is unavailable right now. Everything else still works.',
  cancelled: 'The request was cancelled.',
  server: 'Something went wrong on our side. Please try again.',
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  constructor(kind: ApiErrorKind) {
    super(MESSAGES[kind]);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

function kindFromStatus(status: number, code: unknown): ApiErrorKind {
  if (code === 'AI_RESPONSE_INVALID') return 'ai_invalid';
  if (status === 429) return 'rate_limited';
  if (status === 413) return 'too_large';
  if (status === 400 || status === 415) return 'invalid_input';
  if (status === 504 || code === 'AI_TIMEOUT') return 'timeout';
  if (status === 503 || code === 'AI_UNAVAILABLE') return 'ai_unavailable';
  return 'server';
}

/** A little above the server's own 30 s budget for the whole model chain. */
export const CLIENT_TIMEOUT_MS = 40_000;

export interface RequestOptions {
  /** Injected in tests; defaults to the global fetch. */
  fetcher?: typeof fetch;
  /** Lets the caller cancel a request it no longer needs (newer request, unmounted panel). */
  signal?: AbortSignal;
  /** Asks for a streamed answer and receives the model's thoughts while it works. */
  onEvent?: (event: AiStreamEvent) => void;
}

/**
 * Reads an NDJSON answer: passes thoughts on as they arrive and returns the final `result` data.
 * Any line that does not match the expected shape makes the whole answer untrusted.
 */
async function readStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AiStreamEvent) => void,
): Promise<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (line: string): { data: unknown } | null => {
    if (!line.trim()) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new ApiError('ai_invalid');
    }
    const parsed = AiStreamLineSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError('ai_invalid');
    const event = parsed.data;
    if (event.type === 'result') return { data: event.data };
    if (event.type === 'error') throw new ApiError(kindFromStatus(500, event.error));
    onEvent(event);
    return null;
  };
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      const result = handle(line);
      if (result) return result.data;
    }
    if (done) throw new ApiError('server');
  }
}

async function post<T>(
  path: string,
  body: unknown,
  schema: ZodType<T>,
  { fetcher = fetch, signal, onEvent }: RequestOptions = {},
): Promise<T> {
  if (signal?.aborted) throw new ApiError('cancelled');
  const controller = new AbortController();
  const outcome = { timedOut: false };
  const timer = setTimeout(() => {
    outcome.timedOut = true;
    controller.abort();
  }, CLIENT_TIMEOUT_MS);
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel);
  try {
    const response = await fetcher(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(onEvent ? { Accept: 'application/x-ndjson, application/json' } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data: unknown = null;
    const streamed = (response.headers.get('content-type') ?? '').includes('ndjson');
    if (streamed && onEvent && response.body) {
      data = await readStream(response.body, onEvent);
    } else {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    }
    if (!response.ok) {
      const code = typeof data === 'object' && data !== null && 'error' in data ? data.error : null;
      throw new ApiError(kindFromStatus(response.status, code));
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new ApiError('ai_invalid');
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError(outcome.timedOut ? 'timeout' : 'cancelled');
    throw new ApiError('network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export function parseIntake(text: string, options?: RequestOptions): Promise<IntakeParse> {
  return post('/api/parse-intake', { text }, IntakeParseSchema, options);
}

export function extractQuote(
  text: string,
  category: Category,
  options?: RequestOptions,
): Promise<Quote> {
  return post('/api/extract-quote', { text, category }, QuoteSchema, options);
}

export function explainTradeoffs(
  request: z.input<typeof ExplainTradeoffsRequestSchema>,
  options?: RequestOptions,
): Promise<Explanations> {
  return post('/api/explain-tradeoffs', request, ExplanationsSchema, options);
}

export function suggestIdeas(
  request: z.input<typeof SuggestIdeasRequestSchema>,
  options?: RequestOptions,
): Promise<Ideas> {
  return post('/api/suggest-ideas', request, IdeasSchema, options);
}

export function reviewPlan(
  request: z.input<typeof ReviewPlanRequestSchema>,
  options?: RequestOptions,
): Promise<PlanReview> {
  return post('/api/review-plan', request, PlanReviewSchema, options);
}

export function askPlanner(
  request: z.input<typeof AskPlannerRequestSchema>,
  options?: RequestOptions,
): Promise<PlannerAnswer> {
  return post('/api/ask-planner', request, PlannerAnswerSchema, options);
}
