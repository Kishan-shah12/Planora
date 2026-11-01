import { PlanReviewSchema, ReviewPlanRequestSchema } from '../src/schemas/index.js';
import { generateJson } from './_lib/gemini.js';
import { createHandler } from './_lib/http.js';
import { REVIEW_PROMPT, wrapUserText } from './_lib/prompts.js';

export default createHandler({
  name: 'review-plan',
  input: ReviewPlanRequestSchema,
  async run(input, onEvent) {
    const { vibe, ...facts } = input;
    return generateJson({
      system: REVIEW_PROMPT,
      user: `Plan facts (computed by the app): ${JSON.stringify(facts)}\nStyle the family wants:\n${wrapUserText(vibe)}`,
      schema: PlanReviewSchema,
      onEvent,
    });
  },
});
