import { z } from 'zod';
import { CategorySchema, OccasionSchema, QuoteSchema } from './base.js';

/** Request bodies (also used by the client wrappers). */
export const ParseIntakeRequestSchema = z.object({ text: z.string().trim().min(1).max(1000) });
export const ExtractQuoteRequestSchema = z.object({
  text: z.string().trim().min(1).max(6000),
  category: CategorySchema.optional(),
});
export const ExplainOptionSchema = z.object({
  id: z.string().max(40),
  title: z.string().max(200),
  coversRupees: z.number().int().min(0),
  summary: z.string().max(400),
  warning: z.string().max(300).optional(),
});
export const ExplainTradeoffsRequestSchema = z.object({
  occasion: OccasionSchema,
  guests: z.number().int().min(1),
  totalBudget: z.number().int().min(0),
  overBy: z.number().int().min(0),
  priorities: z.array(CategorySchema).max(7),
  options: z.array(ExplainOptionSchema).min(1).max(3),
});
export const SuggestIdeasRequestSchema = z.object({
  occasion: OccasionSchema,
  vibe: z.string().max(200).default(''),
  guests: z.number().int().min(1),
  budgetTier: z.enum(['modest', 'comfortable', 'premium']),
  nonNegotiables: z.array(CategorySchema).max(7),
  variation: z.number().int().min(0).max(1000).optional(),
});

/** Gemini outputs (validated before reaching the client). */
export const IntakeParseSchema = z.object({
  occasion: OccasionSchema.nullable(),
  totalBudget: z.number().int().min(1).nullable(),
  guests: z.number().int().min(1).max(100000).nullable(),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  vibe: z.string().max(200).nullable(),
  nonNegotiables: z.array(CategorySchema.exclude(['contingency'])).max(6),
  city: z.string().max(80).nullable(),
});
export type IntakeParse = z.infer<typeof IntakeParseSchema>;

export const ExtractedQuoteSchema = QuoteSchema.omit({ category: true });
export type ExtractedQuote = z.infer<typeof ExtractedQuoteSchema>;

export const ExplanationsSchema = z.object({
  explanations: z
    .array(
      z.object({
        optionId: z.string().max(40),
        summary: z.string().max(500),
        bestWhen: z.string().max(300),
      }),
    )
    .max(3),
});
export type Explanations = z.infer<typeof ExplanationsSchema>;

export const IdeasSchema = z.object({
  themes: z
    .array(z.object({ title: z.string().max(80), description: z.string().max(300) }))
    .min(1)
    .max(5),
  activities: z.array(z.string().max(200)).min(1).max(8),
  foodStyle: z.array(z.string().max(200)).min(1).max(6),
  personalTouches: z.array(z.string().max(200)).max(5),
  invitationLine: z.string().min(1).max(400),
});
export type Ideas = z.infer<typeof IdeasSchema>;

export const ReviewPlanRequestSchema = z.object({
  occasion: OccasionSchema,
  guests: z.number().int().min(1),
  totalBudget: z.number().int().min(0),
  daysToEvent: z.number().int().min(-3650).max(3650),
  vibe: z.string().max(200).default(''),
  insights: z
    .array(
      z.object({
        severity: z.enum(['critical', 'warning', 'suggestion']),
        title: z.string().max(200),
        detail: z.string().max(400),
      }),
    )
    .min(1)
    .max(10),
});

export const PlanReviewSchema = z.object({
  summary: z.string().min(1).max(400),
  steps: z
    .array(z.object({ title: z.string().min(1).max(120), why: z.string().max(300) }))
    .min(1)
    .max(3),
});
export type PlanReview = z.infer<typeof PlanReviewSchema>;

export const PlanFactsSchema = z.object({
  occasion: OccasionSchema,
  guests: z.number().int().min(1),
  totalBudget: z.number().int().min(0),
  daysToEvent: z.number().int().min(-3650).max(3650),
  vibe: z.string().max(200).default(''),
  budget: z
    .array(
      z.object({
        category: z.string().max(60),
        amount: z.number().int().min(0),
        verified: z.boolean(),
        shortfall: z.number().int().min(0),
      }),
    )
    .max(7),
  insights: z
    .array(
      z.object({
        severity: z.enum(['critical', 'warning', 'suggestion']),
        title: z.string().max(200),
        detail: z.string().max(400),
      }),
    )
    .max(10),
});

export const ChatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1).max(1200),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

export const AskPlannerRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z.array(ChatTurnSchema).max(8).default([]),
  facts: PlanFactsSchema,
});

export const PlannerAnswerSchema = z.object({ answer: z.string().min(1).max(1200) });
export type PlannerAnswer = z.infer<typeof PlannerAnswerSchema>;

/**
 * One line of a streamed AI answer (NDJSON): the model's thought summaries and model switches as
 * they happen, then the validated result or an error code.
 */
export const AiStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('thought'), text: z.string().max(2000) }),
  z.object({ type: z.literal('model'), model: z.string().max(80) }),
]);
export type AiStreamEvent = z.infer<typeof AiStreamEventSchema>;

export const AiStreamLineSchema = z.union([
  AiStreamEventSchema,
  z.object({ type: z.literal('result'), data: z.unknown() }),
  z.object({ type: z.literal('error'), error: z.string().max(64) }),
]);
