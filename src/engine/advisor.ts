import { CATEGORIES, type Plan } from '../schemas';
import { budgetStatus, categoryNeeds, scaleGuests } from './budget';
import { vendorChecklist } from './checklist';
import { diffDays, formatDayMonth } from './dates';
import { planInsights, type InsightSeverity } from './insights';
import { formatINR } from './money';
import { OCCASION_LABELS, categoryLabel } from './presets';
import { buildSchedule } from './timeline';

/** The facts the AI may use, computed here so the model never does arithmetic. */
export interface PlanFacts {
  occasion: Plan['occasion'];
  guests: number;
  totalBudget: number;
  daysToEvent: number;
  vibe: string;
  budget: { category: string; amount: number; verified: boolean; shortfall: number }[];
  insights: { severity: InsightSeverity; title: string; detail: string }[];
}

export function planFacts(plan: Plan, today: string): PlanFacts {
  return {
    occasion: plan.occasion,
    guests: plan.guests,
    totalBudget: plan.totalBudget,
    daysToEvent: diffDays(today, plan.eventDate),
    vibe: plan.vibe,
    budget: categoryNeeds(plan).map((n) => ({
      category: categoryLabel(plan.occasion, n.category),
      amount: plan.allocation[n.category],
      verified: n.verified,
      shortfall: n.shortfall,
    })),
    insights: planInsights(plan, today)
      .slice(0, 10)
      .map(({ severity, title, detail }) => ({ severity, title, detail })),
  };
}

type Topic = 'budget' | 'next' | 'vendors' | 'time' | 'guests' | 'overview';

/** English and Hinglish cues, so "kitna kharcha?" and "what's next?" both land correctly. */
const TOPICS: [Topic, RegExp][] = [
  ['budget', /budget|over|money|cost|spend|paisa|paise|kharch|bajat|rupee|₹|afford|lakh/],
  ['vendors', /vendor|quote|cater|decor|photo|book|dj|venue/],
  ['next', /next|to ?do|kya kar|what should|first|pehle|priority|start|task/],
  ['time', /when|date|days|din|time left|deadline|kab|how long/],
  ['guests', /guest|mehman|people|log |headcount|plate/],
];

export function topicOf(question: string): Topic {
  const q = question.toLowerCase();
  return TOPICS.find(([, pattern]) => pattern.test(q))?.[0] ?? 'overview';
}

/**
 * The built-in planner's answer, used when the AI is unavailable. Deterministic and grounded only in
 * the plan, so it is always correct, if less conversational.
 */
export function localAnswer(question: string, plan: Plan, today: string): string {
  const status = budgetStatus(plan);
  const days = diffDays(today, plan.eventDate);
  switch (topicOf(question)) {
    case 'budget':
      return status.overBy > 0
        ? `You are over budget by ${formatINR(status.overBy)} (${status.overByPct}%). Open the Budget tab to pick one of the options; nothing is cut automatically.`
        : `You are within your ${formatINR(status.total)} budget: ${formatINR(status.committed)} is backed by accepted quotations and ${formatINR(status.estimated)} is still an estimate.`;
    case 'vendors': {
      const items = vendorChecklist(plan);
      const pending = items.filter((i) => i.status !== 'quote_accepted').map((i) => i.label);
      return pending.length === 0
        ? 'Every vendor category has an accepted quotation. Well done.'
        : `${items.length - pending.length} of ${items.length} vendors are confirmed. Still open: ${pending.join(', ')}. Paste a quotation on the Vendors tab to compare and confirm.`;
    }
    case 'next': {
      const top = planInsights(plan, today)[0];
      return top
        ? `${top.title}. ${top.detail}`
        : 'Everything is on track. Nothing needs you right now.';
    }
    case 'time': {
      let open = 0;
      try {
        open = buildSchedule(plan.tasks, plan.eventDate, today).filter(
          (t) => t.status !== 'done',
        ).length;
      } catch {
        open = plan.tasks.filter((t) => t.status !== 'done').length;
      }
      const when =
        days > 0 ? `${days} days to go` : days === 0 ? 'today' : 'a date that has passed';
      return `Your ${OCCASION_LABELS[plan.occasion].toLowerCase()} is on ${formatDayMonth(plan.eventDate)}, ${when}, with ${open} tasks still open.`;
    }
    case 'guests': {
      const impact = scaleGuests(plan, plan.guests);
      return `You are planning for ${plan.guests} guests at about ${formatINR(Math.round(plan.perPlate))} a plate, which needs ${formatINR(impact.requiredCatering)} for catering against ${formatINR(impact.currentCatering)} budgeted.`;
    }
    case 'overview': {
      const confirmed = CATEGORIES.filter((c) =>
        plan.quotes.some((q) => q.category === c && q.accepted),
      ).length;
      const top = planInsights(plan, today)[0];
      const headline =
        status.overBy > 0 ? `over budget by ${formatINR(status.overBy)}` : 'within budget';
      return `${OCCASION_LABELS[plan.occasion]} for ${plan.guests} guests, ${days >= 0 ? `${days} days away` : 'date passed'}, ${headline}, ${confirmed} vendors confirmed.${top ? ` Most important now: ${top.title}.` : ''}`;
    }
  }
}
