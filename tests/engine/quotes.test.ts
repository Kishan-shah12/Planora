import { describe, expect, it } from 'vitest';
import {
  acceptQuote,
  addQuote,
  compareQuote,
  effectiveCost,
  inquiryDraft,
  missingFields,
  removeQuote,
  unacceptCategory,
} from '../../src/engine';
import { makePlan, makeQuote } from '../helpers';

describe('effectiveCost', () => {
  it('prefers total price', () => {
    expect(effectiveCost(makeQuote({ totalPrice: 90_000, pricePerPlate: 1 }), 200)).toBe(90_000);
  });
  it('uses per-plate times max(guests, minimum)', () => {
    expect(effectiveCost(makeQuote({ pricePerPlate: 1000 }), 200)).toBe(200_000);
    expect(effectiveCost(makeQuote({ pricePerPlate: 1000, guestMinimum: 250 }), 200)).toBe(250_000);
    expect(effectiveCost(makeQuote({ pricePerPlate: 1000, guestMinimum: 100 }), 200)).toBe(200_000);
  });
  it('is null for an all-null quote', () => {
    expect(effectiveCost(makeQuote(), 200)).toBeNull();
  });
});

describe('compareQuote', () => {
  const plan = makePlan();
  it('flags the caterer quote from the demo script', () => {
    const q = makeQuote({ pricePerPlate: 1500, guestMinimum: 250 });
    const codes = compareQuote(q, plan).map((f) => f.code);
    expect(codes).toContain('guestMinimumExceedsGuests');
    expect(codes).toContain('overCategoryBudget');
    expect(codes).toContain('taxNotStated');
    expect(codes).toContain('noCancellationPolicy');
    const over = compareQuote(q, plan).find((f) => f.code === 'overCategoryBudget');
    expect(over?.amount).toBe(375_000 - plan.allocation.catering);
  });

  it('flags advance, overtime; a clean quote has no flags', () => {
    const risky = compareQuote(
      makeQuote({
        totalPrice: 1000,
        advancePercent: 70,
        overtimeFeePerHour: 5000,
        taxIncluded: true,
        cancellationPolicy: 'x',
      }),
      plan,
    ).map((f) => f.code);
    expect(risky).toEqual(['advanceHigh', 'overtimeFeeApplies']);
    const clean = compareQuote(
      makeQuote({
        totalPrice: 1000,
        advancePercent: 30,
        overtimeFeePerHour: 0,
        taxIncluded: false,
        cancellationPolicy: 'x',
        guestMinimum: 10,
      }),
      plan,
    );
    expect(clean).toEqual([]);
  });

  it('an all-null quote only flags tax and cancellation', () => {
    expect(compareQuote(makeQuote(), plan).map((f) => f.code)).toEqual([
      'taxNotStated',
      'noCancellationPolicy',
    ]);
  });
});

describe('missingFields and inquiryDraft', () => {
  const plan = makePlan();
  it('lists every missing field for an all-null quote', () => {
    expect(missingFields(makeQuote()).map((m) => m.field)).toEqual([
      'price',
      'guestMinimum',
      'taxIncluded',
      'advancePercent',
      'overtimeFeePerHour',
      'cancellationPolicy',
      'inclusions',
    ]);
  });

  it('asks only for what is missing', () => {
    const q = makeQuote({
      totalPrice: 1,
      guestMinimum: 1,
      advancePercent: 10,
      overtimeFeePerHour: 0,
      cancellationPolicy: 'x',
      inclusions: ['a'],
    });
    const draft = inquiryDraft(q, plan);
    expect(draft).toContain('Namaste Shree Caterers,');
    expect(draft).toContain('GST/tax');
    expect(draft).not.toContain('cancellation');
    expect(draft).toContain(plan.eventDate);
  });

  it('writes a confirmation when nothing is missing and handles no vendor name', () => {
    const full = makeQuote({
      vendorName: null,
      totalPrice: 1,
      guestMinimum: 1,
      taxIncluded: true,
      advancePercent: 10,
      overtimeFeePerHour: 0,
      cancellationPolicy: 'x',
      inclusions: ['a'],
    });
    const draft = inquiryDraft(full, plan);
    expect(draft.startsWith('Namaste,')).toBe(true);
    expect(draft).toContain('next steps');
  });
});

describe('quote lifecycle', () => {
  it('caps at three quotes per category, accepts one, removes and unaccepts', () => {
    let plan = makePlan();
    for (const id of ['a', 'b', 'c'])
      plan = addQuote(plan, makeQuote({ totalPrice: 100 }), id).plan;
    const fourth = addQuote(plan, makeQuote({ totalPrice: 100 }), 'd');
    expect(fourth.added).toBe(false);
    expect(fourth.plan).toBe(plan);
    expect(addQuote(plan, makeQuote({ totalPrice: 1 }, 'venue'), 'v').added).toBe(true);

    plan = acceptQuote(plan, 'a');
    plan = acceptQuote(plan, 'b');
    expect(plan.quotes.filter((q) => q.accepted).map((q) => q.id)).toEqual(['b']);
    expect(acceptQuote(plan, 'missing')).toBe(plan);
    expect(unacceptCategory(plan, 'catering').quotes.some((q) => q.accepted)).toBe(false);
    expect(removeQuote(plan, 'a').quotes).toHaveLength(2);
  });
});
