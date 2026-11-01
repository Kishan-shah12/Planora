import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiStreamEvent } from '../schemas';
import { ApiError, type RequestOptions } from './api';

export type AiState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; data: T };

/** What the model has shared so far: its thought summaries, and which model gave the answer. */
export interface AiProgress {
  thoughts: string[];
  model: string | null;
}

const NO_PROGRESS: AiProgress = { thoughts: [], model: null };
/** Enough to follow the reasoning without the trace growing without bound. */
export const MAX_THOUGHTS = 12;

function withEvent(progress: AiProgress, event: AiStreamEvent): AiProgress {
  return event.type === 'thought'
    ? { ...progress, thoughts: [...progress.thoughts, event.text].slice(-MAX_THOUGHTS) }
    : { ...progress, model: event.model };
}

/**
 * Runs an AI request with loading/error/done state. Starting a new request, resetting, or
 * unmounting cancels the one in flight, so stale answers never land and no work is wasted.
 */
export function useAiCall<T, A extends unknown[]>(
  fn: (options: RequestOptions, ...args: A) => Promise<T>,
) {
  const [state, setState] = useState<AiState<T>>({ status: 'idle' });
  const [progress, setProgress] = useState<AiProgress>(NO_PROGRESS);
  const inFlight = useRef<AbortController | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => () => inFlight.current?.abort(), []);

  const run = useCallback(async (...args: A): Promise<T | null> => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ status: 'loading' });
    setProgress(NO_PROGRESS);
    const onEvent = (event: AiStreamEvent) => {
      if (!controller.signal.aborted) setProgress((current) => withEvent(current, event));
    };
    try {
      const data = await fnRef.current({ signal: controller.signal, onEvent }, ...args);
      if (!controller.signal.aborted) setState({ status: 'done', data });
      return data;
    } catch (error) {
      if (controller.signal.aborted) return null;
      const message =
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
      setState({ status: 'error', message });
      return null;
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setState({ status: 'idle' });
    setProgress(NO_PROGRESS);
  }, []);

  return { state, run, reset, progress };
}
