import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { PrintSummary } from '../../src/components/PrintSummary';
import { QuoteFacts } from '../../src/components/QuoteFacts';
import { QuoteResult } from '../../src/components/QuoteResult';
import { TaskRow } from '../../src/components/TaskRow';
import { acceptQuote, addQuote, buildSchedule, vendorChecklist } from '../../src/engine';
import { ApiError } from '../../src/lib/api';
import { newId } from '../../src/lib/id';
import { systemTheme } from '../../src/lib/theme';
import { useAiCall } from '../../src/lib/useAiCall';
import { reducer } from '../../src/state/planStore';
import type { Plan } from '../../src/schemas';
import { makePlan, makeQuote, TODAY } from '../helpers';
import { jsonResponse, renderApp, renderWithPlan } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const noop = () => undefined;

function allConfirmed(plan: Plan): Plan {
  let next: Plan = { ...plan, tasks: plan.tasks.map((t) => ({ ...t, status: 'done' as const })) };
  for (const item of vendorChecklist(plan)) {
    const quote = makeQuote(
      { totalPrice: 1, taxIncluded: true, cancellationPolicy: 'ok', advancePercent: 10 },
      item.category,
    );
    next = acceptQuote(addQuote(next, quote, item.category).plan, item.category);
  }
  return next;
}

describe('app shell', () => {
  it('works out today itself when no date is injected', () => {
    render(<App initial={{ plan: null, notice: null }} />);
    expect(screen.getByRole('button', { name: 'Create my plan' })).toBeInTheDocument();
  });

  it('timeline and vendors point back to setup when there is no plan', async () => {
    const { user } = renderApp();
    for (const name of ['Timeline', 'Vendors']) {
      await user.click(screen.getByRole('tab', { name }));
      expect(screen.getByRole('button', { name: 'Go to Plan setup' })).toBeInTheDocument();
    }
  });

  it('shows "Tomorrow" in the masthead', () => {
    renderWithPlan({ eventDate: '2026-01-02' });
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
  });

  it('today: masthead and timeline both say so', async () => {
    const { user } = renderWithPlan({ eventDate: TODAY });
    expect(screen.getByText('Today')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByText(/· today/)).toBeInTheDocument();
  });
});

describe('assistant states', () => {
  it('says everything is on track when nothing is left to do', () => {
    renderApp(allConfirmed(makePlan()));
    expect(screen.getByText('Everything is on track.')).toBeInTheDocument();
  });

  it('a failed AI review offers a retry; an empty question is ignored', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: 'AI_UNAVAILABLE' }, 503)),
    );
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('button', { name: 'Ask AI for a plan review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/AI help is unavailable/);
    fireEvent.submit(screen.getByLabelText('Your question'));
    expect(within(screen.getByRole('log', { name: 'Conversation' })).queryByText('You')).toBeNull();
  });
});

describe('plan setup with AI', () => {
  it('reports when the description had no usable details, and retries after a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ error: 'AI_UNAVAILABLE' }, 503))
        .mockResolvedValueOnce(
          jsonResponse({
            occasion: null,
            totalBudget: null,
            guests: null,
            eventDate: null,
            vibe: null,
            nonNegotiables: [],
            city: null,
          }),
        ),
    );
    const { user } = renderApp();
    await user.type(screen.getByLabelText('Event description'), 'hello');
    await user.click(screen.getByRole('button', { name: 'Fill form from description' }));
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/could not find event details/)).toBeInTheDocument();
  });

  it('choosing an occasion changes the category labels', async () => {
    const { user } = renderApp();
    await user.selectOptions(screen.getByLabelText('Occasion'), 'kids_birthday');
    await user.click(screen.getByText('Make it yours (optional)'));
    expect(screen.getByLabelText('Games & activities')).toBeInTheDocument();
  });
});

