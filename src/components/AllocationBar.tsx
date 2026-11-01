import { categoryLabel, percentOf } from '../engine';
import { CATEGORIES, type Category, type Plan } from '../schemas';

/**
 * Tonal palette for the split, as CSS classes (see index.css) so the strict CSP needs no inline
 * styles. Meaning is carried by the text legend, never by colour alone.
 */
export const SWATCH_CLASS: Record<Category, string> = {
  venue: 'sw-venue',
  catering: 'sw-catering',
  decor: 'sw-decor',
  photography: 'sw-photography',
  entertainment: 'sw-entertainment',
  misc: 'sw-misc',
  contingency: 'sw-contingency',
};

export function AllocationBar({ plan }: { plan: Plan }) {
  const pctOf = (c: (typeof CATEGORIES)[number]) => percentOf(plan.allocation[c], plan.totalBudget);
  const parts = CATEGORIES.map((c, i) => ({
    category: c,
    label: categoryLabel(plan.occasion, c),
    pct: pctOf(c),
    // Where this segment starts: the sum of the shares before it.
    x: CATEGORIES.slice(0, i).reduce((sum, before) => sum + pctOf(before), 0),
  }));
  const summary = parts.map((p) => `${p.label} ${p.pct}%`).join(', ');
  return (
    <div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-line">
        <svg
          role="img"
          aria-label={`Budget split: ${summary}`}
          viewBox="0 0 100 1"
          preserveAspectRatio="none"
          className="block h-full w-full"
        >
          {parts.map((p) => (
            <rect
              key={p.category}
              x={p.x}
              y={0}
              width={p.pct}
              height={1}
              className={SWATCH_CLASS[p.category]}
            />
          ))}
        </svg>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {parts.map((p) => (
          <li key={p.category} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${SWATCH_CLASS[p.category]}`}
            />
            <span className="truncate">{p.label}</span>
            <span className="tabular ml-auto text-ink-soft">{p.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
