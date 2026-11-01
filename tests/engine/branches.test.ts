import { describe, expect, it } from 'vitest';
import {
  acceptQuote,
  addQuote,
  apportion,
  applyOption,
  budgetStatus,
  generateOverBudgetOptions,
  localAnswer,
  planInsights,
  unacceptCategory,
} from '../../src/engine';
import type { Plan, Task } from '../../src/schemas';
import { makePlan, makeQuote, TODAY } from '../helpers';

const withTasks = (plan: Plan, tasks: Task[]): Plan => ({ ...plan, tasks });
const task = (id: string, lead: number, over: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  category: 'misc',
  leadDays: lead,
  durationDays: 1,
  dependsOn: [],
  status: 'todo',
  ...over,
});

describe('insight wording for a single task', () => {
  it('uses the singular for one overdue task', () => {
    const plan = withTasks(makePlan({ eventDate: '2025-12-25' }), [task('a', 10)]);
    expect(planInsights(plan, TODAY).find((i) => i.id === 'overdue')?.title).toBe(
      '1 task is overdue',
    );
  });

  it('uses the singular for one impossible task and one at-risk task', () => {
    const base = makePlan();
    const impossible = withTasks(base, [task('a', 2, { status: 'delayed', delayDays: 30 })]);
    expect(planInsights(impossible, TODAY).find((i) => i.id === 'impossible')?.title).toBe(
      '1 task cannot finish before the event',
    );
    const atRisk = withTasks(base, [task('a', 60, { status: 'delayed', delayDays: 5 })]);
    expect(planInsights(atRisk, TODAY).find((i) => i.id === 'at-risk')?.title).toBe(
      '1 task is at risk from a delay',
    );
  });
});

describe('quotes and trade-offs edge cases', () => {
  it('unaccepting one category leaves other categories alone', () => {
    let plan = makePlan();
    plan = acceptQuote(addQuote(plan, makeQuote({ totalPrice: 1 }), 'c').plan, 'c');
    plan = acceptQuote(addQuote(plan, makeQuote({ totalPrice: 1 }, 'venue'), 'v').plan, 'v');
    const after = unacceptCategory(plan, 'catering');
    expect(after.quotes.find((q) => q.id === 'v')?.accepted).toBe(true);
    expect(after.quotes.find((q) => q.id === 'c')?.accepted).toBe(false);
  });

  it('offers no guest option when the per-plate cost is zero', () => {
    let plan: Plan = { ...makePlan(), perPlate: 0 };
    plan = addQuote(
      plan,
      makeQuote({ totalPrice: plan.allocation.venue + 5000 }, 'venue'),
      'v',
    ).plan;
    plan = acceptQuote(plan, 'v');
    const ids = generateOverBudgetOptions(plan).map((o) => o.id);
    expect(ids).not.toContain('reduce_guests');
    expect(ids).toContain('trim_flexible');
  });

  it('a one-rupee gap only trims one category and still balances', () => {
    let plan = makePlan();
    plan = addQuote(plan, makeQuote({ totalPrice: plan.allocation.venue + 1 }, 'venue'), 'v').plan;
    plan = acceptQuote(plan, 'v');
    const trim = generateOverBudgetOptions(plan).find((o) => o.id === 'trim_flexible');
    expect(trim?.changes.filter((c) => c.delta < 0)).toHaveLength(1);
    if (trim) expect(budgetStatus(applyOption(plan, trim)).overBy).toBe(0);
  });
});

describe('apportion', () => {
  it('keeps item identity and sums exactly', () => {
    const parts = apportion(['a', 'b', 'c'], () => 1, 10);
    expect(parts.map((p) => p.item)).toEqual(['a', 'b', 'c']);
    expect(parts.map((p) => p.share)).toEqual([4, 3, 3]);
    expect(apportion([], () => 1, 10)).toEqual([]);
  });
});

describe('built-in answers', () => {
  it('overview has no "most important" line when nothing needs attention', () => {
    let plan = makePlan();
    for (const c of [
      'venue',
      'catering',
      'decor',
      'photography',
      'entertainment',
      'misc',
    ] as const) {
      const quote = makeQuote(
        { totalPrice: 1, taxIncluded: true, cancellationPolicy: 'ok', advancePercent: 10 },
        c,
      );
      plan = acceptQuote(addQuote(plan, quote, c).plan, c);
    }
    plan = { ...plan, tasks: plan.tasks.map((t) => ({ ...t, status: 'done' as const })) };
    const answer = localAnswer('hello there', plan, TODAY);
    expect(answer).toMatch(/6 vendors confirmed\.$/);
    expect(answer).not.toMatch(/Most important/);
  });

  it('overview mentions a passed date', () => {
    expect(localAnswer('hello there', makePlan({ eventDate: '2025-06-01' }), TODAY)).toMatch(
      /date passed/,
    );
  });
});
