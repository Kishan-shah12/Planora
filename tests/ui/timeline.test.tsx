import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithPlan } from './helpers';

describe('timeline', () => {
  it('groups tasks into phases and shows dependency chips', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByRole('heading', { name: '4+ months out' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Final week' })).toBeInTheDocument();
    const caterer = screen.getByTestId('task-caterer');
    expect(within(caterer).getByText('Book venue and fix muhurat date')).toBeInTheDocument();
    expect(screen.getByText('On track')).toBeInTheDocument();
  });

  it('delaying the venue highlights downstream tasks with text, not just colour', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    const venue = screen.getByTestId('task-venue');
    await user.click(within(venue).getByRole('button', { name: 'Mark delayed' }));
    const days = within(venue).getByLabelText('Delayed by (days)');
    await user.clear(days);
    await user.type(days, '40');
    await user.click(within(venue).getByRole('button', { name: 'Apply delay' }));

    expect(within(venue).getByText('Delayed 40 days')).toBeInTheDocument();
    const caterer = screen.getByTestId('task-caterer');
    expect(caterer).toHaveAttribute('data-affected', 'true');
    expect(
      within(caterer).getByText(/Pushed by delay in "Book venue and fix muhurat date"/),
    ).toBeInTheDocument();
    expect(within(caterer).getByText(/Now expected/)).toBeInTheDocument();
    expect(screen.getByTestId('task-outfits')).not.toHaveAttribute('data-affected');
    expect(screen.getByText(/tasks need attention/)).toBeInTheDocument();

    await user.click(within(venue).getByRole('button', { name: 'Change delay' }));
    await user.click(within(venue).getByRole('button', { name: 'Clear delay' }));
    expect(screen.getByTestId('task-caterer')).not.toHaveAttribute('data-affected');
    expect(screen.getByText('On track')).toBeInTheDocument();
  });

  it('marks tasks done, rejects bad delay input and stores assignees', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    const venue = screen.getByTestId('task-venue');
    await user.click(within(venue).getByRole('button', { name: 'Done' }));
    expect(within(venue).getByText('Done', { selector: 'span' })).toBeInTheDocument();
    await user.click(within(venue).getByRole('button', { name: 'Mark as to do' }));

    const outfits = screen.getByTestId('task-outfits');
    await user.type(within(outfits).getByLabelText('Assignee'), 'Mama');
    expect(within(outfits).getByLabelText('Assignee')).toHaveValue('Mama');
    await user.click(within(outfits).getByRole('button', { name: 'Mark delayed' }));
    const days = within(outfits).getByLabelText('Delayed by (days)');
    await user.clear(days);
    await user.type(days, '0');
    expect(within(outfits).getByText('Enter 1 to 365 days.')).toBeInTheDocument();
    expect(within(outfits).getByRole('button', { name: 'Apply delay' })).toBeDisabled();
  });

  it('compresses the plan for a close event instead of showing everything overdue', async () => {
    const { user } = renderWithPlan({ eventDate: '2026-01-20' });
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByTestId('compressed-note')).toHaveTextContent(
      'Your event is 19 days away, sooner than the usual 180-day plan',
    );
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    expect(screen.getByText('On track')).toBeInTheDocument();
  });

  it('flags tasks of a past event as overdue', async () => {
    const { user } = renderWithPlan({ eventDate: '2025-12-20' });
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getAllByText(/Overdue/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('compressed-note')).not.toBeInTheDocument();
  });

  it('shows the suggested run sheet for the day', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    const sheet = screen.getByRole('region', { name: 'On the day: suggested run sheet' });
    expect(within(sheet).getByText('Pheras at the muhurat')).toBeInTheDocument();
    expect(within(sheet).getByText('20:30')).toBeInTheDocument();
  });

  it('downloads the timeline as a calendar file', async () => {
    const create = vi.fn().mockReturnValue('blob:aayojan');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    await user.click(screen.getByRole('button', { name: 'Add timeline to calendar (.ics)' }));
    expect(create).toHaveBeenCalledTimes(1);
    const blob = create.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toContain('text/calendar');
    expect(await blob.text()).toContain('BEGIN:VCALENDAR');
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:aayojan');
    click.mockRestore();
  });
});
