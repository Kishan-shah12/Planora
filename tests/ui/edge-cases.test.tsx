import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { PrintSummary } from '../../src/components/PrintSummary';
import { initialTheme, THEME_KEY } from '../../src/lib/theme';
import { makePlan, TODAY } from '../helpers';
import { first, jsonResponse, renderApp, renderWithPlan } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const looped = () => {
  const base = makePlan();
  return {
    ...base,
    tasks: base.tasks.map((t) => (t.id === 'venue' ? { ...t, dependsOn: ['balances'] } : t)),
  };
};

describe('budget controls: totals, per-plate and guests', () => {
  it('changes the total budget with flexible spelling and reverts bad input', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    const total = screen.getByLabelText('Total budget (₹)');
    await user.clear(total);
    await user.type(total, '10 lakh{Enter}');
    const glance = screen.getByRole('region', { name: 'Budget at a glance' });
    expect(within(glance).getByText('₹10,00,000')).toBeInTheDocument();
    await user.clear(total);
    await user.type(total, 'lots');
    await user.tab();
    expect(total).toHaveValue('1000000');
  });

  it('overrides the per-plate cost, accepts zero and reverts bad input', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    const perPlate = screen.getByLabelText('Catering cost per plate (₹)');
    await user.clear(perPlate);
    await user.type(perPlate, '2000{Enter}');
    expect(screen.getByTestId('guest-impact')).toHaveTextContent('× ₹2,000 per plate');
    await user.clear(perPlate);
    await user.type(perPlate, '0');
    await user.tab();
    expect(screen.getByTestId('guest-impact')).toHaveTextContent('× ₹0 per plate');
    await user.clear(perPlate);
    await user.type(perPlate, 'x');
    await user.tab();
    expect(perPlate).toHaveValue('0');
  });

  it('reverts an impossible guest count on blur', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    const guests = first(screen.getAllByLabelText('Number of guests'));
    fireEvent.change(guests, { target: { value: '0' } });
    fireEvent.focusOut(guests);
    expect(guests).toHaveValue(200);
  });

  it('category rows commit on Enter and use a fine slider step for small budgets', async () => {
    const { user } = renderWithPlan({ totalBudget: 5000 });
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    expect(screen.getByLabelText('Decor amount')).toHaveAttribute('step', '1');
    const decor = screen.getByLabelText('Decor amount (₹)');
    await user.clear(decor);
    await user.type(decor, '0{Enter}');
    expect(decor).toHaveValue('0');
  });

  it('uses a medium slider step for mid-size budgets', async () => {
    const { user } = renderWithPlan({ totalBudget: 50_000 });
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    expect(screen.getByLabelText('Decor amount')).toHaveAttribute('step', '100');
  });
});

describe('header, notices and empty states', () => {
  it('copies the share link when the clipboard works and cancels a reset', async () => {
    const { user } = renderWithPlan();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    expect(await screen.findByText(/Link copied/)).toBeInTheDocument();
    expect(String(writeText.mock.calls[0]?.[0])).toContain('#plan=');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/Reset the whole plan/)).not.toBeInTheDocument();
  });

  it('reset clears a share-link hash from the address bar', async () => {
    window.history.replaceState(null, '', '/#plan=abc');
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await user.click(screen.getByRole('button', { name: 'Yes, reset' }));
    expect(window.location.hash).toBe('');
  });

  it('a notice can be dismissed, and empty tabs point back to setup', async () => {
    const { user } = renderApp(null, { kind: 'shared', message: 'Opened a shared plan.' });
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Opened a shared plan.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    await user.click(screen.getByRole('button', { name: 'Go to Plan setup' }));
    expect(screen.getByRole('tab', { name: 'Plan setup' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('ignores keys that do not move between tabs', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    await user.keyboard('a');
    expect(screen.getByRole('tab', { name: 'Budget' })).toHaveAttribute('aria-selected', 'true');
  });

  it('boots from the real address bar and storage when no initial state is given', () => {
    window.history.replaceState(null, '', '/');
    render(<App today={TODAY} />);
    expect(screen.getByRole('button', { name: 'Create my plan' })).toBeInTheDocument();
  });

  it('keeps working when the browser blocks localStorage', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      renderWithPlan();
      expect(screen.getByRole('heading', { name: 'Budget at a glance' })).toBeInTheDocument();
      expect(initialTheme()).toMatch(/light|dark/);
    } finally {
      if (descriptor) Object.defineProperty(window, 'localStorage', descriptor);
    }
    expect(THEME_KEY).toBe('aayojan.theme');
  });
});

