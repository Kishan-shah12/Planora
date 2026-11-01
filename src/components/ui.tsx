import { useId, type ReactNode } from 'react';
import type { AiProgress } from '../lib/useAiCall';
import { Icon } from './Icon';
import { LiveThinking } from './ThinkingTrace';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function Field({
  id: fixedId,
  label,
  hint,
  error,
  children,
}: {
  /** Stable id, needed when something else links to this field (an error summary). */
  id?: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const generated = useId();
  const id = fixedId ?? generated;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 flex items-start gap-1.5 text-sm font-medium text-warn">
          <Icon name="alert" className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function EstimateBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="badge-verified">
      <Icon name="check" className="h-3 w-3" /> Verified quotation
    </span>
  ) : (
    <span className="badge-estimate">Estimate</span>
  );
}

/** Live "Gemini is thinking" panel: a running timer plus the model's own thoughts as they stream in. */
export function AiLoading({ label, progress }: { label: string; progress: AiProgress }) {
  return <LiveThinking label={label} progress={progress} />;
}

export function AiError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-warn/40 bg-warn-soft p-3 text-sm text-warn"
    >
      <p className="flex items-start gap-2 font-medium">
        <Icon name="alert" className="mt-0.5 h-4 w-4" />
        <span>{message}</span>
      </p>
      <button type="button" className="btn-secondary mt-2" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  action,
  onAction,
}: {
  title: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="card py-10 text-center">
      <p className="font-display text-xl">{title}</p>
      <button type="button" className="btn-primary mt-5" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

/** Inline two-step confirmation (no modal needed, works with keyboards and screen readers). */
export function Confirm({
  prompt,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  prompt: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Confirm action"
      className="mt-3 rounded-xl border border-line bg-paper p-3"
    >
      <p className="text-sm font-medium">{prompt}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
