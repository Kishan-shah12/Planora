import { CATEGORIES, type Category, type Plan } from '../schemas';
import { budgetStatus } from './budget';
import { diffDays, formatDayMonth } from './dates';
import { formatINR, percentOf } from './money';
import { categoryLabel } from './presets';
import { compareQuote } from './quotes';
import { buildSchedule, type ScheduledTask } from './timeline';

export type InsightSeverity = 'critical' | 'warning' | 'suggestion';
export type InsightTab = 'budget' | 'timeline' | 'vendors';

/** One deterministic observation about the plan, with where to act on it. */
export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  tab: InsightTab;
}

const RANK: Record<InsightSeverity, number> = { critical: 0, warning: 1, suggestion: 2 };
/** Days before the event when every vendor should already be confirmed. */
export const CONFIRM_VENDORS_BY_DAYS = 60;
/** Contingency below this share of the budget is flagged as thin. */
export const THIN_BUFFER_PCT = 5;

function names(tasks: readonly ScheduledTask[], max = 3): string {
  const shown = tasks.slice(0, max).map((t) => t.title);
  const more = tasks.length - shown.length;
  return more > 0 ? `${shown.join('; ')} and ${more} more` : shown.join('; ');
}

function scheduleOrEmpty(plan: Plan, today: string): ScheduledTask[] {
  try {
    return buildSchedule(plan.tasks, plan.eventDate, today);
  } catch {
    return [];
  }
}

/**
 * The planning assistant's reasoning: reads budget, timeline and vendor state together and returns
 * what needs attention, most urgent first. Pure and deterministic; the AI only rephrases this.
 */
export function planInsights(plan: Plan, today: string): Insight[] {
  const out: Insight[] = [];
  const status = budgetStatus(plan);
  const schedule = scheduleOrEmpty(plan, today);
  const open = schedule.filter((t) => t.status !== 'done');
  const daysToEvent = diffDays(today, plan.eventDate);

  if (status.overBy > 0) {
    out.push({
      id: 'over-budget',
      severity: 'critical',
      title: `Over budget by ${formatINR(status.overBy)}`,
      detail: `That is ${status.overByPct}% of your total. Pick one of the options to close the gap.`,
      tab: 'budget',
    });
  }

  const impossible = open.filter((t) => t.flags.impossible);
  if (impossible.length > 0) {
    out.push({
      id: 'impossible',
      severity: 'critical',
      title: `${impossible.length} ${impossible.length === 1 ? 'task' : 'tasks'} cannot finish before the event`,
      detail: `${names(impossible)}. Shorten the delay or simplify these.`,
      tab: 'timeline',
    });
  }

  const overdue = open.filter((t) => t.flags.overdue && !t.flags.impossible);
  if (overdue.length > 0) {
    out.push({
      id: 'overdue',
      severity: 'warning',
      title: `${overdue.length} ${overdue.length === 1 ? 'task is' : 'tasks are'} overdue`,
      detail: `${names(overdue)}. Do these first or mark them done.`,
      tab: 'timeline',
    });
  }

  const atRisk = open.filter((t) => t.flags.atRisk && !t.flags.overdue && !t.flags.impossible);
  if (atRisk.length > 0) {
    out.push({
      id: 'at-risk',
      severity: 'warning',
      title: `${atRisk.length} ${atRisk.length === 1 ? 'task is' : 'tasks are'} at risk from a delay`,
      detail: `${names(atRisk)}. They now finish later than planned.`,
      tab: 'timeline',
    });
  }

  for (const q of plan.quotes.filter((x) => x.accepted)) {
    const issues = compareQuote(q.quote, plan).filter((f) =>
      ['guestMinimumExceedsGuests', 'advanceHigh', 'noCancellationPolicy', 'taxNotStated'].includes(
        f.code,
      ),
    );
    if (issues.length > 0) {
      out.push({
        id: `quote-${q.id}`,
        severity: 'warning',
        title: `Check the accepted ${categoryLabel(plan.occasion, q.category).toLowerCase()} quotation`,
        detail: issues.map((i) => i.message).join(' '),
        tab: 'vendors',
      });
    }
  }

  const bookable = CATEGORIES.filter(
    (c): c is Exclude<Category, 'contingency'> => c !== 'contingency',
  );
  const unconfirmed = bookable.filter(
    (c) => !plan.quotes.some((q) => q.category === c && q.accepted),
  );
  if (unconfirmed.length > 0) {
    const labels = unconfirmed.map((c) => categoryLabel(plan.occasion, c)).join(', ');
    const soon = daysToEvent <= CONFIRM_VENDORS_BY_DAYS;
    out.push({
      id: 'vendors',
      severity: soon ? 'warning' : 'suggestion',
      title: soon
        ? `${unconfirmed.length} vendors still unconfirmed with ${Math.max(0, daysToEvent)} days to go`
        : `Collect quotations for ${unconfirmed.length} categories`,
      detail: `${labels}. Paste a quotation to compare and confirm.`,
      tab: 'vendors',
    });
  }

  const bufferPct = percentOf(plan.allocation.contingency, plan.totalBudget);
  if (plan.totalBudget > 0 && bufferPct < THIN_BUFFER_PCT) {
    out.push({
      id: 'thin-buffer',
      severity: 'suggestion',
      title: `Your buffer is thin: ${formatINR(plan.allocation.contingency)} (${bufferPct}%)`,
      detail: 'Last-minute costs are common. Consider keeping at least 5% aside.',
      tab: 'budget',
    });
  }

  // Skip tasks already reported as overdue or impossible so the list never repeats itself.
  const next = open
    .filter((t) => !t.flags.overdue && !t.flags.impossible)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))[0];
  if (next) {
    out.push({
      id: 'next-task',
      severity: 'suggestion',
      title: `Next up: ${next.title}`,
      detail: next.assignee
        ? `Due ${formatDayMonth(next.effectiveDate)}, handled by ${next.assignee}.`
        : `Due ${formatDayMonth(next.effectiveDate)}. Nobody is assigned yet.`,
      tab: 'timeline',
    });
  }

  return out
    .map((insight, order) => ({ insight, order }))
    .sort((a, b) => RANK[a.insight.severity] - RANK[b.insight.severity] || a.order - b.order)
    .map(({ insight }) => insight);
}
