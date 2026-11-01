import { useState } from 'react';

/**
 * Text for an input that follows an external value but can be edited freely in between.
 * Resets during render (the documented alternative to an effect) when the external value changes.
 */
export function useSyncedText(value: string) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }
  return [text, setText] as const;
}
