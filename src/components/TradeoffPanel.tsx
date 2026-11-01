import { useState } from 'react';
import { formatINR, type TradeoffOption } from '../engine';
import type { Plan } from '../schemas';
import { explainTradeoffs, type RequestOptions } from '../lib/api';
import { describeChanges } from '../lib/format';
import { useAiCall } from '../lib/useAiCall';
import { Icon } from './Icon';
import { AnswerMeta } from './ThinkingTrace';
import { AiError, AiLoading, Confirm } from './ui';

export function TradeoffPanel({
  plan,
  options,
  overBy,
  onApply,
}: {
  plan: Plan;
  options: TradeoffOption[];
  overBy: number;
  onApply: (option: TradeoffOption) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const ai = useAiCall((options: RequestOptions, request: Parameters<typeof explainTradeoffs>[0]) =>
    explainTradeoffs(request, options),
  );

  const explain = () =>
    ai.run({
      occasion: plan.occasion,
      guests: plan.guests,
      totalBudget: plan.totalBudget,
      overBy,
      priorities: plan.priorities,
      options: options.map((o) => ({
        id: o.id,
        title: o.title,
        coversRupees: o.coversRupees,
        summary: o.description,
        warning: o.warning,
      })),
    });

  if (options.length === 0) {
    return (
      <section className="card" aria-labelledby="options-h">
        <h2 id="options-h" className="text-lg">
          Ways to close the gap
        </h2>
        <p className="mt-2 text-sm">
          No automatic option fits {formatINR(overBy)}. Try fewer guests, a bigger total budget, or
          unlock categories so money can move.
        </p>
      </section>
    );
  }

  const explanations = ai.state.status === 'done' ? ai.state.data.explanations : [];
  return (
    <section className="card" aria-labelledby="options-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="options-h" className="text-lg">
            Ways to close the gap
          </h2>
          <p className="hint">Nothing changes until you apply an option.</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void explain()}
          disabled={ai.state.status === 'loading'}
        >
          Explain these options
        </button>
      </div>

      <div aria-live="polite" className="mt-3">
        {ai.state.status === 'loading' && (
          <AiLoading label="Gemini is explaining the options…" progress={ai.progress} />
        )}
        {ai.state.status === 'error' && (
          <AiError message={ai.state.message} onRetry={() => void explain()} />
        )}
        {ai.state.status === 'done' && <AnswerMeta progress={ai.progress} />}
      </div>

      <ul className="mt-4 grid gap-4 md:grid-cols-3">
        {options.map((o) => {
          const explanation = explanations.find((e) => e.optionId === o.id);
          return (
            <li key={o.id} className="flex flex-col rounded-xl border border-line p-4">
              <h3 className="text-base">{o.title}</h3>
              <p className="mt-1 text-sm">{o.description}</p>
              {o.changes.length > 0 && (
                <p className="mt-2 text-sm font-medium">
                  {describeChanges(plan.occasion, o.changes)}
                </p>
              )}
              {o.warning && (
                <p className="mt-2 text-sm font-medium text-warn">
                  <Icon name="alert" className="mr-1 inline h-4 w-4" />
                  {o.warning}
                </p>
              )}
              {explanation && (
                <div className="mt-3 rounded-lg bg-accent-soft p-3 text-sm">
                  <p>{explanation.summary}</p>
                  <p className="mt-1 font-medium">Best when: {explanation.bestWhen}</p>
                  <p className="mt-1 text-xs text-ink-soft">AI explanation of the figures above</p>
                </div>
              )}
              <div className="mt-auto pt-4">
                {confirming === o.id ? (
                  <Confirm
                    prompt={`Apply "${o.title}"? You can still adjust everything afterwards.`}
                    confirmLabel="Yes, apply"
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => {
                      onApply(o);
                      setConfirming(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="btn-primary w-full"
                    onClick={() => setConfirming(o.id)}
                  >
                    Apply
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
