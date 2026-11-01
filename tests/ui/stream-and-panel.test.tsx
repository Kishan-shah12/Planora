import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askPlanner } from '../../src/lib/api';
import { AnswerMeta, LiveThinking, splitThought } from '../../src/components/ThinkingTrace';
import { first, renderApp, renderWithPlan, expectNoA11yViolations } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const encoder = new TextEncoder();

/** An NDJSON response whose lines can be pushed one at a time, like a live stream. */
function liveStream() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } }),
    send: (line: unknown) => controller?.enqueue(encoder.encode(`${JSON.stringify(line)}\n`)),
    raw: (text: string) => controller?.enqueue(encoder.encode(text)),
    close: () => controller?.close(),
  };
}

const facts = {
  occasion: 'wedding' as const,
  guests: 100,
  totalBudget: 500000,
  daysToEvent: 90,
  budget: [],
  insights: [],
};
const request = { question: 'Hi', history: [], facts };

describe('streamed API client', () => {
  it('passes thoughts on as they arrive and returns the validated result', async () => {
    const stream = liveStream();
    const events: unknown[] = [];
    const pending = askPlanner(request, {
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(stream.response),
      onEvent: (e) => events.push(e),
    });
    stream.send({ type: 'thought', text: '**Look** at it' });
    // A line split across two network chunks is reassembled.
    stream.raw('{"type":"model","model":"gemini-3.1-flash-lite"}\n{"type":"res');
    stream.raw('ult","data":{"answer":"Done."}}\n');
    await expect(pending).resolves.toEqual({ answer: 'Done.' });
    expect(events).toEqual([
      { type: 'thought', text: '**Look** at it' },
      { type: 'model', model: 'gemini-3.1-flash-lite' },
    ]);
  });

  it('maps an error line, junk lines and a stream that ends early to errors', async () => {
    const run = async (chunk: string) => {
      const stream = liveStream();
      const pending = askPlanner(request, {
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(stream.response),
        onEvent: () => undefined,
      }).catch((e: unknown) => e);
      stream.raw(chunk);
      stream.close();
      return pending;
    };
    expect(await run('{"type":"error","error":"AI_TIMEOUT"}\n')).toMatchObject({ kind: 'timeout' });
    expect(await run('{"type":"error","error":"AI_UNAVAILABLE"}\n')).toMatchObject({
      kind: 'ai_unavailable',
    });
    expect(await run('not json\n')).toMatchObject({ kind: 'ai_invalid' });
    expect(await run('{"type":"shout"}\n')).toMatchObject({ kind: 'ai_invalid' });
    expect(await run('\n{"type":"thought","text":"x"}\n')).toMatchObject({ kind: 'server' });
    expect(await run('{"type":"result","data":{"answer":""}}\n')).toMatchObject({
      kind: 'ai_invalid',
    });
  });

  it('falls back to a plain JSON body when the server does not stream', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ answer: 'Plain.' }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(askPlanner(request, { fetcher, onEvent: () => undefined })).resolves.toEqual({
      answer: 'Plain.',
    });
    expect(first(fetcher.mock.calls)[1]?.headers).toMatchObject({
      Accept: 'application/x-ndjson, application/json',
    });
  });
});

