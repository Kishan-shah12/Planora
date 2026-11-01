import { RUN_SHEETS } from '../engine';
import type { Occasion } from '../schemas';

/** The day itself, in order. Suggested times only; families adjust them to their muhurat. */
export function RunSheet({ occasion }: { occasion: Occasion }) {
  return (
    <section className="card" aria-labelledby="runsheet-h">
      <h3 id="runsheet-h" className="font-display text-xl tracking-tight">
        On the day: suggested run sheet
      </h3>
      <p className="hint">
        Typical timings to share with family and vendors. Adjust them to your muhurat and venue
        slot.
      </p>
      <ol className="mt-3 divide-y divide-line">
        {RUN_SHEETS[occasion].map((item) => (
          <li key={item.time} className="flex gap-4 py-2 text-sm">
            <time className="tabular w-14 shrink-0 font-semibold text-accent">{item.time}</time>
            <span>{item.title}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
