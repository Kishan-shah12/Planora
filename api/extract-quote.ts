import { ExtractedQuoteSchema, ExtractQuoteRequestSchema } from '../src/schemas/index.js';
import { generateJson } from './_lib/gemini.js';
import { createHandler } from './_lib/http.js';
import { QUOTE_PROMPT, wrapUserText } from './_lib/prompts.js';

export default createHandler({
  name: 'extract-quote',
  input: ExtractQuoteRequestSchema,
  async run({ text, category }, onEvent) {
    const quote = await generateJson({
      system: QUOTE_PROMPT,
      user: wrapUserText(text),
      schema: ExtractedQuoteSchema,
      onEvent,
    });
    return { ...quote, category: category ?? 'misc' };
  },
});
