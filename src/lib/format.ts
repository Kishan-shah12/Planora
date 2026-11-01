import { categoryLabel, formatINR, type BudgetChange } from '../engine';
import type { Occasion } from '../schemas';

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Wed, 15 Jul 2026" from a YYYY-MM-DD string. */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date);
}

export function signedINR(amount: number): string {
  return `${amount > 0 ? '+' : ''}${formatINR(amount)}`;
}

/** "Photography +₹40,000 · Decor −₹25,000" */
export function describeChanges(occasion: Occasion, changes: readonly BudgetChange[]): string {
  return changes
    .map((c) => `${categoryLabel(occasion, c.category)} ${signedINR(c.delta)}`)
    .join(' · ');
}