describe('thinking trace', () => {
  it('splits a bold heading from the thought text', () => {
    expect(splitThought('**Weighing options** I will compare **both**.')).toEqual({
      title: 'Weighing options',
      body: 'I will compare both.',
    });
    expect(splitThought('Just text')).toEqual({ title: null, body: 'Just text' });
  });

  it('shows Gemini thinking live in the chat, then keeps it with the answer', async () => {
    const stream = liveStream();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(stream.response));
    const { user } = renderWithPlan();
    await user.type(screen.getByLabelText('Your question'), 'What next?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    // Before the first thought arrives the wait is already explained.
    expect(await screen.findByText(/Waiting for Gemini.s first thought/)).toBeInTheDocument();
    stream.send({ type: 'thought', text: '**Reading your budget** Catering is the biggest cost.' });
    const live = await screen.findByTestId('thinking-live');
    await waitFor(() => expect(live).toHaveTextContent("Gemini's thinking, live"));
    expect(live).toHaveTextContent('Reading your budget');

    stream.send({ type: 'model', model: 'gemini-3.1-flash-lite' });
    stream.send({ type: 'result', data: { answer: 'Book the venue first.' } });
    stream.close();

    expect(await screen.findByText('Book the venue first.')).toBeInTheDocument();
    expect(await screen.findByText('Answered by Gemini 3.1 Flash Lite')).toBeInTheDocument();
    expect(screen.queryByText(/backup/i)).not.toBeInTheDocument();
    const summary = await screen.findByText(/How Gemini thought about this \(1 step\)/);
    await user.click(summary);
    expect(screen.getByTestId('thinking-done')).toHaveTextContent('Catering is the biggest cost.');
  });

  it('shows the live trace for the plan review too, and nothing when no thoughts arrive', async () => {
    const stream = liveStream();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(stream.response));
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('button', { name: 'Ask AI for a plan review' }));
    stream.send({ type: 'thought', text: 'Two thoughts.' });
    stream.send({ type: 'thought', text: '**Second** one.' });
    expect(await screen.findByTestId('thinking-live')).toHaveTextContent('Second');
    stream.send({
      type: 'result',
      data: { summary: 'All good.', steps: [{ title: 'Book the venue', why: 'First.' }] },
    });
    stream.close();
    expect(await screen.findByTestId('ai-review')).toHaveTextContent('How Gemini thought');
    expect(screen.getByText(/2 steps/)).toBeInTheDocument();
  });
});

describe('Describe your event', () => {
  it('Tab on an empty box accepts the example; typed text is left alone', async () => {
    const { user } = renderApp(null);
    const box = screen.getByLabelText('Event description');
    expect(screen.getByText('to use this example.', { exact: false })).toBeInTheDocument();
    box.focus();
    await user.tab();
    expect(box).toHaveValue(
      'Shaadi in Pune, 200 guests, 8 lakh budget, mid-Feb, simple ceremony but premium food',
    );
    expect(box).toHaveFocus();
    expect(screen.queryByText('to use this example.', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fill form from description' })).toHaveClass(
      'btn-primary',
    );

    // With text in the box Tab moves on as normal; so does Shift+Tab on an empty box.
    await user.tab();
    expect(box).not.toHaveFocus();
    fireEvent.change(box, { target: { value: '' } });
    box.focus();
    await user.tab({ shift: true });
    expect(box).toHaveValue('');
  });
});

describe('progress panel', () => {
  it('opens from any tab, lists vendors and tasks, navigates and hides', async () => {
    const { user } = renderWithPlan();
    const toggle = screen.getByRole('button', { name: /^Progress \d+%/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('complementary', { name: 'Plan progress' })).not.toBeInTheDocument();

    await user.click(toggle);
    const panel = screen.getByRole('complementary', { name: 'Plan progress' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel).getByRole('button', { name: 'Hide' })).toHaveFocus();
    expect(within(panel).getByText(/tasks done/)).toBeInTheDocument();
    expect(
      within(panel).getByRole('heading', { name: 'Vendors and quotations' }),
    ).toBeInTheDocument();
    expect(within(panel).getAllByText('Not started').length).toBeGreaterThan(0);
    expect(within(panel).getByRole('heading', { name: 'Timeline tasks' })).toBeInTheDocument();
    await expectNoA11yViolations(panel);

    await user.click(within(panel).getAllByRole('button', { name: 'Open' })[1] ?? toggle);
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('complementary', { name: 'Plan progress' })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    await user.click(
      first(
        within(screen.getByRole('complementary', { name: 'Plan progress' })).getAllByRole(
          'button',
          { name: 'Open' },
        ),
      ),
    );
    expect(screen.getByRole('tab', { name: 'Vendors' })).toHaveAttribute('aria-selected', 'true');

    await user.click(toggle);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Plan progress' })).not.toBeInTheDocument();
  });

  it('shows done tasks ticked and struck through, delayed ones as delayed, and saved quotations', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    await user.click(first(screen.getAllByRole('button', { name: /^Done$/ })));
    await user.click(screen.getByRole('button', { name: /^Progress \d+%/ }));
    const panel = screen.getByRole('complementary', { name: 'Plan progress' });
    expect(within(panel).getAllByText('Done').length).toBeGreaterThan(0);
    expect(within(panel).getAllByText('To do').length).toBeGreaterThan(0);
  });

  it('is not shown before a plan exists', () => {
    renderApp(null);
    expect(screen.queryByRole('button', { name: /^Progress/ })).not.toBeInTheDocument();
  });
});

describe('budget tab layout', () => {
  it('keeps one status slot above the sliders and puts the options below them', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    const region = screen.getByTestId('over-budget-region');
    expect(region).toHaveTextContent(/Within budget/);

    fireEvent.change(first(screen.getAllByLabelText('Number of guests')), {
      target: { value: '260' },
    });
    expect(region).toHaveTextContent(/Over budget by/);
    const sliders = screen.getByRole('heading', { name: 'Where the money goes' });
    const options = screen.getByRole('heading', { name: 'Ways to close the gap' });
    expect(
      sliders.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await user.click(within(region).getByRole('button', { name: 'Options' }));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.getElementById('tradeoffs')).toHaveFocus();
  });
});

