import { IntakeParseSchema, ParseIntakeRequestSchema } from '../src/schemas/index.js';
import { isValidISO } from '../src/engine/dates.js';
import { generateJson } from './_lib/gemini.js';
import { createHandler } from './_lib/http.js';
import { INTAKE_PROMPT, wrapUserText } from './_lib/prompts.js';

export default createHandler({
  name: 'parse-intake',
  input: ParseIntakeRequestSchema,
  async run({ text }, onEvent) {
    const today = new Date().toISOString().slice(0, 10);
    const result = await generateJson({
      system: INTAKE_PROMPT,
      user: `Today's date: ${today}\n${wrapUserText(text)}`,
      schema: IntakeParseSchema,
      onEvent,
    });
    return {
      ...result,
      eventDate: result.eventDate && isValidISO(result.eventDate) ? result.eventDate : null,
    };
  },
});
