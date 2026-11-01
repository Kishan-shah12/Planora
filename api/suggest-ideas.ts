import { IdeasSchema, SuggestIdeasRequestSchema } from '../src/schemas/index.js';
import { generateJson } from './_lib/gemini.js';
import { createHandler } from './_lib/http.js';
import { IDEAS_PROMPT, wrapUserText } from './_lib/prompts.js';

export default createHandler({
  name: 'suggest-ideas',
  input: SuggestIdeasRequestSchema,
  async run(input, onEvent) {
    const { vibe, ...facts } = input;
    return generateJson({
      system: IDEAS_PROMPT,
      user: `Event facts: ${JSON.stringify(facts)}\nStyle wanted by the family:\n${wrapUserText(vibe)}\nGive a fresh set of ideas (variation ${input.variation ?? 0}).`,
      schema: IdeasSchema,
      onEvent,
    });
  },
});
