import { diffDays, OCCASION_LABELS, toLakh } from '../engine';
import type { Plan } from '../schemas';
import { formatDate } from '../lib/format';
import { Icon } from './Icon';

function countdown(days: number): string {
  if (days > 1) return `${days} days to go`;
  if (days === 1) return 'Tomorrow';
  if (days === 0) return 'Today';
  return 'This date has passed';
}

/** The event at a glance, shown above every tab so the plan always feels like one thing. */
export function PlanMasthead({ plan, today }: { plan: Plan; today: string }) {
  const days = diffDays(today, plan.eventDate);
  return (
    <section aria-label="Plan summary" className="mb-6">
      <h2 id="plan-title" tabIndex={-1} className="text-3xl leading-tight sm:text-4xl">
        {OCCASION_LABELS[plan.occasion]}
        <span className="block text-ink-soft sm:inline">
          <span className="hidden sm:inline"> · </span>
          {formatDate(plan.eventDate)}
        </span>
      </h2>
      {plan.vibe && <p className="mt-1 font-display text-lg italic text-ink-soft">{plan.vibe}</p>}
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
        <li className="flex items-center gap-2">
          <Icon name="users" />
          {plan.guests} guests
        </li>
        <li className="flex items-center gap-2">
          <Icon name="wallet" />
          {toLakh(plan.totalBudget)} budget
        </li>
        <li className="flex items-center gap-2">
          <Icon name="calendar" />
          {countdown(days)}
        </li>
      </ul>
    </section>
  );
}
