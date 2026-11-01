import { CATEGORIES, MAX_GUESTS, type Category, type Intake, type Plan } from '../schemas';
import { allocate } from './budget';
import { TASK_TEMPLATES } from './presets';

/** Builds the single connected plan object from the six intake essentials. */
export function createPlan(intake: Intake): Plan {
  const priorities = [...new Set(intake.priorities)];
  const allocation = allocate(intake.totalBudget, intake.occasion, priorities);
  return {
    version: 1,
    occasion: intake.occasion,
    totalBudget: intake.totalBudget,
    guests: intake.guests,
    eventDate: intake.eventDate,
    vibe: intake.vibe ?? '',
    priorities,
    allocation,
    locked: [],
    contacted: [],
    // Kept as an exact ratio so unchanged guests never read as an overspend.
    perPlate: allocation.catering / intake.guests,
    tasks: TASK_TEMPLATES[intake.occasion].map((t) => ({
      ...t,
      dependsOn: [...t.dependsOn],
      status: 'todo' as const,
    })),
    quotes: [],
  };
}

/** Guest count from user text: a whole number from 1 to MAX_GUESTS, otherwise null. */
export function parseGuests(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= MAX_GUESTS ? n : null;
}

export type BudgetTier = 'modest' | 'comfortable' | 'premium';

/** Rough per-guest spending band (rupees per head) used to tune AI ideas, never to price anything. */
export function budgetTier(plan: Pick<Plan, 'totalBudget' | 'guests'>): BudgetTier {
  const perGuest = plan.totalBudget / Math.max(1, plan.guests);
  if (perGuest < 2000) return 'modest';
  if (perGuest < 5000) return 'comfortable';
  return 'premium';
}

export interface Readiness {
  tasksDone: number;
  tasksTotal: number;
  quotesVerified: number;
  quotesTotal: number;
  percent: number;
}

/** Plan readiness for the header: tasks done plus categories backed by a verified quote. */
export function planReadiness(plan: Plan): Readiness {
  const quotable = CATEGORIES.filter((c): c is Category => c !== 'contingency');
  const verified = quotable.filter((c) =>
    plan.quotes.some((q) => q.category === c && q.accepted),
  ).length;
  const done = plan.tasks.filter((t) => t.status === 'done').length;
  const total = plan.tasks.length + quotable.length;
  return {
    tasksDone: done,
    tasksTotal: plan.tasks.length,
    quotesVerified: verified,
    quotesTotal: quotable.length,
    // `total` always includes the six bookable categories, so it is never zero.
    percent: Math.round(((done + verified) / total) * 100),
  };
}
