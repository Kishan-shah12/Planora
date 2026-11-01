import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations, jsonResponse, renderApp, renderWithPlan, first } from './helpers';

describe('accessibility (axe)', () => {
  it('empty state / plan setup has no violations', async () => {
    const { container } = renderApp();
    await expectNoA11yViolations(container);
  });

  it('has a skip link, landmarks and a proper tablist', () => {
    renderWithPlan();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(document.documentElement.lang).not.toBe('fr');
  });

  it('keyboard arrows move between tabs', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Vendors' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Plan setup' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Vendors' })).toHaveAttribute('aria-selected', 'true');
  });

  it('plan setup with a plan (ideas panel) has no violations', async () => {
    const { user, container } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Plan setup' }));
    await screen.findByText(/AI suggestions/);
    await expectNoA11yViolations(container);
  });

  it('budget tab has no violations, including the over-budget state', async () => {
    const { user, container } = renderWithPlan({ guests: 200 });
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    await expectNoA11yViolations(container);
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(first(screen.getAllByLabelText('Number of guests')), {
      target: { value: '260' },
    });
    expect(screen.getByTestId('over-budget-region')).toHaveTextContent(/Over budget/);
    await expectNoA11yViolations(container);
  });

  it('timeline tab has no violations, including a delayed state', async () => {
    const { user, container } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    await expectNoA11yViolations(container);
    await user.click(first(screen.getAllByRole('button', { name: 'Mark delayed' })));
    await expectNoA11yViolations(container);
  });

  it('vendors tab has no violations with a saved quote comparison', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          vendorName: 'A',
          category: 'catering',
          totalPrice: 100000,
          pricePerPlate: null,
          guestMinimum: null,
          overtimeFeePerHour: null,
          taxIncluded: true,
          advancePercent: 30,
          inclusions: ['Buffet'],
          exclusions: [],
          cancellationPolicy: 'Refund 50%',
        }),
      ),
    );
    const { user, container } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Vendors' }));
    await expectNoA11yViolations(container);
    await user.type(await screen.findByLabelText('Quotation text'), 'quote');
    await user.click(screen.getByRole('button', { name: 'Analyze quotation' }));
    await screen.findByTestId('quote-result');
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Save for comparison' }));
    await screen.findByRole('table', { name: /Side-by-side quotations/ });
    await expectNoA11yViolations(container);
    vi.unstubAllGlobals();
  });
});
