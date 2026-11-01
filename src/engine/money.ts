const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹8,00,000 (en-IN grouping). Negative values render as −₹x. */
export function formatINR(amount: number): string {
  const n = Math.round(amount);
  return `${n < 0 ? '−' : ''}₹${inr.format(Math.abs(n))}`;
}

/** Share of `total` as a percentage rounded to one decimal; 0 when the total is 0. */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Compact friendly form: ₹8 lakh, ₹8.5 lakh, ₹2 crore; below one lakh uses full grouping. */
export function toLakh(amount: number): string {
  const n = Math.round(amount);
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 10_000_000) return `${sign}₹${trim(abs / 10_000_000)} crore`;
  if (abs >= 100_000) return `${sign}₹${trim(abs / 100_000)} lakh`;
  return formatINR(n);
}

export interface Share<T> {
  item: T;
  share: number;
}

/**
 * Splits `total` (integer rupees) across `items` in proportion to `weightOf`, so the shares always
 * sum exactly to `total`. Largest-remainder method; ties go to the earlier item. Missing, negative
 * or non-finite weights count as zero, and all-zero weights split evenly.
 */
export function apportion<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  total: number,
): Share<T>[] {
  const target = Math.max(0, Math.floor(total));
  const rows = items.map((item, index) => {
    const weight = weightOf(item);
    return { item, index, weight: Number.isFinite(weight) && weight > 0 ? weight : 0 };
  });
  const weightSum = rows.reduce((sum, row) => sum + row.weight, 0);
  const exact = rows.map((row) => ({
    ...row,
    exact: weightSum === 0 ? target / rows.length : (row.weight / weightSum) * target,
  }));
  const left = target - exact.reduce((sum, row) => sum + Math.floor(row.exact), 0);
  const winners = new Set(
    [...exact]
      .sort(
        (a, b) =>
          b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || a.index - b.index,
      )
      .slice(0, left)
      .map((row) => row.index),
  );
  return exact.map((row) => ({
    item: row.item,
    share: Math.floor(row.exact) + (winners.has(row.index) ? 1 : 0),
  }));
}

/** `apportion` for a plain list of weights. */
export function largestRemainderRound(weights: readonly number[], total: number): number[] {
  return apportion(weights, (weight) => weight, total).map((part) => part.share);
}

const UNIT: Record<string, number> = {
  '': 1,
  l: 100_000,
  lac: 100_000,
  lacs: 100_000,
  lakh: 100_000,
  lakhs: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
  k: 1_000,
  thousand: 1_000,
};

/**
 * Forgiving rupee parser: "8 lakh", "8L", "8,00,000", "₹800000", "8.5 lac", "2 crore", "45k".
 * Returns integer rupees, or null when the text is not a positive amount.
 */
export function parseINR(input: string): number | null {
  if (typeof input !== 'string') return null;
  const text = input
    .toLowerCase()
    .replace(/₹|rs\.?|inr/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/\/-$/, '');
  const match = /^(\d+(?:\.\d+)?|\.\d+)(l|lac|lacs|lakh|lakhs|cr|crore|crores|k|thousand)?$/.exec(
    text,
  );
  if (!match) return null;
  const value = Number(match[1]) * (UNIT[match[2] ?? ''] ?? 1);
  if (!Number.isFinite(value) || value <= 0 || value > 100_000_000_000) return null;
  return Math.round(value);
}
