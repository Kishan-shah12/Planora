import { useState } from 'react';
import { budgetTier } from '../engine';
import type { Plan } from '../schemas';
import { suggestIdeas, type RequestOptions } from '../lib/api';
import { useAiCall } from '../lib/useAiCall';
import { AnswerMeta } from './ThinkingTrace';
import { AiError, AiLoading } from './ui';

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="font-semibold">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function IdeasPanel({ plan }: { plan: Plan }) {
  const [round, setRound] = useState(0);
  const ai = useAiCall((options: RequestOptions, request: Parameters<typeof suggestIdeas>[0]) =>
    suggestIdeas(request, options),
  );

  const generate = () => {
    setRound((r) => r + 1);
    return ai.run({
      occasion: plan.occasion,
      vibe: plan.vibe,
      guests: plan.guests,
      budgetTier: budgetTier(plan),
      nonNegotiables: plan.priorities,
      variation: round,
    });
  };

  const data = ai.state.status === 'done' ? ai.state.data : null;
  return (
    <section className="card" aria-labelledby="ideas-h">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ideas-h" className="text-lg">
            Ideas for your celebration
          </h2>
          <p className="hint">
            AI suggestions · no prices. Tuned to your occasion, style and guest count.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void generate()}
          disabled={ai.state.status === 'loading'}
        >
          {data ? 'Regenerate ideas' : 'Get ideas'}
        </button>
      </div>
      <div aria-live="polite" className="mt-4">
        {ai.state.status === 'loading' && (
          <AiLoading label="Gemini is thinking up ideas…" progress={ai.progress} />
        )}
        {ai.state.status === 'error' && (
          <AiError message={ai.state.message} onRetry={() => void generate()} />
        )}
        {data && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Themes</h3>
              <ul className="mt-2 grid gap-3 md:grid-cols-2">
                {data.themes.map((t) => (
                  <li key={t.title} className="rounded-xl border border-line p-3">
                    <p className="font-semibold">{t.title}</p>
                    <p className="text-sm">{t.description}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <List title="Activities" items={data.activities} />
              <List title="Food style" items={data.foodStyle} />
              <List title="Personal touches" items={data.personalTouches} />
            </div>
            <AnswerMeta progress={ai.progress} />
            <figure className="rounded-xl border border-line bg-paper p-4">
              <figcaption className="text-sm font-semibold">Invitation line</figcaption>
              <blockquote className="mt-1 font-display text-lg italic">
                {data.invitationLine}
              </blockquote>
            </figure>
          </div>
        )}
      </div>
    </section>
  );
}
