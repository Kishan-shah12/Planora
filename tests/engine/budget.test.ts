import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_PRESETS,
  allocate,
  budgetStatus,
  categoryLabel,
  createPlan,
  planReadiness,
  redistribute,
  scaleGuests,
  setTotalBudget,
} from '../../src/engine';
import { CATEGORIES, OCCASIONS } from '../../src/schemas';
import { makePlan, makeQuote } from '../helpers';
import { acceptQuote, addQuote } from '../../src/engine';

const total = (a: Record<string, number>) => Object.values(a).reduce((x, y) => x + y, 0);

describe('presets', () => {
  it('each preset sums to 100 and labels override per occasion', () => {
    for (const o of OCCASIONS) expect(total(ALLOCATION_PRESETS[o])).toBe(100);
    expect(categoryLabel('kids_birthday', 'entertainment')).toBe('Games & activities');
    expect(categoryLabel('kids_birthday', 'misc')).toBe('Return gifts');
    expect(categoryLabel('milestone', 'entertainment')).toBe('Tribute & AV');
    expect(categoryLabel('community', 'misc')).toBe('Permits & safety');
    expect(categoryLabel('wedding', 'venue')).toBe('Venue');
  });
});

describe('allocate', () => {
  it('sums exactly to the budget for many totals and occasions', () => {
    for (const o of OCCASIONS) {
      for (const t of [0, 1, 6, 999, 800_000, 1_234_567, 2_000_000_000]) {
        expect(total(allocate(t, o, ['catering', 'decor']))).toBe(t);
      }
    }
  });

  it('keeps contingency at 10% and boosts priorities', () => {
    const plain = allocate(1_000_000, 'wedding', []);
    const boosted = allocate(1_000_000, 'wedding', ['photography']);
    expect(plain.contingency).toBe(100_000);
    expect(boosted.contingency).toBe(100_000);
    expect(boosted.photography).toBeGreaterThan(plain.photography);
    expect(boosted.catering).toBeLessThan(plain.catering);
    expect(plain.catering).toBe(350_000 * 1);
  });

  it('clamps negative totals to zero', () => {
    expect(total(allocate(-50, 'wedding', []))).toBe(0);
  });

  it('survives every category as a priority', () => {
    const all = allocate(500_000, 'community', [...CATEGORIES]);
    expect(total(all)).toBe(500_000);
  });
});

describe('redistribute', () => {
  const plan = makePlan();

  it('spreads an increase over unlocked categories and reports diffs', () => {
    const r = redistribute(
      plan.allocation,
      'photography',
      plan.allocation.photography + 40_000,
      [],
    );
    expect(r.capped).toBe(false);
    expect(total(r.allocation)).toBe(800_000);
    expect(r.allocation.photography).toBe(plan.allocation.photography + 40_000);
    expect(r.changes.find((c) => c.category === 'photography')?.delta).toBe(40_000);
    expect(r.changes.reduce((s, c) => s + c.delta, 0)).toBe(0);
  });

  it('never touches locked categories', () => {
    const r = redistribute(plan.allocation, 'decor', plan.allocation.decor + 20_000, [
      'catering',
      'venue',
    ]);
    expect(r.allocation.catering).toBe(plan.allocation.catering);
    expect(r.allocation.venue).toBe(plan.allocation.venue);
    expect(total(r.allocation)).toBe(800_000);
  });

  it('caps at the max feasible amount', () => {
    const r = redistribute(plan.allocation, 'decor', 5_000_000, []);
    expect(r.capped).toBe(true);
    expect(r.applied).toBe(800_000);
    expect(r.maxAllowed).toBe(800_000);
    expect(
      Object.entries(r.allocation)
        .filter(([k]) => k !== 'decor')
        .every(([, v]) => v === 0),
    ).toBe(true);
  });

  it('returning money to others when reducing a category', () => {
    const r = redistribute(plan.allocation, 'catering', 100_000, []);
    expect(total(r.allocation)).toBe(800_000);
    expect(r.allocation.venue).toBeGreaterThan(plan.allocation.venue);
  });

  it('with every category locked nothing can change', () => {
    const r = redistribute(plan.allocation, 'decor', 999_999, [...CATEGORIES]);
    expect(r.capped).toBe(true);
    expect(r.allocation).toEqual(plan.allocation);
    expect(r.changes).toEqual([]);
  });

  it('cannot shrink when no other category can absorb it', () => {
    const r = redistribute(
      plan.allocation,
      'decor',
      0,
      CATEGORIES.filter((c) => c !== 'decor'),
    );
    expect(r.capped).toBe(true);
    expect(r.allocation).toEqual(plan.allocation);
  });

  it('handles NaN and negative input safely', () => {
    expect(redistribute(plan.allocation, 'decor', Number.NaN, []).allocation).toEqual(
      plan.allocation,
    );
    const r = redistribute(plan.allocation, 'decor', -500, []);
    expect(r.allocation.decor).toBe(0);
    expect(total(r.allocation)).toBe(800_000);
  });

  it('splits evenly when the other categories are all empty', () => {
    const a = {
      venue: 0,
      catering: 0,
      decor: 100,
      photography: 0,
      entertainment: 0,
      misc: 0,
      contingency: 0,
    };
    const r = redistribute(a, 'decor', 40, []);
    expect(total(r.allocation)).toBe(100);
    expect(r.allocation.decor).toBe(40);
  });
});

