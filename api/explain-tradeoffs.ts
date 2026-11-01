import { ExplanationsSchema, ExplainTradeoffsRequestSchema } from '../src/schemas/index.js';
import { generateJson } from './_lib/gemini.js';
import { createHandler } from './_lib/http.js';
import { EXPLAIN_PROMPT } from './_lib/prompts.js';

export default createHandler({
  name: 'explain-tradeoffs',
  input: ExplainTradeoffsRequestSchema,
  async run(input, onEvent) {
    const result = await generateJson({
      system: EXPLAIN_PROMPT,
      user: `Plan facts (computed by the app): ${JSON.stringify(input)}`,
      schema: ExplanationsSchema,
      onEvent,
    });
    const known = new Set(input.options.map((o) => o.id));
    return { explanations: result.explanations.filter((e) => known.has(e.optionId)) };
  },
});
