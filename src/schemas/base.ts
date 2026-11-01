import { z } from 'zod';

export const CATEGORIES = [
  'venue',
  'catering',
  'decor',
  'photography',
  'entertainment',
  'misc',
  'contingency',
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const OCCASIONS = ['wedding', 'kids_birthday', 'milestone', 'community'] as const;
export const OccasionSchema = z.enum(OCCASIONS);
export type Occasion = z.infer<typeof OccasionSchema>;

export const MAX_GUESTS = 100_000;
export const MAX_BUDGET = 100_000_000_000;
export const MAX_QUOTES_PER_CATEGORY = 3;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const shortText = (max: number) => z.string().max(max);
const rupees = z.number().int().min(0).max(MAX_BUDGET);

export const AllocationSchema = z.object({
  venue: rupees,
  catering: rupees,
  decor: rupees,
  photography: rupees,
  entertainment: rupees,
  misc: rupees,
  contingency: rupees,
});
export type Allocation = z.infer<typeof AllocationSchema>;

export const TaskStatusSchema = z.enum(['todo', 'done', 'delayed']);
export const TaskSchema = z.object({
  id: shortText(40).min(1),
  title: shortText(160).min(1),
  category: CategorySchema,
  leadDays: z.number().int().min(0).max(1000),
  durationDays: z.number().int().min(0).max(120),
  dependsOn: z.array(shortText(40)).max(20),
  assignee: shortText(60).optional(),
  status: TaskStatusSchema,
  delayDays: z.number().int().min(0).max(365).optional(),
});
export type Task = z.infer<typeof TaskSchema>;

export const QuoteSchema = z.object({
  vendorName: shortText(120).nullable(),
  category: CategorySchema,
  totalPrice: rupees.nullable(),
  pricePerPlate: rupees.nullable(),
  guestMinimum: z.number().int().min(0).max(MAX_GUESTS).nullable(),
  overtimeFeePerHour: rupees.nullable(),
  taxIncluded: z.boolean().nullable(),
  advancePercent: z.number().min(0).max(100).nullable(),
  inclusions: z.array(shortText(200)).max(20),
  exclusions: z.array(shortText(200)).max(20),
  cancellationPolicy: shortText(400).nullable(),
});
export type Quote = z.infer<typeof QuoteSchema>;

export const StoredQuoteSchema = z.object({
  id: shortText(40).min(1),
  category: CategorySchema,
  quote: QuoteSchema,
  accepted: z.boolean(),
});
export type StoredQuote = z.infer<typeof StoredQuoteSchema>;

export const IntakeSchema = z.object({
  occasion: OccasionSchema,
  totalBudget: z.number().int().min(1).max(MAX_BUDGET),
  guests: z.number().int().min(1).max(MAX_GUESTS),
  eventDate: isoDate,
  vibe: shortText(200).optional(),
  priorities: z.array(CategorySchema.exclude(['contingency'])).max(6),
});
export type Intake = z.infer<typeof IntakeSchema>;

export const PlanSchema = z.object({
  version: z.literal(1),
  occasion: OccasionSchema,
  totalBudget: rupees,
  guests: z.number().int().min(1).max(MAX_GUESTS),
  eventDate: isoDate,
  vibe: shortText(200),
  priorities: z.array(CategorySchema).max(7),
  allocation: AllocationSchema,
  locked: z.array(CategorySchema).max(7),
  /** Categories where the family has already reached out to a vendor. */
  contacted: z.array(CategorySchema).max(7).default([]),
  perPlate: z.number().min(0).max(MAX_BUDGET),
  tasks: z.array(TaskSchema).max(60),
  quotes: z.array(StoredQuoteSchema).max(30),
});
export type Plan = z.infer<typeof PlanSchema>;
