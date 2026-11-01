import { memo } from 'react';
import {
  buildSchedule,
  budgetStatus,
  categoryLabel,
  categoryNeeds,
  effectiveCost,
  formatINR,
  OCCASION_LABELS,
  planReadiness,
  percentOf,
  RUN_SHEETS,
} from '../engine';
import { CATEGORIES, type Plan } from '../schemas';
import { formatDate } from '../lib/format';

/**
 * Printable one-page summary. Hidden on screen, shown by print CSS. Memoised so it only
 * recomputes when the plan changes, not on every unrelated render of the app.
 */
export const PrintSummary = memo(function PrintSummary({
  plan,
  today,
}: {
  plan: Plan;
  today: string;
}) {
  const status = budgetStatus(plan);
  const needs = categoryNeeds(plan);
  const readiness = planReadiness(plan);
  let schedule: ReturnType<typeof buildSchedule> = [];
  try {
    schedule = buildSchedule(plan.tasks, plan.eventDate, today);
  } catch {
    schedule = [];
  }
  const accepted = plan.quotes.filter((q) => q.accepted);

  return (
    <article className="print-only print-sheet p-6" aria-label="Plan summary for printing">
      <div className="border-b-2 border-ink pb-3">
        <p className="text-sm uppercase tracking-widest">Aayojan · Celebration plan</p>
        <h1>{OCCASION_LABELS[plan.occasion]}</h1>
        <p>
          {formatDate(plan.eventDate)} · {plan.guests} guests · Total budget{' '}
          {formatINR(plan.totalBudget)}
          {plan.vibe ? ` · ${plan.vibe}` : ''}
        </p>
        <p>
          Plan readiness {readiness.percent}% · {readiness.tasksDone}/{readiness.tasksTotal} tasks
          done · {readiness.quotesVerified}/{readiness.quotesTotal} categories with verified
          quotations
        </p>
      </div>

      <h2 className="mt-5 text-lg">Budget</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Amount</th>
            <th scope="col">Share</th>
            <th scope="col">Basis</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((c) => (
            <tr key={c}>
              <th scope="row">{categoryLabel(plan.occasion, c)}</th>
              <td>{formatINR(plan.allocation[c])}</td>
              <td>{percentOf(plan.allocation[c], plan.totalBudget)}%</td>
              <td>
                {needs.find((n) => n.category === c)?.verified ? 'Verified quotation' : 'Estimate'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2">
        Committed {formatINR(status.committed)} · Estimated {formatINR(status.estimated)}
        {status.overBy > 0 ? ` · Over budget by ${formatINR(status.overBy)}` : ' · Within budget'}
      </p>

      {accepted.length > 0 && (
        <>
          <h2 className="mt-5 text-lg">Accepted vendor quotations</h2>
          <ul className="list-disc pl-5">
            {accepted.map((q) => (
              <li key={q.id}>
                {categoryLabel(plan.occasion, q.category)}: {q.quote.vendorName ?? 'Vendor'} ·{' '}
                {formatINR(effectiveCost(q.quote, plan.guests) ?? 0)}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-5 text-lg">Timeline</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Due</th>
            <th scope="col">Owner</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((t) => (
            <tr key={t.id}>
              <th scope="row">{t.title}</th>
              <td>{formatDate(t.effectiveDate)}</td>
              <td>{t.assignee?.trim() ? t.assignee : '-'}</td>
              <td>
                {t.status === 'done'
                  ? 'Done'
                  : t.status === 'delayed'
                    ? `Delayed ${t.delayDays} days`
                    : 'To do'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-5 text-lg">On the day (suggested)</h2>
      <ul className="list-none pl-0">
        {RUN_SHEETS[plan.occasion].map((item) => (
          <li key={item.time}>
            <strong>{item.time}</strong> {item.title}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm">
        Amounts are estimates unless marked as a verified quotation. Planned with Aayojan.
      </p>
    </article>
  );
});
