import { createPlan } from '../src/engine';
import type { Category, Intake, Occasion, Plan, Quote } from '../src/schemas';

export const TODAY = '2026-01-01';
export const EVENT = '2026-07-15';

export function makeIntake(over: Partial<Intake> = {}): Intake {
  return {
    occasion: 'wedding',
    totalBudget: 800_000,
    guests: 200,
    eventDate: EVENT,
    vibe: 'simple ceremony, premium food',
    priorities: ['catering'],
    ...over,
  };
}

export function makePlan(over: Partial<Intake> = {}, occasion: Occasion = 'wedding'): Plan {
  return createPlan(makeIntake({ occasion, ...over }));
}

export function makeQuote(over: Partial<Quote> = {}, category: Category = 'catering'): Quote {
  return {
    vendorName: 'Shree Caterers',
    category,
    totalPrice: null,
    pricePerPlate: null,
    guestMinimum: null,
    overtimeFeePerHour: null,
    taxIncluded: null,
    advancePercent: null,
    inclusions: [],
    exclusions: [],
    cancellationPolicy: null,
    ...over,
  };
}
