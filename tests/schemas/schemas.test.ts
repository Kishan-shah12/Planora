import { describe, expect, it } from 'vitest';
import {
  ExtractedQuoteSchema,
  IdeasSchema,
  IntakeParseSchema,
  IntakeSchema,
  PlanSchema,
  QuoteSchema,
} from '../../src/schemas';
import { makeIntake, makePlan, makeQuote } from '../helpers';

describe('PlanSchema', () => {
  it('accepts a freshly created plan, round-tripped through JSON', () => {
    const plan = makePlan();
    expect(PlanSchema.safeParse(JSON.parse(JSON.stringify(plan))).success).toBe(true);
  });

  it('rejects malicious or malformed share-link payloads', () => {
    const plan = makePlan();
    const bad: unknown[] = [
      null,
      'string',
      {},
      { ...plan, version: 2 },
      { ...plan, guests: -1 },
      { ...plan, guests: 1e12 },
      { ...plan, totalBudget: 1.5 },
      { ...plan, eventDate: '<script>alert(1)</script>' },
      { ...plan, occasion: 'rave' },
      { ...plan, allocation: { ...plan.allocation, venue: -5 } },
      { ...plan, tasks: Array.from({ length: 500 }, () => plan.tasks[0]) },
      { ...plan, vibe: 'x'.repeat(5000) },
      { ...plan, tasks: [{ ...plan.tasks[0], title: 'x'.repeat(1000) }] },
      {
        ...plan,
        quotes: [{ id: 'q', category: 'catering', accepted: true, quote: { totalPrice: 'free' } }],
      },
    ];
    for (const b of bad) expect(PlanSchema.safeParse(b).success).toBe(false);
  });

  it('strips unknown keys such as __proto__ pollution attempts', () => {
    const parsed = PlanSchema.parse(
      JSON.parse(JSON.stringify({ ...makePlan(), extra: 1, ['__proto__']: { x: 1 } })),
    );
    expect('extra' in parsed).toBe(false);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('IntakeSchema', () => {
  it('requires the six essentials and caps values', () => {
    expect(IntakeSchema.safeParse(makeIntake()).success).toBe(true);
    expect(IntakeSchema.safeParse(makeIntake({ totalBudget: 0 })).success).toBe(false);
    expect(IntakeSchema.safeParse(makeIntake({ guests: 0 })).success).toBe(false);
    expect(IntakeSchema.safeParse({ ...makeIntake(), eventDate: 'tomorrow' }).success).toBe(false);
    expect(IntakeSchema.safeParse({ ...makeIntake(), priorities: ['contingency'] }).success).toBe(
      false,
    );
  });
});

describe('QuoteSchema and AI outputs', () => {
  it('accepts an all-null quote', () => {
    expect(QuoteSchema.safeParse(makeQuote()).success).toBe(true);
  });
  it('rejects negative prices and bad advance percent', () => {
    expect(QuoteSchema.safeParse(makeQuote({ totalPrice: -1 })).success).toBe(false);
    expect(QuoteSchema.safeParse(makeQuote({ advancePercent: 150 })).success).toBe(false);
  });
  it('extracted quote has no category', () => {
    const rest: Record<string, unknown> = { ...makeQuote() };
    delete rest.category;
    expect(ExtractedQuoteSchema.safeParse(rest).success).toBe(true);
  });
  it('IntakeParse allows nulls but not bad enums', () => {
    expect(
      IntakeParseSchema.safeParse({
        occasion: null,
        totalBudget: null,
        guests: null,
        eventDate: null,
        vibe: null,
        nonNegotiables: [],
        city: null,
      }).success,
    ).toBe(true);
    expect(
      IntakeParseSchema.safeParse({
        occasion: 'party',
        totalBudget: null,
        guests: null,
        eventDate: null,
        vibe: null,
        nonNegotiables: [],
        city: null,
      }).success,
    ).toBe(false);
  });
  it('Ideas requires at least one theme', () => {
    expect(
      IdeasSchema.safeParse({
        themes: [],
        activities: ['a'],
        foodStyle: ['b'],
        personalTouches: [],
      }).success,
    ).toBe(false);
  });
});
