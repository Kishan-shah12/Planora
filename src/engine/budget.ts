import { CATEGORIES, type Allocation, type Category, type Occasion, type Plan } from '../schemas';
import { apportion, type Share } from './money';
import { ALLOCATION_PRESETS } from './presets';
import { effectiveCost } from './quotes';

export const PRIORITY_WEIGHT = 1.25;
export const CONTINGENCY_PCT = 10;

export interface BudgetChange {
  category: Category;
  delta: number;
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function toAllocation(parts: readonly Share<Category>[]): Allocation {
  const allocation: Allocation = {
    venue: 0,
    catering: 0,
    decor: 0,
    photography: 0,
    entertainment: 0,
    misc: 0,
    contingency: 0,
  };
  for (const { item, share } of parts) allocation[item] = share;
  return allocation;
}

/**
 * Preset split with priority categories weighted x1.25, non-contingency renormalised to 90%,
 * contingency fixed at 10%. Integer rupees; parts always sum to `total`.
 */
export function allocate(
  total: number,
  occasion: Occasion,
  priorities: readonly Category[],
): Allocation {
  const preset = ALLOCATION_PRESETS[occasion];
  const weightOf = (c: Category) => preset[c] * (priorities.includes(c) ? PRIORITY_WEIGHT : 1);
  const flexible = CATEGORIES.filter((c) => c !== 'contingency');
  const weightSum = sum(flexible.map(weightOf));
  const percentOf = (c: Category) =>
    c === 'contingency' ? CONTINGENCY_PCT : (weightOf(c) / weightSum) * (100 - CONTINGENCY_PCT);
  return toAllocation(apportion(CATEGORIES, percentOf, total));
}

export interface RedistributeResult {
  allocation: Allocation;
  capped: boolean;
  /** Highest amount this category can take given what is unlocked. */
  maxAllowed: number;
  /** Lowest amount this category can take (it cannot shrink if nothing else can absorb it). */
  minAllowed: number;
  /** The amount actually applied after capping. */
  applied: number;
  changes: BudgetChange[];
}

/**
 * Sets `category` to `newAmount`, spreading the difference over unlocked categories in proportion
 * to their current amounts. Nothing goes below zero; the total never changes.
 */
export function redistribute(
  allocation: Allocation,
  category: Category,
  newAmount: number,
  locked: readonly Category[],
): RedistributeResult {
  const old = allocation[category];
  const requested = Math.max(0, Math.round(Number.isFinite(newAmount) ? newAmount : old));
  const others = CATEGORIES.filter((c) => c !== category && !locked.includes(c));
  const pool = sum(others.map((c) => allocation[c]));
  const isLocked = locked.includes(category);
  const maxAllowed = isLocked ? old : old + pool;
  const minAllowed = isLocked || others.length === 0 ? old : 0;
  const applied = Math.min(maxAllowed, Math.max(minAllowed, requested));
  const delta = applied - old;
  const next: Allocation = { ...allocation, [category]: applied };
  // Others give (or receive) the difference in proportion to their current amounts.
  for (const { item, share } of apportion(others, (c) => allocation[c], Math.abs(delta))) {
    next[item] -= Math.sign(delta) * share;
  }
  const changes: BudgetChange[] = CATEGORIES.map((c) => ({
    category: c,
    delta: next[c] - allocation[c],
  })).filter((ch) => ch.delta !== 0);
  return {
    allocation: next,
    capped: applied !== requested,
    maxAllowed,
    minAllowed,
    applied,
    changes,
  };
}

/** Re-scales every category to a new total budget, keeping the current proportions. */
export function setTotalBudget(plan: Plan, total: number): Plan {
  const totalBudget = Math.max(0, Math.floor(total));
  const allocation = toAllocation(apportion(CATEGORIES, (c) => plan.allocation[c], totalBudget));
  return { ...plan, totalBudget, allocation };
}

export interface GuestImpact {
  guests: number;
  perPlate: number;
  requiredCatering: number;
  currentCatering: number;
  /** Catering shortfall only; the total is never changed silently. */
  overBy: number;
}

export function scaleGuests(plan: Plan, newGuests: number): GuestImpact {
  const guests = Math.max(1, Math.floor(newGuests));
  const requiredCatering = Math.round(plan.perPlate * guests);
  const currentCatering = plan.allocation.catering;
  return {
    guests,
    perPlate: plan.perPlate,
    requiredCatering,
    currentCatering,
    overBy: Math.max(0, requiredCatering - currentCatering),
  };
}

export interface CategoryNeed {
  category: Category;
  amount: number;
  verified: boolean;
  /** Rupees needed beyond the category's allocation. */
  shortfall: number;
}

/** What each category will really cost: verified quote, guest-scaled catering, or its allocation. */
export function categoryNeeds(plan: Plan): CategoryNeed[] {
  return CATEGORIES.map((category) => {
    const accepted = plan.quotes.find((q) => q.category === category && q.accepted);
    const cost = accepted ? effectiveCost(accepted.quote, plan.guests) : null;
    let amount: number;
    let verified = false;
    if (cost != null) {
      amount = cost;
      verified = true;
    } else if (category === 'catering') {
      amount = Math.round(plan.perPlate * plan.guests);
    } else {
      amount = plan.allocation[category];
    }
    return {
      category,
      amount,
      verified,
      shortfall: Math.max(0, amount - plan.allocation[category]),
    };
  });
}

export interface BudgetStatus {
  total: number;
  /** Spend backed by accepted vendor quotes. */
  committed: number;
  /** Spend still based on allocation presets or per-plate estimates. */
  estimated: number;
  overBy: number;
  overByPct: number;
}

export function budgetStatus(plan: Plan): BudgetStatus {
  const needs = categoryNeeds(plan);
  const committed = sum(needs.filter((n) => n.verified).map((n) => n.amount));
  const estimated = sum(needs.filter((n) => !n.verified).map((n) => n.amount));
  const overBy = sum(needs.map((n) => n.shortfall));
  const overByPct =
    plan.totalBudget > 0
      ? Math.round((overBy / plan.totalBudget) * 1000) / 10
      : overBy > 0
        ? 100
        : 0;
  return { total: plan.totalBudget, committed, estimated, overBy, overByPct };
}
