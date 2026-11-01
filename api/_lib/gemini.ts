import { z, type ZodType } from 'zod';
import type { AiStreamEvent } from '../../src/schemas/index.js';
import { ApiFailure } from './http.js';
import { callModel } from './model.js';

/** Gemini-friendly JSON Schema from a zod schema (drops the $schema marker). */
export function toJsonSchema(schema: ZodType): Record<string, unknown> {
  const json: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  delete json.$schema;
  return json;
}

/**
 * Calls the model in JSON mode and validates the result against `schema`.
 * Raw model output never leaves this function unvalidated.
 */
export async function generateJson<T>(options: {
  system: string;
  user: string;
  schema: ZodType<T>;
  /** Receives thought summaries when the caller is streaming. */
  onEvent?: (event: AiStreamEvent) => void;
}): Promise<T> {
  const text = await callModel({
    system: options.system,
    user: options.user,
    jsonSchema: toJsonSchema(options.schema),
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
  });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiFailure(502, 'AI_RESPONSE_INVALID');
  }
  const parsed = options.schema.safeParse(raw);
  if (!parsed.success) throw new ApiFailure(502, 'AI_RESPONSE_INVALID');
  return parsed.data;
}
