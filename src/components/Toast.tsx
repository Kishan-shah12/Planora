import { useEffect } from 'react';
import type { Occasion } from '../schemas';
import { describeChanges } from '../lib/format';
import type { ToastData } from '../state/planStore';

/** Shows what moved after a budget change. Always mounted so screen readers announce updates. */
export function Toast({
  toast,
  occasion,
  onDismiss,
}: {
  toast: ToastData | null;
  occasion: Occasion;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const text = toast
    ? [describeChanges(occasion, toast.changes), toast.note].filter(Boolean).join(' ')
    : '';
  return (
    <div
      aria-live="polite"
      role="status"
      className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {toast && text && (
        <div className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-paper shadow-lg">
          <p>{text}</p>
          <button
            type="button"
            className="btn min-h-11 shrink-0 text-paper underline"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
