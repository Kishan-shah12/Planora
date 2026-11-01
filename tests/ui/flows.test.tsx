import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makePlan } from '../helpers';
import { jsonResponse, renderApp, renderWithPlan, first } from './helpers';

afterEach(() => vi.unstubAllGlobals());

describe('create a plan and watch it react', () => {
  it('wedding plan -> change guests -> over-budget banner -> options -> apply', async () => {
    const { user } = renderApp();
    await user.type(screen.getByLabelText('Total budget (₹)'), '8 lakh');
    expect(screen.getByText(/Reads as ₹8,00,000/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Number of guests'), '200');
    fireEvent.change(screen.getByLabelText('Event date'), { target: { value: '2026-07-15' } });
    await user.click(screen.getByText('Make it yours (optional)'));
    await user.click(screen.getByLabelText('Catering'));
    await user.click(screen.getByRole('button', { name: 'Create my plan' }));

    expect(await screen.findByRole('heading', { name: 'Budget at a glance' })).toBeInTheDocument();
    expect(document.getElementById('plan-title')).toHaveFocus();
    expect(screen.getByTestId('over-budget-region')).not.toHaveTextContent(/Over budget/);
    const catering = screen.getByRole('article', { name: 'Catering' });
    expect(within(catering).getByText('Estimate')).toBeInTheDocument();

    fireEvent.change(first(screen.getAllByLabelText('Number of guests')), {
      target: { value: '260' },
    });
    const banner = screen.getByTestId('over-budget-region');
    expect(banner).toHaveTextContent(/Over budget by ₹/);
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('heading', { name: 'Ways to close the gap' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Reduce guests by/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Apply' }).length).toBeLessThanOrEqual(3);

    await user.click(first(screen.getAllByRole('button', { name: 'Apply' })));
    expect(screen.getByText(/Apply "Reduce guests by/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, apply' }));
    await waitFor(() =>
      expect(screen.getByTestId('over-budget-region')).not.toHaveTextContent(/Over budget/),
    );
  });

  it('shows an error summary that takes focus and links to each field', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Create my plan' }));
    const summary = screen.getByRole('alert', { name: /Please fix 3 things/ });
    expect(summary).toHaveFocus();
    const links = within(summary).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Enter your total budget, for example 8 lakh.',
      expect.stringMatching(/Enter a guest count/) as string,
      'Pick the event date.',
    ]);
    await user.click(first(links));
    expect(screen.getByLabelText('Total budget (₹)')).toHaveFocus();
    expect(screen.getByLabelText('Total budget (₹)')).toHaveAttribute('aria-invalid', 'true');
    await user.type(screen.getByLabelText('Total budget (₹)'), 'lots');
    expect(screen.getAllByText(/Couldn't read that amount/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Budget at a glance' })).not.toBeInTheDocument();
  });

  it('rejects past dates', async () => {
    const { user } = renderApp();
    await user.type(screen.getByLabelText('Total budget (₹)'), '5 lakh');
    await user.type(screen.getByLabelText('Number of guests'), '50');
    fireEvent.change(screen.getByLabelText('Event date'), { target: { value: '2025-01-01' } });
    await user.click(screen.getByRole('button', { name: 'Create my plan' }));
    expect(screen.getByRole('alert', { name: /Please fix 1 thing/ })).toHaveTextContent(
      'Pick today or a future date.',
    );
  });
});

describe('budget interactions', () => {
  it('number input redistributes, shows a diff toast, and lock protects a category', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    await user.click(screen.getByRole('button', { name: 'Lock Catering amount' }));
    expect(screen.getByRole('button', { name: 'Lock Catering amount' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Catering amount')).toBeDisabled();

    const photo = screen.getByLabelText('Photography & video amount (₹)');
    await user.clear(photo);
    await user.type(photo, '1.2 lakh');
    await user.tab();
    const toast = screen
      .getAllByRole('status')
      .find((el) => el.textContent.includes('Photography & video +'));
    expect(toast).toBeDefined();
    expect(toast?.textContent).toMatch(/−₹/);
    expect(toast?.textContent).not.toMatch(/Catering/);
  });

  it('invalid amount shows an error without changing anything', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    const decor = screen.getByLabelText('Decor amount (₹)');
    await user.clear(decor);
    await user.type(decor, 'abc');
    await user.tab();
    expect(screen.getByText(/Couldn.t read that amount\./)).toBeInTheDocument();
  });

  it('explain options calls the AI and shows plain-language text; failure offers retry', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: 'AI_UNAVAILABLE' }, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          explanations: [
            {
              optionId: 'reduce_guests',
              summary: 'Invite a few fewer people.',
              bestWhen: 'Your list is flexible.',
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { user } = renderWithPlan({ guests: 200 });
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    fireEvent.change(first(screen.getAllByLabelText('Number of guests')), {
      target: { value: '260' },
    });
    await user.click(screen.getByRole('button', { name: 'Explain these options' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/AI help is unavailable/);
    // engine still works while AI is down
    expect(screen.getByTestId('over-budget-region')).toHaveTextContent(/Over budget/);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Invite a few fewer people.')).toBeInTheDocument();
    const explained = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      options: unknown[];
    };
    expect(explained.options.length).toBeGreaterThan(0);
  });
});

describe('AI intake', () => {
  it('fills the form from a description', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          occasion: 'kids_birthday',
          totalBudget: 150000,
          guests: 30,
          eventDate: '2026-03-10',
          vibe: 'dinosaurs',
          nonNegotiables: ['entertainment'],
          city: null,
        }),
      ),
    );
    const { user } = renderApp();
    await user.type(
      screen.getByLabelText('Event description'),
      'Kids birthday, 30 guests, 1.5 lakh',
    );
    await user.click(screen.getByRole('button', { name: 'Fill form from description' }));
    expect(
      await screen.findByText(/Filled occasion, budget, guests, date, style, priorities/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Occasion')).toHaveValue('kids_birthday');
    expect(screen.getByLabelText('Number of guests')).toHaveValue(30);
    expect(screen.getByLabelText('Total budget (₹)')).toHaveValue('150000');
  });
});

describe('vendors', () => {
  const quote = {
    vendorName: 'Shree Caterers',
    category: 'catering',
    totalPrice: null,
    pricePerPlate: 1500,
    guestMinimum: 250,
    overtimeFeePerHour: null,
    taxIncluded: null,
    advancePercent: null,
    inclusions: [],
    exclusions: [],
    cancellationPolicy: null,
  };

  it('analyze -> flags -> copy inquiry -> accept marks category verified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(quote)));
    const { user } = renderWithPlan();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(screen.getByRole('tab', { name: 'Vendors' }));
    await user.type(
      await screen.findByLabelText('Quotation text'),
      'Per plate 1500, min 250 plates',
    );
    await user.click(screen.getByRole('button', { name: 'Analyze quotation' }));
    const result = await screen.findByTestId('quote-result');
    expect(result).toHaveTextContent(/Vendor minimum is 250 guests/);
    expect(result).toHaveTextContent(/GST\/tax is not mentioned/);
    expect(result).toHaveTextContent(/over your Catering budget/);

    await user.click(screen.getByRole('button', { name: 'Copy inquiry message' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Is GST/tax included'));
    expect(await screen.findByText(/Message copied/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept quotation' }));
    expect(await screen.findByText(/Quotation accepted. This category/)).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: /Side-by-side quotations for Catering/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Accepted/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    expect(
      within(screen.getByRole('article', { name: 'Catering' })).getByText('Verified quotation'),
    ).toBeInTheDocument();
  });

  it('shows a retry when quote extraction fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'AI_RESPONSE_INVALID' }, 502)),
    );
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Vendors' }));
    await user.type(await screen.findByLabelText('Quotation text'), 'some quote');
    await user.click(screen.getByRole('button', { name: 'Analyze quotation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not trust/);
  });
});

describe('planning assistant', () => {
  it('shows what needs attention and jumps to the right tab', async () => {
    const { user } = renderWithPlan({ guests: 200 });
    const panel = screen.getByRole('region', { name: 'Your planning assistant' });
    expect(within(panel).getByText(/Next up:/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    fireEvent.change(first(screen.getAllByLabelText('Number of guests')), {
      target: { value: '260' },
    });
    expect(within(panel).getByText(/Urgent/)).toBeInTheDocument();
    expect(
      within(panel).getByText(/thing needs your attention|things need your attention/),
    ).toBeInTheDocument();
    await user.click(first(within(panel).getAllByRole('button', { name: 'Open Timeline' })));
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
  });

  it('asks Gemini for a review of the computed facts and shows it', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        summary: 'Good start. Lock in vendors next.',
        steps: [{ title: 'Get catering quotes', why: 'Food is your priority.' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('button', { name: 'Ask AI for a plan review' }));
    expect(await screen.findByTestId('ai-review')).toHaveTextContent('Get catering quotes');
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      insights: unknown[];
    };
    expect(sent.insights.length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Refresh AI review' })).toBeInTheDocument();
  });

  it('expands to show every insight', async () => {
    const base = makePlan({ eventDate: '2026-02-15' });
    const { user } = renderApp({
      ...base,
      guests: 260,
      tasks: base.tasks.map((t) =>
        t.id === 'venue' ? { ...t, status: 'delayed' as const, delayDays: 20 } : t,
      ),
    });
    const panel = screen.getByRole('region', { name: 'Your planning assistant' });
    await user.click(within(panel).getByRole('button', { name: /Show all/ }));
    expect(within(panel).getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('ask the planner', () => {
  it('sends the question with plan facts and shows the Gemini answer', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ answer: 'Pehle venue book karein.' }));
    vi.stubGlobal('fetch', fetchMock);
    const { user } = renderWithPlan();
    await user.type(screen.getByLabelText('Your question'), 'Pehle kya karein?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(await within(log).findByText('Pehle venue book karein.')).toBeInTheDocument();
    expect(within(log).getByText('Assistant (Gemini)')).toBeInTheDocument();
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      question: string;
      facts: { totalBudget: number };
    };
    expect(sent.question).toBe('Pehle kya karein?');
    expect(sent.facts.totalBudget).toBe(800000);
    await user.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(within(log).queryByText('Pehle venue book karein.')).not.toBeInTheDocument();
  });

  it('falls back to the built-in planner when AI is unavailable, and sends history', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: 'AI_UNAVAILABLE' }, 503))
      .mockResolvedValueOnce(jsonResponse({ answer: 'Second answer.' }));
    vi.stubGlobal('fetch', fetchMock);
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('button', { name: 'Are we over budget?' }));
    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(await within(log).findByText(/within your ₹8,00,000 budget/)).toBeInTheDocument();
    expect(within(log).getByText(/built-in planner, AI unavailable/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your question'), 'And next?{Enter}');
    expect(await within(log).findByText('Second answer.')).toBeInTheDocument();
    const sent = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      history: unknown[];
    };
    expect(sent.history).toHaveLength(2);
  });
});

describe('vendor checklist', () => {
  it('marks a vendor as contacted and shows progress', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Vendors' }));
    expect(await screen.findByRole('heading', { name: 'Vendor checklist' })).toBeInTheDocument();
    expect(screen.getByText('0 of 6 vendors confirmed')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Contacted Catering vendor'));
    const row = screen.getByText('Caterer, menu tasting').closest('li') as HTMLElement;
    expect(
      within(row).getByText('Contacted', { selector: 'span:not([aria-hidden])' }),
    ).toBeInTheDocument();
    expect(within(row).getByLabelText('Contacted Catering vendor')).toBeChecked();
  });
});

describe('header and ideas', () => {
  it('reset needs confirmation', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText(/Reset the whole plan/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, reset' }));
    expect(screen.getByRole('button', { name: 'Create my plan' })).toBeInTheDocument();
  });

  it('shows readiness and share-link fallback', async () => {
    const { user } = renderWithPlan();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
      configurable: true,
    });
    expect(within(screen.getByRole('banner')).getByText(/Plan readiness 0%/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    const link = await screen.findByLabelText<HTMLInputElement>('Copy this link');
    expect(link.value).toContain('#plan=');
  });

  it('ideas panel is labelled as AI with no prices and can retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          themes: [{ title: 'Marigold Mehfil', description: 'Warm florals.' }],
          activities: ['Antakshari'],
          foodStyle: ['Chaat counter'],
          personalTouches: [],
          invitationLine: 'Join us for [names] on [date] at [venue].',
        }),
      ),
    );
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Plan setup' }));
    expect(await screen.findByText(/AI suggestions · no prices/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get ideas' }));
    expect(await screen.findByText('Marigold Mehfil')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate ideas' })).toBeInTheDocument();
    expect(screen.getByText('Join us for [names] on [date] at [venue].')).toBeInTheDocument();
  });
});

describe('share-link notices', () => {
  it('shows a friendly message for a bad link', () => {
    renderApp(null, { kind: 'bad_link', message: 'That share link could not be opened.' });
    expect(screen.getByText(/could not be opened/)).toBeInTheDocument();
  });
});