describe('plan setup edge cases', () => {
  it('optional details: style text and toggling a priority on and off', async () => {
    const { user } = renderApp();
    await user.click(screen.getByText('Make it yours (optional)'));
    await user.type(screen.getByLabelText('Style or vibe'), 'minimal');
    expect(screen.getByLabelText('Style or vibe')).toHaveValue('minimal');
    const decor = screen.getByLabelText('Decor');
    await user.click(decor);
    expect(decor).toBeChecked();
    await user.click(decor);
    expect(decor).not.toBeChecked();
  });

  it('ignores an unknown occasion and refuses details the schema rejects', async () => {
    const { user } = renderApp();
    fireEvent.change(screen.getByLabelText('Occasion'), { target: { value: 'rave' } });
    expect(screen.getByLabelText('Occasion')).toHaveValue('wedding');
    await user.type(screen.getByLabelText('Total budget (₹)'), '5 lakh');
    await user.type(screen.getByLabelText('Number of guests'), '50');
    fireEvent.change(screen.getByLabelText('Event date'), { target: { value: '2026-09-01' } });
    await user.click(screen.getByText('Make it yours (optional)'));
    fireEvent.change(screen.getByLabelText('Style or vibe'), {
      target: { value: 'x'.repeat(250) },
    });
    await user.click(screen.getByRole('button', { name: 'Create my plan' }));
    expect(screen.getByText(/Those details could not be used/)).toBeInTheDocument();
  });
});

describe('timeline, vendors and ideas edge cases', () => {
  it('a corrupted dependency loop shows a clear error instead of crashing', async () => {
    const { user } = renderApp(looped());
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Circular task dependency/);
  });

  it('cancelling the delay editor leaves the task unchanged', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    const venue = screen.getByTestId('task-venue');
    await user.click(within(venue).getByRole('button', { name: 'Mark delayed' }));
    await user.click(within(venue).getByRole('button', { name: 'Cancel' }));
    expect(within(venue).queryByLabelText('Delayed by (days)')).not.toBeInTheDocument();
    expect(within(venue).getByText('To do')).toBeInTheDocument();
  });

  it('shows the inquiry message for manual copy when the clipboard is blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          vendorName: null,
          category: 'catering',
          totalPrice: null,
          pricePerPlate: 900,
          guestMinimum: null,
          overtimeFeePerHour: null,
          taxIncluded: null,
          advancePercent: null,
          inclusions: [],
          exclusions: [],
          cancellationPolicy: null,
        }),
      ),
    );
    const { user } = renderWithPlan();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
      configurable: true,
    });
    await user.click(screen.getByRole('tab', { name: 'Vendors' }));
    await user.type(await screen.findByLabelText('Quotation text'), 'Rs 900 per plate');
    await user.click(screen.getByRole('button', { name: 'Analyze quotation' }));
    await screen.findByTestId('quote-result');
    await user.click(screen.getByRole('button', { name: 'Copy inquiry message' }));
    const draft = await screen.findByLabelText<HTMLTextAreaElement>('Inquiry message');
    expect(draft.value).toContain('Namaste');
  });

  it('ideas show a retry after an AI failure and recover', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ error: 'AI_UNAVAILABLE' }, 503))
        .mockResolvedValueOnce(
          jsonResponse({
            themes: [{ title: 'Genda Phool', description: 'Marigolds everywhere.' }],
            activities: ['Antakshari'],
            foodStyle: ['Chaat'],
            personalTouches: [],
            invitationLine: 'Join us for [names] on [date] at [venue].',
          }),
        ),
    );
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Plan setup' }));
    await user.click(await screen.findByRole('button', { name: 'Get ideas' }));
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Genda Phool')).toBeInTheDocument();
  });

  it('the print summary still renders when the schedule cannot be built', () => {
    render(<PrintSummary plan={looped()} today={TODAY} />);
    expect(screen.getByRole('article', { name: 'Plan summary for printing' })).toBeInTheDocument();
  });

  it('a delayed task inside a corrupted loop is also handled', async () => {
    const plan = looped();
    const { user } = renderApp({
      ...plan,
      tasks: plan.tasks.map((t) =>
        t.id === 'caterer' ? { ...t, status: 'delayed' as const, delayDays: 5 } : t,
      ),
    });
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Circular task dependency/);
  });
});

describe('small interactions', () => {
  it('the slider moves money, a valid guest count commits on blur, print opens the dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    fireEvent.change(screen.getByLabelText('Decor amount'), { target: { value: '150000' } });
    expect(screen.getByLabelText('Decor amount (₹)')).toHaveValue('150000');
    const guests = first(screen.getAllByLabelText('Number of guests'));
    fireEvent.change(guests, { target: { value: '220' } });
    fireEvent.focusOut(guests);
    expect(screen.getByTestId('guest-impact')).toHaveTextContent('220 guests');
    await user.click(screen.getByRole('button', { name: 'Print summary' }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('focusing the manual share link selects it for copying', async () => {
    const { user } = renderWithPlan();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
      configurable: true,
    });
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    const input = await screen.findByLabelText<HTMLInputElement>('Copy this link');
    const select = vi.spyOn(input, 'select');
    fireEvent.focus(input);
    expect(select).toHaveBeenCalled();
  });
});
