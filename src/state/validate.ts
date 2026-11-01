import { detectCycles } from '../engine';
import { CATEGORIES, PlanSchema, type Plan } from '../schemas';

/** Structural checks the schema cannot express: the engine assumes these hold. */
export function planIsConsistent(plan: Plan): boolean {
  const sum = CATEGORIES.reduce((s, c) => s + plan.allocation[c], 0);
  if (sum !== plan.totalBudget) return false;
  const ids = new Set(plan.tasks.map((t) => t.id));
  if (ids.size !== plan.tasks.length) return false;
  if (plan.tasks.some((t) => t.dependsOn.some((d) => !ids.has(d) || d === t.id))) return false;
  if (detectCycles(plan.tasks).length > 0) return false;
  const quoteIds = new Set(plan.quotes.map((q) => q.id));
  return quoteIds.size === plan.quotes.length;
}

/** Validates untrusted data (share link, localStorage) into a usable plan, or null. */
export function parsePlan(data: unknown): Plan | null {
  const result = PlanSchema.safeParse(data);
  return result.success && planIsConsistent(result.data) ? result.data : null;
}
