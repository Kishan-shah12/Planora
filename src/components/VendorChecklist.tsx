import { useMemo } from 'react';
import { vendorChecklist, VENDOR_STATUS_LABELS, type VendorStatus } from '../engine';
import type { Plan } from '../schemas';
import { Icon, type IconName } from './Icon';
import type { Action } from '../state/planStore';

const ICON: Record<VendorStatus, IconName> = {
  not_started: 'circle',
  contacted: 'mail',
  quote_received: 'file',
  quote_accepted: 'check',
};

export function VendorChecklist({
  plan,
  dispatch,
}: {
  plan: Plan;
  dispatch: (action: Action) => void;
}) {
  const items = useMemo(() => vendorChecklist(plan), [plan]);
  const confirmed = items.filter((i) => i.status === 'quote_accepted').length;
  return (
    <section className="card" aria-labelledby="checklist-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="checklist-h" className="text-lg">
          Vendor checklist
        </h2>
        <p className="text-sm text-ink-soft">
          {confirmed} of {items.length} vendors confirmed
        </p>
      </div>
      <p className="hint">
        Tick &quot;Contacted&quot; when you reach out. Saving or accepting a quotation below updates
        the status.
      </p>
      <ul className="mt-3 divide-y divide-line">
        {items.map((item) => (
          <li
            key={item.category}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="font-semibold">{item.label}</p>
              <p className="text-sm text-ink-soft">{item.hint}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={item.status === 'quote_accepted' ? 'badge-verified' : 'badge-estimate'}
              >
                <Icon name={ICON[item.status]} className="h-3 w-3" />{' '}
                {VENDOR_STATUS_LABELS[item.status]}
              </span>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-accent"
                  checked={item.status !== 'not_started'}
                  disabled={item.quotes > 0}
                  onChange={() => dispatch({ type: 'toggleContacted', category: item.category })}
                  aria-label={`Contacted ${item.label} vendor`}
                />
                Contacted
              </label>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
