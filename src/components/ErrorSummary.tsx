import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

export interface FieldError {
  /** Id of the input the message belongs to. */
  fieldId: string;
  message: string;
}

/**
 * GOV.UK-style error summary: after a failed submit it takes focus, says how many things need
 * fixing, and links straight to each field. `attempt` changes on every failed submit.
 */
export function ErrorSummary({ errors, attempt }: { errors: FieldError[]; attempt: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (attempt > 0) ref.current?.focus();
  }, [attempt]);

  if (attempt === 0 || errors.length === 0) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-h"
      className="rounded-xl border border-warn/50 bg-warn-soft p-4 text-warn"
    >
      <h3 id="error-summary-h" className="flex items-center gap-2 text-warn">
        <Icon name="alert" />
        Please fix {errors.length} {errors.length === 1 ? 'thing' : 'things'} to create your plan
      </h3>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
        {errors.map((error) => (
          <li key={error.fieldId}>
            <a
              href={`#${error.fieldId}`}
              className="font-medium underline underline-offset-2"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(error.fieldId)?.focus();
              }}
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