describe('holding a slider', () => {
  it('keeps the assistant above as it was until the pointer is released', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    const urgent = () => screen.getByText(/needs? your attention|Nothing urgent/);
    const slider = screen.getByLabelText('Catering amount');
    fireEvent.pointerDown(slider);
    fireEvent.change(first(screen.getAllByLabelText('Number of guests')), {
      target: { value: '260' },
    });
    const held = urgent().textContent;
    expect(screen.getByTestId('over-budget-region')).toHaveTextContent(/Over budget by/);
    fireEvent.pointerUp(document);
    await waitFor(() => expect(urgent().textContent).not.toBe(held));
  });

  it('ignores a press that is not on a slider', async () => {
    const { user } = renderWithPlan();
    fireEvent.pointerDown(screen.getByRole('tab', { name: 'Budget' }));
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    expect(screen.getByRole('tab', { name: 'Budget' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('every AI section shows the live thinking and the answering model', () => {
  it('Describe your event: live thinking, then "Answered by"', async () => {
    const stream = liveStream();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(stream.response));
    const { user } = renderApp(null);
    await user.type(screen.getByLabelText('Event description'), 'Shaadi, 100 guests');
    await user.click(screen.getByRole('button', { name: 'Fill form from description' }));
    expect(await screen.findByText(/Gemini is reading your description/)).toBeInTheDocument();
    stream.send({ type: 'thought', text: '**Reading** the guest count.' });
    expect(await screen.findByText('Reading')).toBeInTheDocument();
    stream.send({ type: 'model', model: 'gemini-2.5-flash' });
    stream.send({
      type: 'result',
      data: {
        occasion: 'wedding',
        totalBudget: null,
        guests: 100,
        eventDate: null,
        vibe: null,
        nonNegotiables: [],
        city: null,
      },
    });
    stream.close();
    expect(await screen.findByText('Answered by Gemini 2.5 Flash')).toBeInTheDocument();
  });
});

describe('live thinking timer', () => {
  it('counts the seconds while Gemini works', async () => {
    vi.useFakeTimers();
    try {
      render(<LiveThinking label="Gemini is thinking…" progress={{ thoughts: [], model: null }} />);
      expect(screen.getByText('0s')).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(screen.getByText('3s')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders nothing extra when the model shared neither thoughts nor its name', () => {
    const { container } = render(<AnswerMeta progress={{ thoughts: [], model: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
