import { MAX_QUOTES_PER_CATEGORY, type Category, type Plan, type Quote } from '../schemas';
import { categoryLabel } from './presets';
import { formatINR } from './money';

/** Total the vendor would charge for `guests`, or null when the quote has no usable price. */
export function effectiveCost(quote: Quote, guests: number): number | null {
  if (quote.totalPrice != null) return quote.totalPrice;
  if (quote.pricePerPlate != null) {
    return quote.pricePerPlate * Math.max(guests, quote.guestMinimum ?? 0);
  }
  return null;
}

export type FlagCode =
  | 'guestMinimumExceedsGuests'
  | 'overCategoryBudget'
  | 'taxNotStated'
  | 'advanceHigh'
  | 'overtimeFeeApplies'
  | 'noCancellationPolicy';

export interface QuoteFlag {
  code: FlagCode;
  message: string;
  /** Extra rupees, when the flag is a money amount (overCategoryBudget). */
  amount?: number;
}

export function compareQuote(quote: Quote, plan: Plan): QuoteFlag[] {
  const flags: QuoteFlag[] = [];
  if (quote.guestMinimum != null && quote.guestMinimum > plan.guests) {
    flags.push({
      code: 'guestMinimumExceedsGuests',
      message: `Vendor minimum is ${quote.guestMinimum} guests but your plan has ${plan.guests}; you pay for ${quote.guestMinimum - plan.guests} extra.`,
    });
  }
  const cost = effectiveCost(quote, plan.guests);
  if (cost != null) {
    const budget = plan.allocation[quote.category];
    if (cost > budget) {
      const amount = cost - budget;
      flags.push({
        code: 'overCategoryBudget',
        amount,
        message: `${formatINR(amount)} over your ${categoryLabel(plan.occasion, quote.category)} budget of ${formatINR(budget)}.`,
      });
    }
  }
  if (quote.taxIncluded == null) {
    flags.push({
      code: 'taxNotStated',
      message: 'GST/tax is not mentioned; ask whether it is included.',
    });
  }
  if (quote.advancePercent != null && quote.advancePercent > 50) {
    flags.push({
      code: 'advanceHigh',
      message: `${quote.advancePercent}% advance is high; 25-50% is more usual.`,
    });
  }
  if (quote.overtimeFeePerHour != null && quote.overtimeFeePerHour > 0) {
    flags.push({
      code: 'overtimeFeeApplies',
      message: `Overtime is charged at ${formatINR(quote.overtimeFeePerHour)} per hour.`,
    });
  }
  if (quote.cancellationPolicy == null) {
    flags.push({
      code: 'noCancellationPolicy',
      message: 'No cancellation or refund policy stated.',
    });
  }
  return flags;
}

export interface MissingField {
  field: string;
  question: string;
}

export function missingFields(quote: Quote): MissingField[] {
  const out: MissingField[] = [];
  if (quote.totalPrice == null && quote.pricePerPlate == null) {
    out.push({ field: 'price', question: 'What is the total price (or per-plate rate)?' });
  }
  if (quote.guestMinimum == null) {
    out.push({ field: 'guestMinimum', question: 'Is there a minimum guest count?' });
  }
  if (quote.taxIncluded == null) {
    out.push({ field: 'taxIncluded', question: 'Is GST/tax included in this price?' });
  }
  if (quote.advancePercent == null) {
    out.push({
      field: 'advancePercent',
      question: 'How much advance is needed to confirm the booking?',
    });
  }
  if (quote.overtimeFeePerHour == null) {
    out.push({
      field: 'overtimeFeePerHour',
      question: 'What is the charge if the event runs over time?',
    });
  }
  if (quote.cancellationPolicy == null) {
    out.push({
      field: 'cancellationPolicy',
      question: 'What is your cancellation and refund policy?',
    });
  }
  if (quote.inclusions.length === 0) {
    out.push({ field: 'inclusions', question: 'What exactly is included in the price?' });
  }
  return out;
}

/** Polite, ready-to-send message asking only for what the quote is missing. */
export function inquiryDraft(quote: Quote, plan: Plan): string {
  const label = categoryLabel(plan.occasion, quote.category).toLowerCase();
  const greeting = quote.vendorName ? `Namaste ${quote.vendorName},` : 'Namaste,';
  const intro = `Thank you for your quote for ${label}. We are planning an event on ${plan.eventDate} with about ${plan.guests} guests.`;
  const missing = missingFields(quote);
  if (missing.length === 0) {
    return `${greeting}\n\n${intro} Your quote covers everything we needed. Please let us know the next steps to confirm the booking.\n\nThank you!`;
  }
  const list = missing.map((m, i) => `${i + 1}. ${m.question}`).join('\n');
  return `${greeting}\n\n${intro} Before we decide, could you please confirm:\n${list}\n\nThank you, we look forward to hearing from you.`;
}

/** Adds a quote unless the category already holds the maximum number of comparisons. */
export function addQuote(plan: Plan, quote: Quote, id: string): { plan: Plan; added: boolean } {
  const count = plan.quotes.filter((q) => q.category === quote.category).length;
  if (count >= MAX_QUOTES_PER_CATEGORY) return { plan, added: false };
  return {
    plan: {
      ...plan,
      quotes: [...plan.quotes, { id, category: quote.category, quote, accepted: false }],
    },
    added: true,
  };
}

/** Accepting a quote makes it the single verified quotation for its category. */
export function acceptQuote(plan: Plan, id: string): Plan {
  const target = plan.quotes.find((q) => q.id === id);
  if (!target) return plan;
  return {
    ...plan,
    quotes: plan.quotes.map((q) =>
      q.category === target.category ? { ...q, accepted: q.id === id } : q,
    ),
  };
}

export function removeQuote(plan: Plan, id: string): Plan {
  return { ...plan, quotes: plan.quotes.filter((q) => q.id !== id) };
}

export function unacceptCategory(plan: Plan, category: Category): Plan {
  return {
    ...plan,
    quotes: plan.quotes.map((q) => (q.category === category ? { ...q, accepted: false } : q)),
  };
}
