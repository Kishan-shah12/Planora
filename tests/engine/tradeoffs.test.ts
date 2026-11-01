import { describe, expect, it } from 'vitest';
import {
  acceptQuote,
  addQuote,
  applyOption,
  budgetStatus,
  generateOverBudgetOptions,
  setTotalBudget,
} from '../../src/engine';
import { CATEGORIES } from '../../src/schemas';
import { makePlan, makeQuote } from '../helpers';

const total = (a: Record<string, number>) => Object.values(a).reduce((x, y) => x + y, 0);

describe('generateOverBudgetOptions', () => {
  it('returns nothing when within budget', () => {
    expect(generateOverBudgetOptions(makePlan())).toEqual([]);
  });

  it('offers up to three options with exact rupee impact for 200 -> 260 guests', () => {
    const plan = { ...makePlan({ priorities: ['catering'] }), guests: 260 };
    const { overBy } = budgetStatus(plan);
    const options = generateOverBudgetOptions(plan);
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThanOrEqual(3);
    for (const o of options) expect(o.coversRupees).toBe(overBy);
    expect(options.map((o) => o.id)).toContain('reduce_guests');
    expect(options.map((o) => o.id)).toContain('trim_flexible');
  });

  it('offers all three options when the gap fits inside the buffer', () => {
    const plan = { ...makePlan({ priorities: ['catering'] }), guests: 250 };
    expect(generateOverBudgetOptions(plan).map((o) => o.id)).toEqual([
      'reduce_guests',
      'trim_flexible',
      'use_contingency',
    ]);
  });

  it('every applied option resolves the overspend and keeps the sum', () => {
    const plan = { ...makePlan({ priorities: ['catering'] }), guests: 260 };
    for (const o of generateOverBudgetOptions(plan)) {
      const next = applyOption(plan, o);
      expect(budgetStatus(next).overBy).toBe(0);
      expect(total(next.allocation)).toBe(plan.totalBudget);
    }
  });

  it('never applies automatically (plan is untouched)', () => {
    const plan = { ...makePlan(), guests: 260 };
    const copy = structuredClone(plan);
    generateOverBudgetOptions(plan);
    expect(plan).toEqual(copy);
  });

  it('guest option is skipped when it would cut 25% or more of guests', () => {
    const plan = { ...makePlan(), guests: 400 };
    expect(generateOverBudgetOptions(plan).map((o) => o.id)).not.toContain('reduce_guests');
  });

  it('contingency option carries a buffer warning and is skipped when too small or locked', () => {
    const plan = { ...makePlan(), guests: 245 };
    const opt = generateOverBudgetOptions(plan).find((o) => o.id === 'use_contingency');
    expect(opt?.warning).toMatch(/Leaves ₹.* buffer/);
    expect(
      generateOverBudgetOptions({ ...plan, locked: ['contingency'] }).map((o) => o.id),
    ).not.toContain('use_contingency');
    const huge = { ...makePlan(), guests: 600 };
    expect(generateOverBudgetOptions(huge).map((o) => o.id)).not.toContain('use_contingency');
  });

  it('trim excludes locked and priority categories', () => {
    const plan = {
      ...makePlan({ priorities: ['catering', 'photography'] }),
      guests: 230,
      locked: ['decor' as const],
    };
    const trim = generateOverBudgetOptions(plan).find((o) => o.id === 'trim_flexible');
    expect(trim).toBeDefined();
    const touched = trim?.changes.filter((c) => c.delta < 0).map((c) => c.category) ?? [];
    expect(touched).not.toContain('decor');
    expect(touched).not.toContain('photography');
    expect(touched).not.toContain('catering');
    expect(touched).not.toContain('contingency');
  });

  it('trim is unavailable when everything is locked', () => {
    const plan = { ...makePlan(), guests: 230, locked: [...CATEGORIES] };
    expect(generateOverBudgetOptions(plan).find((o) => o.id === 'trim_flexible')).toBeUndefined();
  });

  it('handles an overspend from a verified non-catering quote', () => {
    let plan = makePlan();
    plan = addQuote(
      plan,
      makeQuote({ totalPrice: plan.allocation.venue + 30_000 }, 'venue'),
      'v',
    ).plan;
    plan = acceptQuote(plan, 'v');
    const options = generateOverBudgetOptions(plan);
    expect(options.map((o) => o.id)).not.toContain('reduce_guests');
    const trim = options.find((o) => o.id === 'trim_flexible');
    expect(trim).toBeDefined();
    if (trim) {
      const next = applyOption(plan, trim);
      expect(budgetStatus(next).overBy).toBe(0);
      expect(total(next.allocation)).toBe(plan.totalBudget);
    }
  });

  it('zero per-plate plan has no guest option', () => {
    const plan = { ...setTotalBudget(makePlan(), 0), perPlate: 0 };
    expect(generateOverBudgetOptions({ ...plan, guests: 10 }).map((o) => o.id)).not.toContain(
      'reduce_guests',
    );
  });
});