describe('vendors', () => {
  it('quote category select accepts real categories and ignores anything else', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Vendors' }));
    const select = await screen.findByLabelText('What is this quotation for?');
    await user.selectOptions(select, 'decor');
    expect(select).toHaveValue('decor');
    fireEvent.change(select, { target: { value: 'robots' } });
    expect(select).not.toHaveValue('robots');
  });

  it('comparison table handles unnamed, unpriced and tax-extra quotes', async () => {
    let plan = makePlan();
    plan = addQuote(plan, makeQuote({ vendorName: null, taxIncluded: false }), 'q1').plan;
    const { user } = renderApp(plan);
    await user.click(screen.getByRole('tab', { name: 'Vendors' }));
    const table = await screen.findByRole('table', {
      name: /Side-by-side quotations for Catering/,
    });
    expect(within(table).getByText('Quotation 1')).toBeInTheDocument();
    expect(within(table).getByText('Not stated')).toBeInTheDocument();
    expect(within(table).getByText('Extra')).toBeInTheDocument();
  });

  it('quote facts and result cover every wording', () => {
    const plan = makePlan();
    const quote = makeQuote({ taxIncluded: false, exclusions: ['Crockery'] });
    render(<QuoteFacts quote={quote} guests={200} />);
    expect(screen.getByText('No, extra')).toBeInTheDocument();
    expect(screen.getByText('Crockery')).toBeInTheDocument();
    expect(screen.getByText('Cannot be worked out yet')).toBeInTheDocument();
    render(<QuoteResult quote={quote} plan={plan} full onSave={noop} />);
    expect(screen.getByText(/You already have 3 quotations/)).toBeInTheDocument();
    expect(screen.getByText(/needs a price before it can be accepted/)).toBeInTheDocument();
  });

  it('the print summary names unnamed vendors and copes with an unpriced accepted quotation', () => {
    const plan = acceptQuote(addQuote(makePlan(), makeQuote({ vendorName: null }), 'q').plan, 'q');
    render(<PrintSummary plan={plan} today={TODAY} />);
    expect(screen.getByText(/Catering: Vendor/)).toBeInTheDocument();
  });
});

describe('timeline rows', () => {
  const plan = makePlan();
  const scheduled = buildSchedule(plan.tasks, plan.eventDate, TODAY)[0];

  it('shows "due date already passed" and "cannot finish" flags, and unknown dependency ids', () => {
    if (!scheduled) throw new Error('no task');
    render(
      <ul>
        <TaskRow
          task={{
            ...scheduled,
            dependsOn: ['ghost'],
            flags: { overdue: false, atRisk: false, impossible: true, tooLate: true },
          }}
          occasion="wedding"
          titles={{}}
          pushedBy={null}
          onStatus={noop}
          onDelay={noop}
          onAssignee={noop}
        />
      </ul>,
    );
    expect(screen.getByText('Due date already passed')).toBeInTheDocument();
    expect(screen.getByText('Cannot finish before the event')).toBeInTheDocument();
    expect(screen.getByText('ghost')).toBeInTheDocument();
  });

  it('a single problem is counted in the singular', async () => {
    const { user } = renderApp({
      ...plan,
      tasks: plan.tasks.map((t) =>
        t.id === 'outfits' ? { ...t, status: 'delayed' as const, delayDays: 30 } : t,
      ),
    });
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByText('1 task needs attention')).toBeInTheDocument();
  });
});

describe('budget with no workable option', () => {
  it('explains that nothing fits when the gap is too big', async () => {
    const { user } = renderApp({ ...makePlan(), guests: 2000 });
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    expect(screen.getByText(/No automatic option fits/)).toBeInTheDocument();
  });

  it('applying a trim option leaves no guest note', () => {
    const state = { plan: { ...makePlan(), guests: 230 }, toast: null, seq: 0 };
    const option = {
      id: 'trim_flexible' as const,
      title: 'Trim',
      description: 'd',
      coversRupees: 1,
      changes: [
        { category: 'decor' as const, delta: -1 },
        { category: 'catering' as const, delta: 1 },
      ],
    };
    expect(reducer(state, { type: 'applyOption', option }).toast?.note).toBeUndefined();
  });
});

describe('library fallbacks', () => {
  it('ids work without crypto.randomUUID', () => {
    vi.stubGlobal('crypto', {});
    expect(newId()).toMatch(/^\d+/);
  });

  it('system theme reads light when the OS prefers light', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(systemTheme()).toBe('light');
  });

  it('useAiCall ignores stale answers, cancellations and reports unknown errors', async () => {
    let releaseFirst: (value: string) => void = noop;
    const fn = vi
      .fn<(options: { signal?: AbortSignal }, label: string) => Promise<string>>()
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
      .mockResolvedValueOnce('second')
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(
        (options) =>
          new Promise((_, reject) =>
            options.signal?.addEventListener('abort', () => reject(new ApiError('cancelled'))),
          ),
      );
    const { result } = renderHook(() => useAiCall(fn));
    let first: Promise<string | null> = Promise.resolve(null);
    act(() => {
      first = result.current.run('first');
    });
    await act(async () => {
      await result.current.run('second');
    });
    await act(async () => {
      releaseFirst('first');
      await first;
    });
    expect(result.current.state).toEqual({ status: 'done', data: 'second' });

    await act(async () => {
      await result.current.run('third');
    });
    expect(result.current.state).toEqual({
      status: 'error',
      message: 'Something went wrong. Please try again.',
    });

    let fourth: Promise<string | null> = Promise.resolve(null);
    act(() => {
      fourth = result.current.run('fourth');
    });
    act(() => result.current.reset());
    expect(await fourth).toBeNull();
    expect(result.current.state).toEqual({ status: 'idle' });
  });
});
