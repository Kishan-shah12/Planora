import { categoryLabel } from '../engine';
import { CATEGORIES, type Category, type Occasion } from '../schemas';
import { Field } from './ui';

const PRIORITY_CATEGORIES = CATEGORIES.filter((c) => c !== 'contingency');

/** The optional part of the intake: style and the categories that matter most. */
export function PlanExtras({
  occasion,
  vibe,
  priorities,
  onVibe,
  onPriorities,
}: {
  occasion: Occasion;
  vibe: string;
  priorities: Category[];
  onVibe: (vibe: string) => void;
  onPriorities: (priorities: Category[]) => void;
}) {
  function toggle(category: Category) {
    onPriorities(
      priorities.includes(category)
        ? priorities.filter((c) => c !== category)
        : [...priorities, category],
    );
  }

  return (
    <details className="rounded-xl border border-line p-4">
      <summary className="min-h-11 cursor-pointer font-medium">Make it yours (optional)</summary>
      <div className="mt-4 space-y-5">
        <Field label="Style or vibe" hint="For example: traditional, minimal, fun for kids.">
          {(p) => (
            <input
              {...p}
              className="input"
              maxLength={200}
              value={vibe}
              onChange={(e) => onVibe(e.target.value)}
            />
          )}
        </Field>
        <fieldset>
          <legend className="label">
            What matters most? We give these categories more of the budget.
          </legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {PRIORITY_CATEGORIES.map((c) => (
              <label
                key={c}
                className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-paper"
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-accent"
                  checked={priorities.includes(c)}
                  onChange={() => toggle(c)}
                />
                {categoryLabel(occasion, c)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </details>
  );
}