describe('plan creation and guests', () => {
  it('captures per-plate from catering and guests', () => {
    const plan = createPlan({
      occasion: 'wedding',
      totalBudget: 800_000,
      guests: 200,
      eventDate: '2026-07-15',
      priorities: ['catering', 'catering'],
    });
    expect(plan.priorities).toEqual(['catering']);
    expect(Math.round(plan.perPlate * 200)).toBe(plan.allocation.catering);
    expect(plan.vibe).toBe('');
    expect(budgetStatus(plan).overBy).toBe(0);
  });

  it('scaleGuests reports required catering without changing the total', () => {
    const plan = makePlan();
    const impact = scaleGuests(plan, 260);
    expect(impact.requiredCatering).toBeGreaterThan(plan.allocation.catering);
    expect(impact.overBy).toBe(impact.requiredCatering - plan.allocation.catering);
    expect(scaleGuests(plan, 100).overBy).toBe(0);
    expect(scaleGuests(plan, 0).guests).toBe(1);
    expect(plan.totalBudget).toBe(800_000);
  });

  it('works for 1 guest and 5000 guests', () => {
    for (const guests of [1, 5000]) {
      const plan = makePlan({ guests });
      expect(budgetStatus(plan).overBy).toBe(0);
      expect(scaleGuests(plan, guests).overBy).toBe(0);
    }
  });

  it('handles a zero or huge budget', () => {
    const zero = createPlan({
      occasion: 'wedding',
      totalBudget: 1,
      guests: 10,
      eventDate: '2026-07-15',
      priorities: [],
    });
    expect(total(zero.allocation)).toBe(1);
    const huge = makePlan({ totalBudget: 50_000_000_000 });
    expect(total(huge.allocation)).toBe(50_000_000_000);
    expect(total(setTotalBudget(huge, 0).allocation)).toBe(0);
    expect(budgetStatus(setTotalBudget(huge, 0)).overByPct).toBe(100);
  });

  it('setTotalBudget keeps proportions and the sum invariant', () => {
    const plan = makePlan();
    const next = setTotalBudget(plan, 1_000_001);
    expect(total(next.allocation)).toBe(1_000_001);
    expect(next.totalBudget).toBe(1_000_001);
  });
});

describe('budgetStatus', () => {
  it('flags over-budget when guests increase', () => {
    const plan = { ...makePlan(), guests: 260 };
    const s = budgetStatus(plan);
    expect(s.overBy).toBeGreaterThan(0);
    expect(s.overByPct).toBeGreaterThan(0);
    expect(s.committed).toBe(0);
  });

  it('separates committed (verified) from estimated', () => {
    let plan = makePlan();
    plan = addQuote(plan, makeQuote({ totalPrice: 250_000 }), 'q1').plan;
    plan = acceptQuote(plan, 'q1');
    const s = budgetStatus(plan);
    expect(s.committed).toBe(250_000);
    expect(s.estimated).toBe(800_000 - plan.allocation.catering);
    expect(s.overBy).toBe(0);
    const over = acceptQuote(addQuote(plan, makeQuote({ totalPrice: 400_000 }), 'q2').plan, 'q2');
    expect(budgetStatus(over).overBy).toBe(400_000 - over.allocation.catering);
  });

  it('reports 100% when budget is zero but spend exists', () => {
    const plan = { ...setTotalBudget(makePlan(), 0), guests: 50 };
    expect(budgetStatus(plan).overByPct).toBe(100);
  });
});

describe('readiness', () => {
  it('counts done tasks and verified categories', () => {
    let plan = makePlan();
    expect(planReadiness(plan).percent).toBe(0);
    plan = {
      ...plan,
      tasks: plan.tasks.map((t, i) => (i === 0 ? { ...t, status: 'done' as const } : t)),
    };
    plan = acceptQuote(addQuote(plan, makeQuote({ totalPrice: 1000 }), 'q').plan, 'q');
    const r = planReadiness(plan);
    expect(r.tasksDone).toBe(1);
    expect(r.quotesVerified).toBe(1);
    expect(r.percent).toBeGreaterThan(0);
    expect(planReadiness({ ...plan, tasks: [], quotes: [] }).percent).toBe(0);
  });
});

describe('percentOf and budgetTier', () => {
  it('computes one-decimal percentages and guards zero totals', async () => {
    const { percentOf, budgetTier } = await import('../../src/engine');
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(5, 0)).toBe(0);
    expect(budgetTier({ totalBudget: 100_000, guests: 100 })).toBe('modest');
    expect(budgetTier({ totalBudget: 300_000, guests: 100 })).toBe('comfortable');
    expect(budgetTier({ totalBudget: 800_000, guests: 100 })).toBe('premium');
    expect(budgetTier({ totalBudget: 800_000, guests: 0 })).toBe('premium');
  });
});
