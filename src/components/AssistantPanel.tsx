import { useMemo, useState } from 'react';
import {
  diffDays,
  planInsights,
  type Insight,
  type InsightSeverity,
  type InsightTab,
} from '../engine';
import type { Plan } from '../schemas';
import { reviewPlan, type RequestOptions } from '../lib/api';
import { useAiCall } from '../lib/useAiCall';
import { AskPlanner } from './AskPlanner';
import { Icon, type IconName } from './Icon';
import { AnswerMeta } from './ThinkingTrace';
import { AiError, AiLoading } from './ui';

const SEVERITY: Record<InsightSeverity, { label: string; icon: IconName; tone: string }> = {
  critical: { label: 'Urgent', icon: 'alert', tone: 'text-warn' },
  warning: { label: 'Needs attention', icon: 'clock', tone: 'text-warn' },
  suggestion: { label: 'Suggestion', icon: 'sparkle', tone: 'text-accent' },
};

const TAB_LABEL: Record<InsightTab, string> = {
  budget: 'Budget',
  timeline: 'Timeline',
  vendors: 'Vendors',
};

const COLLAPSED = 3;

function InsightRow({
  insight,
  onNavigate,
}: {
  insight: Insight;
  onNavigate: (tab: InsightTab) => void;
}) {
  const s = SEVERITY[insight.severity];
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon name={s.icon} className={`mt-0.5 h-5 w-5 ${s.tone}`} />
        <div className="min-w-0">
          <p className="font-semibold">
            <span className={`mr-2 text-xs font-semibold uppercase tracking-wide ${s.tone}`}>
              {s.label}
            </span>
            {insight.title}
          </p>
          <p className="text-sm text-ink-soft">{insight.detail}</p>
        </div>
      </div>
      <button type="button" className="btn-quiet shrink-0" onClick={() => onNavigate(insight.tab)}>
        Open {TAB_LABEL[insight.tab]}
      </button>
    </li>
  );
}

/**
 * The planning assistant. The engine decides what needs attention (deterministic, instant, works
 * offline); Gemini can then turn those facts into a short, prioritised review on request.
 */
export function AssistantPanel({
  plan,
  today,
  onNavigate,
}: {
  plan: Plan;
  today: string;
  onNavigate: (tab: InsightTab) => void;
}) {
  const insights = useMemo(() => planInsights(plan, today), [plan, today]);
  const [expanded, setExpanded] = useState(false);
  const ai = useAiCall((options: RequestOptions, request: Parameters<typeof reviewPlan>[0]) =>
    reviewPlan(request, options),
  );
  const shown = expanded ? insights : insights.slice(0, COLLAPSED);
  const urgent = insights.filter((i) => i.severity !== 'suggestion').length;

  const askAi = () =>
    ai.run({
      occasion: plan.occasion,
      guests: plan.guests,
      totalBudget: plan.totalBudget,
      daysToEvent: diffDays(today, plan.eventDate),
      vibe: plan.vibe,
      insights: insights
        .slice(0, 10)
        .map(({ severity, title, detail }) => ({ severity, title, detail })),
    });

  return (
    <section className="card mb-6" aria-labelledby="assistant-h">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="assistant-h" className="flex items-center gap-2">
            <Icon name="sparkle" className="h-5 w-5 text-accent" />
            Your planning assistant
          </h2>
          <p className="hint" aria-live="polite">
            {urgent > 0
              ? `${urgent} ${urgent === 1 ? 'thing needs' : 'things need'} your attention.`
              : 'Nothing urgent. Here is what to do next.'}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void askAi()}
          disabled={insights.length === 0 || ai.state.status === 'loading'}
        >
          <Icon name="sparkle" />
          {ai.state.status === 'done' ? 'Refresh AI review' : 'Ask AI for a plan review'}
        </button>
      </div>

      {insights.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-ok">
          <Icon name="check" />
          Everything is on track.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line" aria-label="What needs attention">
          {shown.map((insight) => (
            <InsightRow key={insight.id} insight={insight} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
      {insights.length > COLLAPSED && (
        <button
          type="button"
          className="btn-quiet mt-1"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : `Show all ${insights.length}`}
        </button>
      )}

      <div aria-live="polite" className="mt-3">
        {ai.state.status === 'loading' && (
          <>
            <AiLoading label="Gemini is reviewing your plan…" progress={ai.progress} />
          </>
        )}
        {ai.state.status === 'error' && (
          <AiError message={ai.state.message} onRetry={() => void askAi()} />
        )}
        {ai.state.status === 'done' && (
          <div className="rounded-xl bg-accent-soft p-4" data-testid="ai-review">
            <p className="text-sm">{ai.state.data.summary}</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
              {ai.state.data.steps.map((step) => (
                <li key={step.title}>
                  <span className="font-semibold">{step.title}.</span> {step.why}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-ink-soft">
              AI review of the facts above. It never adds prices, dates or vendors.
            </p>
            <AnswerMeta progress={ai.progress} />
          </div>
        )}
      </div>
      <AskPlanner plan={plan} today={today} />
    </section>
  );
}
