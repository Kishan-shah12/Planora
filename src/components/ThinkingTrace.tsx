import { useEffect, useState } from 'react';
import type { AiProgress } from '../lib/useAiCall';
import { Icon } from './Icon';

/** Gemini's thought summaries start with a bold heading: split it from the text that follows. */
export function splitThought(text: string): { title: string | null; body: string } {
  const match = /^\s*\*\*(.+?)\*\*\s*/.exec(text);
  const title = match?.[1]?.trim() ?? null;
  const body = (match ? text.slice(match[0].length) : text).replace(/\*\*/g, '').trim();
  return { title, body };
}

/** "gemini-3.1-flash-lite" -> "Gemini 3.1 Flash Lite". */
export function modelLabel(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function Thoughts({ thoughts, live }: { thoughts: string[]; live: boolean }) {
  return (
    <ol className="space-y-3 border-l-2 border-accent/30 pl-3">
      {thoughts.map((thought, index) => {
        const { title, body } = splitThought(thought);
        const newest = live && index === thoughts.length - 1;
        return (
          <li key={index} className={`text-sm ${newest ? 'thought-in' : ''}`}>
            {title && <p className="font-semibold">{title}</p>}
            {body && <p className="text-ink-soft">{body}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function useElapsedSeconds(): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return seconds;
}

/**
 * While Gemini works: a live panel with a running timer and the model's own thought summaries as they
 * stream in, so the wait is never blank. Shown as text, never as HTML.
 */
export function LiveThinking({ label, progress }: { label: string; progress: AiProgress }) {
  const seconds = useElapsedSeconds();
  const { thoughts } = progress;
  return (
    <div
      role="status"
      className="rounded-xl border border-accent/25 bg-accent-soft p-4"
      data-testid="ai-loading"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-accent">
        <Icon name="sparkle" className="thinking-pulse h-4 w-4" />
        {label}
        <span className="ml-auto text-xs font-normal tabular-nums text-ink-soft">{seconds}s</span>
      </p>
      <div data-testid="thinking-live" className="mt-3">
        {thoughts.length > 0 ? (
          <>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Gemini&apos;s thinking, live
            </p>
            <Thoughts thoughts={thoughts} live />
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft">Waiting for Gemini&apos;s first thought…</p>
            <div className="skeleton mt-2 h-3 w-2/3" />
            <div className="skeleton mt-2 h-3 w-1/2" />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * After the answer: which model replied, and the thinking behind it, kept (collapsed) so the family
 * can still see how Gemini got there.
 */
export function AnswerMeta({ progress }: { progress: AiProgress }) {
  const { thoughts, model } = progress;
  if (!model && thoughts.length === 0) return null;
  return (
    <div className="mt-3 text-xs text-ink-soft" data-testid="answer-meta">
      {model && <p>Answered by {modelLabel(model)}</p>}
      {thoughts.length > 0 && (
        <details className="mt-1 text-sm" data-testid="thinking-done">
          <summary className="cursor-pointer font-medium text-accent">
            How Gemini thought about this ({thoughts.length}{' '}
            {thoughts.length === 1 ? 'step' : 'steps'})
          </summary>
          <div className="mt-2">
            <Thoughts thoughts={thoughts} live={false} />
          </div>
        </details>
      )}
    </div>
  );
}
