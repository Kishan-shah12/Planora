import { useState, type FormEvent } from 'react';
import {
  createPlan,
  formatINR,
  isValidISO,
  OCCASION_LABELS,
  parseGuests,
  parseINR,
  toLakh,
} from '../engine';
import {
  IntakeSchema,
  MAX_GUESTS,
  OCCASIONS,
  OccasionSchema,
  type Category,
  type IntakeParse,
  type Occasion,
  type Plan,
} from '../schemas';
import { DescribeEvent } from './DescribeEvent';
import { ErrorSummary } from './ErrorSummary';
import { PlanExtras } from './PlanExtras';
import { Field } from './ui';

interface Errors {
  budget?: string;
  guests?: string;
  date?: string;
}

export function PlanSetup({
  today,
  existing,
  onCreate,
}: {
  today: string;
  existing: Plan | null;
  onCreate: (plan: Plan) => void;
}) {
  const [occasion, setOccasion] = useState<Occasion>(existing?.occasion ?? 'wedding');
  const [budgetText, setBudgetText] = useState(existing ? String(existing.totalBudget) : '');
  const [guestsText, setGuestsText] = useState(existing ? String(existing.guests) : '');
  const [date, setDate] = useState(existing?.eventDate ?? '');
  const [vibe, setVibe] = useState(existing?.vibe ?? '');
  const [priorities, setPriorities] = useState<Category[]>(existing?.priorities ?? []);
  const [errors, setErrors] = useState<Errors>({});
  const [failedSubmits, setFailedSubmits] = useState(0);

  const budget = parseINR(budgetText);
  const budgetHint =
    budgetText.trim() === ''
      ? 'Type it your way: 8 lakh, 8L, 8,00,000 or 2 crore.'
      : budget !== null
        ? `Reads as ${formatINR(budget)} (${toLakh(budget)})`
        : undefined;
  const budgetError =
    budgetText.trim() !== '' && budget === null
      ? "Couldn't read that amount. Try 8 lakh or 8,00,000."
      : errors.budget;

  /** Fills only what the AI actually found; returns the names of the filled fields. */
  function applyParsed(result: IntakeParse): string[] {
    const found: string[] = [];
    if (result.occasion) {
      setOccasion(result.occasion);
      found.push('occasion');
    }
    if (result.totalBudget) {
      setBudgetText(String(result.totalBudget));
      found.push('budget');
    }
    if (result.guests) {
      setGuestsText(String(result.guests));
      found.push('guests');
    }
    if (result.eventDate) {
      setDate(result.eventDate);
      found.push('date');
    }
    if (result.vibe) {
      setVibe(result.vibe);
      found.push('style');
    }
    if (result.nonNegotiables.length) {
      setPriorities(result.nonNegotiables);
      found.push('priorities');
    }
    return found;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    const guests = parseGuests(guestsText);
    if (budget === null) next.budget = 'Enter your total budget, for example 8 lakh.';
    if (guests === null) {
      next.guests = `Enter a guest count between 1 and ${MAX_GUESTS.toLocaleString('en-IN')}.`;
    }
    if (!isValidISO(date)) next.date = 'Pick the event date.';
    else if (date < today) next.date = 'Pick today or a future date.';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFailedSubmits((n) => n + 1);
      return;
    }
    const parsed = IntakeSchema.safeParse({
      occasion,
      totalBudget: budget,
      guests,
      eventDate: date,
      vibe: vibe.trim() || undefined,
      priorities,
    });
    if (!parsed.success) {
      setErrors({
        budget: 'Those details could not be used. Please check the budget and guest count.',
      });
      return;
    }
    onCreate(createPlan(parsed.data));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      {!existing && (
        <div className="lg:col-span-2">
          <h2 className="text-3xl leading-tight sm:text-4xl">
            Plan the celebration, not the spreadsheet.
          </h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Tell us about your event. Aayojan keeps your budget, timeline and vendors in one
            connected plan, so a change in one place updates everything else.
          </p>
        </div>
      )}
      <DescribeEvent onParsed={applyParsed} />

      <form className="card space-y-5" onSubmit={submit} noValidate aria-labelledby="essentials-h">
        <h2 id="essentials-h" className="text-lg">
          The essentials
        </h2>
        <ErrorSummary
          attempt={failedSubmits}
          errors={[
            ...(budgetError ? [{ fieldId: 'intake-budget', message: budgetError }] : []),
            ...(errors.guests ? [{ fieldId: 'intake-guests', message: errors.guests }] : []),
            ...(errors.date ? [{ fieldId: 'intake-date', message: errors.date }] : []),
          ]}
        />
        <Field label="Occasion">
          {(p) => (
            <select
              {...p}
              className="input"
              value={occasion}
              onChange={(e) => {
                const picked = OccasionSchema.safeParse(e.target.value);
                if (picked.success) setOccasion(picked.data);
              }}
            >
              {OCCASIONS.map((o) => (
                <option key={o} value={o}>
                  {OCCASION_LABELS[o]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id="intake-budget" label="Total budget (₹)" hint={budgetHint} error={budgetError}>
          {(p) => (
            <input
              {...p}
              className="input"
              inputMode="text"
              autoComplete="off"
              value={budgetText}
              onChange={(e) => setBudgetText(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="intake-guests" label="Number of guests" error={errors.guests}>
            {(p) => (
              <input
                {...p}
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_GUESTS}
                value={guestsText}
                onChange={(e) => setGuestsText(e.target.value)}
              />
            )}
          </Field>
          <Field id="intake-date" label="Event date" error={errors.date}>
            {(p) => (
              <input
                {...p}
                className="input"
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
        </div>

        <PlanExtras
          occasion={occasion}
          vibe={vibe}
          priorities={priorities}
          onVibe={setVibe}
          onPriorities={setPriorities}
        />

        {existing && (
          <p className="hint">
            Creating a new plan replaces your current budget, timeline and vendor quotations.
          </p>
        )}
        <button type="submit" className="btn-primary w-full sm:w-auto">
          {existing ? 'Create new plan' : 'Create my plan'}
        </button>
      </form>
    </div>
  );
}
