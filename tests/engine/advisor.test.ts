import { describe, expect, it } from 'vitest';
import {
  acceptQuote,
  addQuote,
  localAnswer,
  planFacts,
  topicOf,
  vendorChecklist,
} from '../../src/engine';
import type { Plan } from '../../src/schemas';
import { makePlan, makeQuote, TODAY } from '../helpers';

function allVendorsConfirmed(plan: Plan): Plan {
  let next = plan;
  for (const item of vendorChecklist(plan)) {
    const quote = makeQuote(
      { totalPrice: 1, taxIncluded: true, cancellationPolicy: 'ok', advancePercent: 10 },
      item.category,
    );
    next = acceptQuote(addQuote(next, quote, item.category).plan, item.category);
  }
  return next;
}

describe('planFacts', () => {
  it('summarises the plan with exact engine numbers for the AI', () => {
    const plan = { ...makePlan(), guests: 260 };
    const facts = planFacts(plan, TODAY);
    expect(facts).toMatchObject({ occasion: 'wedding', guests: 260, totalBudget: 800_000 });
    expect(facts.daysToEvent).toBe(195);
    expect(facts.budget).toHaveLength(7);
    expect(facts.budget.find((b) => b.category === 'Catering')?.shortfall).toBeGreaterThan(0);
    expect(facts.insights[0]?.severity).toBe('critical');
  });
});

describe('topicOf', () => {
  it.each([
    ['Are we over budget?', 'budget'],
    ['kitna kharcha bacha hai', 'budget'],
    ['Which vendors are pending?', 'vendors'],
    ['What should I do next?', 'next'],
    ['shaadi mein kitne din bache', 'time'],
    ['How many guests per plate?', 'guests'],
    ['hello', 'overview'],
  ])('%s -> %s', (question, topic) => {
    expect(topicOf(question)).toBe(topic);
  });
});

describe('localAnswer (built-in planner when AI is unavailable)', () => {
  const plan = makePlan();

  it('answers budget questions from budgetStatus', () => {
    expect(localAnswer('budget?', plan, TODAY)).toMatch(/within your ₹8,00,000 budget/);
    expect(localAnswer('budget?', { ...plan, guests: 260 }, TODAY)).toMatch(/over budget by ₹/);
  });

  it('answers vendor questions from the checklist', () => {
    expect(localAnswer('vendors?', plan, TODAY)).toMatch(/0 of 6 vendors are confirmed/);
    expect(localAnswer('vendors?', allVendorsConfirmed(plan), TODAY)).toMatch(
      /Every vendor category/,
    );
  });

  it('answers what to do next, timing, guests and an overview', () => {
    expect(localAnswer('what next?', plan, TODAY)).toMatch(/quotations|Next up/);
    expect(localAnswer('kab hai?', plan, TODAY)).toMatch(
      /195 days to go, with 14 tasks still open/,
    );
    expect(localAnswer('kab hai?', makePlan({ eventDate: TODAY }), TODAY)).toMatch(/today/);
    expect(localAnswer('how many guests', plan, TODAY)).toMatch(/200 guests/);
    expect(localAnswer('hi', plan, TODAY)).toMatch(
      /Wedding for 200 guests, 195 days away, within budget/,
    );
    expect(localAnswer('hi', { ...plan, guests: 260 }, TODAY)).toMatch(/over budget by/);
  });

  it('handles a finished plan, a broken schedule and a past date', () => {
    const finished = allVendorsConfirmed({
      ...plan,
      tasks: plan.tasks.map((t) => ({ ...t, status: 'done' as const })),
    });
    expect(localAnswer('next?', finished, TODAY)).toMatch(/Everything is on track/);
    const looped = {
      ...plan,
      tasks: plan.tasks.map((t) => (t.id === 'venue' ? { ...t, dependsOn: ['balances'] } : t)),
    };
    expect(localAnswer('date?', looped, TODAY)).toMatch(/14 tasks still open/);
    expect(localAnswer('date?', makePlan({ eventDate: '2025-06-01' }), TODAY)).toMatch(/passed/);
    expect(localAnswer('hi', makePlan({ eventDate: '2025-06-01' }), TODAY)).toMatch(/date passed/);
  });

  it('counts confirmed vendors in the overview', () => {
    const withQuote = acceptQuote(addQuote(plan, makeQuote({ totalPrice: 1000 }), 'q').plan, 'q');
    expect(localAnswer('hi', withQuote, TODAY)).toMatch(/1 vendors confirmed/);
  });
});
