import type { Category, Plan } from '../schemas';
import { budgetStatus, categoryNeeds, type BudgetChange } from './budget';
import { apportion, formatINR } from './money';
import { categoryLabel } from './presets';

export type OptionId = 'reduce_guests' | 'trim_flexible' | 'use_contingency';

export interface TradeoffOption {
  id: OptionId;
  title: string;
  description: string;
  /** Rupees of the over-budget amount this option removes. */
  coversRupees: number;
  /** Set only by the guest option. */
  newGuests?: number;
  changes: BudgetChange[];
  warning?: string;
}

/** Largest share of a flexible category the engine will suggest trimming. */
export const MAX_TRIM_SHARE = 0.4;
/** The guest option is offered only when it removes less than this share of guests. */
export const MAX_GUEST_CUT_SHARE = 0.25;

function fundingChanges(plan: Plan): BudgetChange[] {
  return categoryNeeds(plan)
    .filter((n) => n.shortfall > 0)
    .map((n) => ({ category: n.category, delta: n.shortfall }));
}

function guestOption(plan: Plan, overBy: number): TradeoffOption | null {
  if (plan.perPlate <= 0) return null;
  const remove = Math.ceil(overBy / plan.perPlate);
  const newGuests = plan.guests - remove;
  if (newGuests < 1 || remove * 4 >= plan.guests) return null;
  if (budgetStatus({ ...plan, guests: newGuests }).overBy > 0) return null;
  return {
    id: 'reduce_guests',
    title: `Reduce guests by ${remove}`,
    description: `Go from ${plan.guests} to ${newGuests} guests. Catering falls back within its budget at ${formatINR(Math.round(plan.perPlate))} per plate.`,
    coversRupees: overBy,
    newGuests,
    changes: [],
  };
}

function trimOption(plan: Plan, overBy: number): TradeoffOption | null {
  const needs = categoryNeeds(plan);
  const sources = needs.filter(
    (n) =>
      n.category !== 'contingency' &&
      !plan.locked.includes(n.category) &&
      !plan.priorities.includes(n.category) &&
      !n.verified &&
      n.shortfall === 0 &&
      plan.allocation[n.category] > 0,
  );
  const capacity = sources.reduce(
    (s, n) => s + Math.floor(plan.allocation[n.category] * MAX_TRIM_SHARE),
    0,
  );
  if (sources.length === 0 || capacity < overBy) return null;
  const changes: BudgetChange[] = apportion(sources, (n) => plan.allocation[n.category], overBy)
    .filter((part) => part.share > 0)
    .map((part) => ({ category: part.item.category, delta: -part.share }));
  changes.push(...fundingChanges(plan));
  const names = sources.map((n) => categoryLabel(plan.occasion, n.category)).join(', ');
  return {
    id: 'trim_flexible',
    title: 'Trim flexible categories',
    description: `Take ${formatINR(overBy)} proportionally from ${names}. Locked, priority and quoted categories are untouched.`,
    coversRupees: overBy,
    changes,
  };
}

function contingencyOption(plan: Plan, overBy: number): TradeoffOption | null {
  const buffer = plan.allocation.contingency;
  if (plan.locked.includes('contingency') || buffer < overBy) return null;
  return {
    id: 'use_contingency',
    title: 'Use the contingency buffer',
    description: `Move ${formatINR(overBy)} from the contingency buffer to cover the gap.`,
    coversRupees: overBy,
    changes: [{ category: 'contingency', delta: -overBy }, ...fundingChanges(plan)],
    warning: `Leaves ${formatINR(buffer - overBy)} buffer for surprises.`,
  };
}

/** Up to three explicit ways to close the gap. Nothing is applied until the user picks one. */
export function generateOverBudgetOptions(plan: Plan): TradeoffOption[] {
  const { overBy } = budgetStatus(plan);
  if (overBy <= 0) return [];
  return [
    guestOption(plan, overBy),
    trimOption(plan, overBy),
    contingencyOption(plan, overBy),
  ].filter((o): o is TradeoffOption => o !== null);
}

/** Explicit, separate step: returns a new plan with the chosen option applied. */
export function applyOption(plan: Plan, option: TradeoffOption): Plan {
  if (option.newGuests != null) return { ...plan, guests: option.newGuests };
  const allocation = { ...plan.allocation };
  for (const { category, delta } of option.changes) {
    const key: Category = category;
    allocation[key] = Math.max(0, allocation[key] + delta);
  }
  return { ...plan, allocation };
}
