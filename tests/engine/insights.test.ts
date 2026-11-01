import { describe, expect, it } from 'vitest';
import {
  acceptQuote,
  addQuote,
  formatDayMonth,
  planInsights,
  setTotalBudget,
  redistribute,
} from '../../src/engine';
import { makePlan, makeQuote, TODAY } from '../helpers';

const ids = (plan: ReturnType<typeof makePlan>, today = TODAY) =>
  planInsights(plan, today).map((i) => i.id);

describe('planInsights (the assistant’s reasoning)', () => {
  it('a fresh plan far from the event only has suggestions: quotes and the next task', () => {
    const insights = planInsights(makePlan(), TODAY);
    expect(insights.every((i) => i.severity === 'suggestion')).toBe(true);
    expect(insights.map((i) => i.id)).toEqual(['vendors', 'next-task']);
    expect(insights[1]?.detail).toMatch(/Nobody is assigned yet/);
  });

  it('puts the over-budget gap first, as critical, pointing at the Budget tab', () => {
    const insights = planInsights({ ...makePlan(), guests: 260 }, TODAY);
    expect(insights[0]).toMatchObject({ id: 'over-budget', severity: 'critical', tab: 'budget' });
    expect(insights[0]?.title).toMatch(/Over budget by ₹/);
  });

  it('flags overdue tasks for a past event and impossible ones after a long delay', () => {
    expect(ids(makePlan({ eventDate: '2025-12-20' }))).toContain('overdue');
    expect(ids(makePlan({ eventDate: '2026-01-20' }))).not.toContain('overdue');
    const delayed = makePlan({ eventDate: '2026-03-01' });
    const plan = {
      ...delayed,
      tasks: delayed.tasks.map((t) =>
        t.id === 'run-sheet' ? { ...t, status: 'delayed' as const, delayDays: 30 } : t,
      ),
    };
    const insights = planInsights(plan, TODAY);
    expect(insights.find((i) => i.id === 'impossible')?.severity).toBe('critical');
  });

  it('reports tasks at risk from a delay', () => {
    const base = makePlan();
    const plan = {
      ...base,
      tasks: base.tasks.map((t) =>
        t.id === 'venue' ? { ...t, status: 'delayed' as const, delayDays: 40 } : t,
      ),
    };
    expect(ids(plan)).toContain('at-risk');
  });

  it('warns about unconfirmed vendors close to the event and summarises names', () => {
    const insight = planInsights(makePlan({ eventDate: '2026-02-15' }), TODAY).find(
      (i) => i.id === 'vendors',
    );
    expect(insight?.severity).toBe('warning');
    expect(insight?.title).toMatch(/45 days to go/);
    expect(insight?.detail).toMatch(/Venue, Catering/);
  });

  it('checks the fine print of accepted quotations', () => {
    let plan = makePlan();
    plan = addQuote(plan, makeQuote({ pricePerPlate: 100, guestMinimum: 500 }), 'q').plan;
    plan = acceptQuote(plan, 'q');
    const insight = planInsights(plan, TODAY).find((i) => i.id === 'quote-q');
    expect(insight?.tab).toBe('vendors');
    expect(insight?.detail).toMatch(/minimum is 500/);
  });

  it('suggests a bigger buffer when contingency is thin', () => {
    const base = makePlan();
    const thin = {
      ...base,
      allocation: redistribute(base.allocation, 'contingency', 1000, []).allocation,
    };
    expect(ids(thin)).toContain('thin-buffer');
    expect(ids(setTotalBudget(base, 0))).not.toContain('thin-buffer');
  });

  it('names the assignee of the next task and handles a broken schedule', () => {
    const base = makePlan();
    const plan = {
      ...base,
      tasks: base.tasks.map((t) => (t.id === 'venue' ? { ...t, assignee: 'Mama ji' } : t)),
    };
    expect(planInsights(plan, TODAY).find((i) => i.id === 'next-task')?.detail).toMatch(
      /handled by Mama ji/,
    );
    const looped = {
      ...base,
      tasks: base.tasks.map((t) => (t.id === 'venue' ? { ...t, dependsOn: ['balances'] } : t)),
    };
    expect(ids(looped)).not.toContain('next-task');
  });

  it('with every task done and every vendor confirmed there is nothing left', () => {
    let plan = makePlan();
    for (const c of [
      'venue',
      'catering',
      'decor',
      'photography',
      'entertainment',
      'misc',
    ] as const) {
      plan = acceptQuote(
        addQuote(
          plan,
          makeQuote(
            { totalPrice: 1, taxIncluded: true, cancellationPolicy: 'ok', advancePercent: 10 },
            c,
          ),
          c,
        ).plan,
        c,
      );
    }
    plan = { ...plan, tasks: plan.tasks.map((t) => ({ ...t, status: 'done' as const })) };
    expect(planInsights(plan, TODAY)).toEqual([]);
  });

  it('formats dates for messages', () => {
    expect(formatDayMonth('2027-02-15')).toMatch(/15 Feb 2027/);
  });
});
