import { useState } from 'react';
import { planReadiness } from '../engine';
import type { Plan } from '../schemas';
import { shareHash } from '../state/share';
import { BrandMark, Icon } from './Icon';
import { useTheme } from '../lib/theme';
import { Confirm } from './ui';

export function Header({ plan, onReset }: { plan: Plan | null; onReset: () => void }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [share, setShare] = useState<{ status: 'copied' | 'manual'; url: string } | null>(null);
  const readiness = plan ? planReadiness(plan) : null;
  const { theme, toggle } = useTheme();

  async function copyLink(current: Plan) {
    const url = `${window.location.origin}${window.location.pathname}${shareHash(current)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShare({ status: 'copied', url });
    } catch {
      setShare({ status: 'manual', url });
    }
  }

  return (
    <header className="no-print border-b border-line bg-card/80">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="font-display text-xl leading-tight tracking-tight">Aayojan</h1>
            <p className="hidden text-xs text-ink-soft sm:block">One plan, everything connected.</p>
          </div>
        </div>

        {readiness && (
          <div className="order-last w-full sm:order-none sm:w-64" aria-label="Plan readiness">
            <p className="flex items-baseline justify-between text-sm font-medium">
              <span>Plan readiness {readiness.percent}%</span>
              <span className="text-xs font-normal text-ink-soft">
                {readiness.tasksDone}/{readiness.tasksTotal} tasks · {readiness.quotesVerified}/
                {readiness.quotesTotal} vendors
              </span>
            </p>
            <progress
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full accent-accent"
              max={100}
              value={readiness.percent}
              aria-label="Plan readiness percent"
            />
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          {plan && (
            <>
              <button type="button" className="btn-secondary" onClick={() => void copyLink(plan)}>
                <Icon name="link" />
                <span className="sr-only sm:not-sr-only">Share link</span>
              </button>
              <button type="button" className="btn-secondary" onClick={() => window.print()}>
                <Icon name="printer" />
                <span className="sr-only sm:not-sr-only">Print summary</span>
              </button>
              <button type="button" className="btn-secondary" onClick={() => setConfirmReset(true)}>
                <Icon name="reset" />
                <span className="sr-only sm:not-sr-only">Reset</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4" aria-live="polite">
        {share?.status === 'copied' && (
          <p className="flex items-center gap-2 pb-3 text-sm font-medium text-ok">
            <Icon name="check" />
            Link copied. Anyone with it can open this plan.
          </p>
        )}
        {share?.status === 'manual' && (
          <div className="pb-3">
            <label htmlFor="share-url" className="label">
              Copy this link
            </label>
            <input
              id="share-url"
              readOnly
              className="input"
              value={share.url}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        )}
        {confirmReset && (
          <div className="pb-3">
            <Confirm
              prompt="Reset the whole plan? Your budget, timeline and quotations will be cleared from this browser."
              confirmLabel="Yes, reset"
              onCancel={() => setConfirmReset(false)}
              onConfirm={() => {
                setConfirmReset(false);
                setShare(null);
                onReset();
              }}
            />
          </div>
        )}
      </div>
    </header>
  );
}
