import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { expect } from 'vitest';
import App from '../../src/App';
import type { InitialLoad } from '../../src/state/planStore';
import type { Plan } from '../../src/schemas';
import { TODAY, makePlan } from '../helpers';

export function renderApp(plan: Plan | null = null, notice: InitialLoad['notice'] = null) {
  const user = userEvent.setup();
  const view = render(<App initial={{ plan, notice }} today={TODAY} />);
  return { user, ...view };
}

export function renderWithPlan(over: Parameters<typeof makePlan>[0] = {}) {
  return renderApp(makePlan(over));
}

export async function expectNoA11yViolations(container: HTMLElement) {
  const results = await axe(container);
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** First match from a getAll* query, failing loudly instead of using a non-null assertion. */
export function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('Expected at least one match');
  return item;
}
