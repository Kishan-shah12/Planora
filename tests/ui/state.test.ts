import { describe, expect, it, vi } from 'vitest';
import { budgetStatus } from '../../src/engine';
import {
  decodePlan,
  encodePlan,
  MAX_SHARE_CHARS,
  planFromHash,
  shareHash,
} from '../../src/state/share';
import { loadInitial, reducer, STORAGE_KEY, type StoreState } from '../../src/state/planStore';
import { parsePlan, planIsConsistent } from '../../src/state/validate';
import { makePlan, makeQuote } from '../helpers';

const fresh = (plan = makePlan()): StoreState => ({ plan, toast: null, seq: 0 });
const toBase64Url = (text: string) =>
  btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('share links', () => {
  it('round-trips a plan, including non-ASCII text', () => {
    const plan = { ...makePlan(), vibe: 'शादी ₹ fun 🎉' };
    const result = decodePlan(encodePlan(plan));
    expect(result).toEqual({ ok: true, plan });
    expect(planFromHash(shareHash(plan))).toEqual({ ok: true, plan });
  });

  it('ignores hashes that are not share links', () => {
    expect(planFromHash('')).toBeNull();
    expect(planFromHash('#section')).toBeNull();
  });

  it('rejects oversized, malformed and invalid payloads', () => {
    expect(decodePlan('A'.repeat(MAX_SHARE_CHARS + 1))).toEqual({ ok: false, reason: 'too_large' });
    expect(decodePlan('not base64!!')).toEqual({ ok: false, reason: 'malformed' });
    expect(decodePlan('****')).toEqual({ ok: false, reason: 'malformed' });
    expect(decodePlan(toBase64Url('{bad json'))).toEqual({ ok: false, reason: 'malformed' });
    expect(decodePlan(toBase64Url(JSON.stringify({ hello: 'world' })))).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(decodePlan('%%%')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects script payloads and plans whose maths do not add up or loop', () => {
    const plan = makePlan();
    const xss = { ...plan, vibe: '<img src=x onerror=alert(1)>' };
    // Text is allowed (React escapes it) but structurally wrong data is not.
    expect(decodePlan(encodePlan(xss)).ok).toBe(true);
    const wrongSum = {
      ...plan,
      allocation: { ...plan.allocation, venue: plan.allocation.venue + 1 },
    };
    expect(decodePlan(encodePlan(wrongSum)).ok).toBe(false);
    const looped = {
      ...plan,
      tasks: plan.tasks.map((t) => (t.id === 'venue' ? { ...t, dependsOn: ['balances'] } : t)),
    };
    expect(planIsConsistent(looped)).toBe(false);
    expect(parsePlan(looped)).toBeNull();
    const ghost = {
      ...plan,
      tasks: plan.tasks.map((t) => (t.id === 'venue' ? { ...t, dependsOn: ['ghost'] } : t)),
    };
    expect(parsePlan(ghost)).toBeNull();
    const dupe = { ...plan, tasks: [...plan.tasks, plan.tasks[0]] };
    expect(parsePlan(dupe)).toBeNull();
    expect(parsePlan(null)).toBeNull();
  });
});

describe('loadInitial', () => {
  const plan = makePlan();
  it('prefers a valid share link, falls back to storage on a bad link', () => {
    const storage = { getItem: vi.fn().mockReturnValue(JSON.stringify(plan)) };
    expect(loadInitial(shareHash({ ...plan, guests: 5 }), storage).plan?.guests).toBe(5);
    expect(loadInitial(shareHash(plan), storage).notice?.kind).toBe('shared');
    const bad = loadInitial('#plan=garbage***', storage);
    expect(bad.notice?.kind).toBe('bad_link');
    expect(bad.plan).toEqual(plan);
    expect(loadInitial(`#plan=${'A'.repeat(MAX_SHARE_CHARS + 1)}`, null).notice?.message).toMatch(
      /too large/,
    );
  });

  it('survives a throwing or empty or corrupt storage', () => {
    expect(
      loadInitial('', {
        getItem: () => {
          throw new Error('denied');
        },
      }).plan,
    ).toBeNull();
    expect(loadInitial('', { getItem: () => null }).plan).toBeNull();
    expect(loadInitial('', { getItem: () => '{corrupt' }).plan).toBeNull();
    expect(loadInitial('', null).plan).toBeNull();
    expect(STORAGE_KEY).toContain('aayojan');
  });
});

describe('reducer', () => {
  it('create and reset', () => {
    const created = reducer(fresh(), { type: 'create', plan: makePlan({ guests: 10 }) });
    expect(created.plan?.guests).toBe(10);
    expect(reducer(created, { type: 'reset' }).plan).toBeNull();
    expect(
      reducer({ plan: null, toast: null, seq: 0 }, { type: 'setGuests', guests: 5 }).plan,
    ).toBeNull();
  });

  it('setAmount redistributes and records a toast; locked categories ignore it', () => {
    const s = fresh();
    const next = reducer(s, {
      type: 'setAmount',
      category: 'photography',
      amount: (s.plan?.allocation.photography ?? 0) + 40_000,
    });
    expect(next.toast?.changes.find((c) => c.category === 'photography')?.delta).toBe(40_000);
    const locked = reducer(reducer(s, { type: 'toggleLock', category: 'decor' }), {
      type: 'setAmount',
      category: 'decor',
      amount: 1,
    });
    expect(locked.plan?.allocation.decor).toBe(s.plan?.allocation.decor);
    expect(
      reducer(s, {
        type: 'setAmount',
        category: 'photography',
        amount: s.plan?.allocation.photography ?? 0,
      }),
    ).toBe(s);
    const capped = reducer(s, { type: 'setAmount', category: 'decor', amount: 99_999_999 });
    expect(capped.toast?.note).toMatch(/Capped at/);
    const unlocked = reducer(
      reducer(reducer(s, { type: 'toggleLock', category: 'decor' }), {
        type: 'toggleLock',
        category: 'decor',
      }),
      { type: 'dismissToast' },
    );
    expect(unlocked.plan?.locked).toEqual([]);
  });

  it('guest, per-plate, total and option actions', () => {
    let s = reducer(fresh(), { type: 'setGuests', guests: 260 });
    expect(budgetStatus(s.plan ?? makePlan()).overBy).toBeGreaterThan(0);
    expect(reducer(s, { type: 'setGuests', guests: 0 }).plan?.guests).toBe(1);
    expect(reducer(s, { type: 'setGuests', guests: 1e9 }).plan?.guests).toBe(100_000);
    s = reducer(s, { type: 'setPerPlate', perPlate: 1 });
    expect(budgetStatus(s.plan ?? makePlan()).overBy).toBe(0);
    expect(reducer(s, { type: 'setPerPlate', perPlate: -5 }).plan?.perPlate).toBe(0);
    expect(reducer(s, { type: 'setTotal', total: 1_000_000 }).plan?.totalBudget).toBe(1_000_000);
    const option = {
      id: 'reduce_guests' as const,
      title: 't',
      description: 'd',
      coversRupees: 1,
      newGuests: 150,
      changes: [],
    };
    const applied = reducer(s, { type: 'applyOption', option });
    expect(applied.plan?.guests).toBe(150);
    expect(applied.toast?.note).toMatch(/150/);
  });

  it('task and quote actions', () => {
    let s = fresh();
    s = reducer(s, { type: 'setTaskStatus', id: 'venue', status: 'done' });
    expect(s.plan?.tasks.find((t) => t.id === 'venue')?.status).toBe('done');
    s = reducer(s, { type: 'setDelay', id: 'caterer', days: 10 });
    expect(s.plan?.tasks.find((t) => t.id === 'caterer')).toMatchObject({
      status: 'delayed',
      delayDays: 10,
    });
    s = reducer(s, { type: 'setDelay', id: 'caterer', days: 9999 });
    expect(s.plan?.tasks.find((t) => t.id === 'caterer')?.delayDays).toBe(365);
    s = reducer(s, { type: 'setDelay', id: 'caterer', days: 0 });
    expect(s.plan?.tasks.find((t) => t.id === 'caterer')?.status).toBe('todo');
    s = reducer(s, { type: 'setAssignee', id: 'venue', assignee: 'x'.repeat(100) });
    expect(s.plan?.tasks.find((t) => t.id === 'venue')?.assignee).toHaveLength(60);

    s = reducer(s, {
      type: 'addQuote',
      quote: makeQuote({ totalPrice: 100 }),
      id: 'a',
      accept: false,
    });
    s = reducer(s, {
      type: 'addQuote',
      quote: makeQuote({ totalPrice: 200 }),
      id: 'b',
      accept: true,
    });
    expect(s.plan?.quotes.filter((q) => q.accepted).map((q) => q.id)).toEqual(['b']);
    s = reducer(s, { type: 'acceptQuote', id: 'a' });
    expect(s.plan?.quotes.filter((q) => q.accepted).map((q) => q.id)).toEqual(['a']);
    s = reducer(s, { type: 'removeQuote', id: 'a' });
    expect(s.plan?.quotes).toHaveLength(1);
    let full = fresh();
    for (const id of ['1', '2', '3'])
      full = reducer(full, { type: 'addQuote', quote: makeQuote(), id, accept: false });
    expect(reducer(full, { type: 'addQuote', quote: makeQuote(), id: '4', accept: false })).toBe(
      full,
    );
  });
});
