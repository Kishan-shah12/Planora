import { useState } from 'react';
import {
  categoryLabel,
  compareQuote,
  effectiveCost,
  formatINR,
  inquiryDraft,
  missingFields,
} from '../engine';
import { MAX_QUOTES_PER_CATEGORY, type Plan, type Quote } from '../schemas';
import { Icon } from './Icon';
import { QuoteFacts } from './QuoteFacts';

/** One analysed quote: facts, engine flags, cost against budget, inquiry draft and actions. */
export function QuoteResult({
  quote,
  plan,
  full,
  onSave,
}: {
  quote: Quote;
  plan: Plan;
  full: boolean;
  onSave: (accept: boolean) => void;
}) {
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const flags = compareQuote(quote, plan);
  const missing = missingFields(quote);
  const cost = effectiveCost(quote, plan.guests);
  const draft = inquiryDraft(quote, plan);

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  }

  return (
    <div className="mt-4 space-y-4" data-testid="quote-result">
      <h3 className="text-base">What we found (AI extraction, please verify)</h3>
      <QuoteFacts quote={quote} guests={plan.guests} />

      {cost !== null && (
        <p className="text-sm">
          Effective cost <strong>{formatINR(cost)}</strong> against a{' '}
          {categoryLabel(plan.occasion, quote.category)} budget of{' '}
          <strong>{formatINR(plan.allocation[quote.category])}</strong>.
        </p>
      )}

      <div role="status" aria-live="polite">
        <h4 className="font-semibold">Things to check</h4>
        {flags.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-ok">
            <Icon name="check" />
            Nothing worrying found.
          </p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {flags.map((f) => (
              <li key={f.code} className="text-warn">
                <Icon name="alert" className="mr-1 inline h-4 w-4" />
                {f.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      {missing.length > 0 && (
        <p className="text-sm text-ink-soft">
          {missing.length} details are missing. Copy the message below to ask for exactly those.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => void copyDraft()}>
          Copy inquiry message
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={full}
          onClick={() => onSave(false)}
        >
          Save for comparison
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={full || cost === null}
          onClick={() => onSave(true)}
        >
          Accept quotation
        </button>
      </div>
      {full && (
        <p className="text-sm text-ink-soft">
          You already have {MAX_QUOTES_PER_CATEGORY} quotations for this category. Remove one below
          to add another.
        </p>
      )}
      {cost === null && (
        <p className="text-sm text-ink-soft">
          A quotation needs a price before it can be accepted.
        </p>
      )}
      <div aria-live="polite">
        {copied === 'done' && (
          <p className="flex items-center gap-2 text-sm font-medium text-ok">
            <Icon name="check" />
            Message copied.
          </p>
        )}
        {copied === 'failed' && (
          <div>
            <p className="text-sm font-medium">
              Copy was blocked. Select the message below and copy it:
            </p>
            <textarea
              readOnly
              aria-label="Inquiry message"
              className="input mt-1 min-h-32"
              value={draft}
            />
          </div>
        )}
      </div>
    </div>
  );
}
