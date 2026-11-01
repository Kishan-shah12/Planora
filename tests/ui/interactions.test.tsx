import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addQuote } from '../../src/engine';
import { parsePlan } from '../../src/state/validate';
import { makePlan, makeQuote } from '../helpers';
import { first, jsonResponse, renderApp, renderWithPlan } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const unavailable = () => jsonResponse({ error: 'AI_UNAVAILABLE' }, 503);

describe('retry buttons recover after an AI failure', () => {
  it('plan review: retry gets a review', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(unavailable())
        .mockResolvedValueOnce(
          jsonResponse({
            summary: 'All good.',
            steps: [{ title: 'Book the venue', why: 'First.' }],
          }),
        ),
    );
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('button', { name: 'Ask AI for a plan review' }));
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('ai-review')).toHaveTextContent('Book the venue');
  });

  it('quote analysis: retry analyses the same text', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(unavailable())
        .mockResolvedValueOnce(
          jsonResponse({
            vendorName: 'Annapurna',
            category: 'catering',
            totalPrice: 250000,
            pricePerPlate: null,
            guestMinimum: null,
            overtimeFeePerHour: null,
            taxIncluded: true,
            advancePercent: 20,
            inclusions: ['Buffet'],
            exclusions: [],
            cancellationPolicy: 'Full refund 30 days before',
          }),
        ),
    );
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Vendors' }));
    await user.type(await screen.findByLabelText('Quotation text'), 'Total 2.5 lakh');
    await user.click(screen.getByRole('button', { name: 'Analyze quotation' }));
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('quote-result')).toHaveTextContent('Annapurna');
  });
});

describe('comparison table actions', () => {
  it('accepts one quote, then removes the other', async () => {
    let plan = makePlan();
    plan = addQuote(plan, makeQuote({ vendorName: 'Shree', totalPrice: 200000 }), 'a').plan;
    plan = addQuote(plan, makeQuote({ vendorName: 'Annapurna', totalPrice: 210000 }), 'b').plan;
    const { user } = renderApp(plan);
    await user.click(screen.getByRole('tab', { name: 'Vendors' }));
    const table = await screen.findByRole('table', {
      name: /Side-by-side quotations for Catering/,
    });
    await user.click(first(within(table).getAllByRole('button', { name: 'Accept' })));
    expect(within(table).getByText('Accepted')).toBeInTheDocument();
    const removes = within(table).getAllByRole('button', { name: 'Remove' });
    await user.click(removes[removes.length - 1] ?? first(removes));
    expect(within(table).queryByText('Annapurna')).not.toBeInTheDocument();
  });
});

describe('small confirmations and toasts', () => {
  it('cancelling an option confirmation keeps the plan unchanged', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    fireEvent.change(first(screen.getAllByLabelText('Number of guests')), {
      target: { value: '260' },
    });
    await user.click(first(screen.getAllByRole('button', { name: 'Apply' })));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Yes, apply' })).not.toBeInTheDocument();
    expect(screen.getByTestId('over-budget-region')).toHaveTextContent(/Over budget/);
  });

  it('the change toast can be dismissed', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    fireEvent.change(screen.getByLabelText('Decor amount'), { target: { value: '150000' } });
    const toast = screen.getAllByRole('status').find((el) => el.textContent.includes('Decor +'));
    expect(toast).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getAllByRole('status').some((el) => el.textContent.includes('Decor +'))).toBe(
      false,
    );
  });
});

describe('share-link validation with quotes', () => {
  it('accepts unique quote ids and rejects duplicates', () => {
    let plan = makePlan();
    plan = addQuote(plan, makeQuote({ totalPrice: 1 }), 'q1').plan;
    expect(parsePlan(JSON.parse(JSON.stringify(plan)))).not.toBeNull();
    const duplicated = { ...plan, quotes: [...plan.quotes, ...plan.quotes] };
    expect(parsePlan(JSON.parse(JSON.stringify(duplicated)))).toBeNull();
  });
});
