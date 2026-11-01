import { describe, expect, it } from 'vitest';
import { acceptQuote, addQuote, toggleContacted, vendorChecklist } from '../../src/engine';
import { OCCASIONS } from '../../src/schemas';
import { makePlan, makeQuote } from '../helpers';

const statusOf = (plan: ReturnType<typeof makePlan>, category: string) =>
  vendorChecklist(plan).find((i) => i.category === category)?.status;

describe('vendorChecklist', () => {
  it('lists the six bookable categories with occasion hints for every occasion', () => {
    for (const o of OCCASIONS) {
      const items = vendorChecklist(makePlan({}, o));
      expect(items).toHaveLength(6);
      expect(items.every((i) => i.hint.length > 0 && i.status === 'not_started')).toBe(true);
    }
  });

  it('derives status: contacted, quote received, accepted', () => {
    let plan = makePlan();
    expect(statusOf(plan, 'catering')).toBe('not_started');
    plan = toggleContacted(plan, 'catering');
    expect(statusOf(plan, 'catering')).toBe('contacted');
    plan = addQuote(plan, makeQuote({ totalPrice: 1000 }), 'q1').plan;
    expect(statusOf(plan, 'catering')).toBe('quote_received');
    expect(vendorChecklist(plan).find((i) => i.category === 'catering')?.quotes).toBe(1);
    plan = acceptQuote(plan, 'q1');
    expect(statusOf(plan, 'catering')).toBe('quote_accepted');
    expect(statusOf(plan, 'venue')).toBe('not_started');
  });

  it('toggleContacted is reversible', () => {
    const plan = makePlan();
    expect(toggleContacted(toggleContacted(plan, 'decor'), 'decor').contacted).toEqual([]);
  });
});
