import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildSchedule,
  detectCycles,
  diffDays,
  fromDayNumber,
  isValidISO,
  phaseFor,
  propagateDelay,
  ScheduleError,
  TASK_TEMPLATES,
  toDayNumber,
} from '../../src/engine';
import { OCCASIONS, type Task } from '../../src/schemas';
import { makePlan, EVENT, TODAY } from '../helpers';

const task = (
  id: string,
  lead: number,
  dur: number,
  deps: string[] = [],
  over: Partial<Task> = {},
): Task => ({
  id,
  title: id,
  category: 'misc',
  leadDays: lead,
  durationDays: dur,
  dependsOn: deps,
  status: 'todo',
  ...over,
});

describe('dates', () => {
  it('adds, diffs and validates', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-01-01', '2026-01-31')).toBe(30);
    expect(fromDayNumber(toDayNumber('2026-07-15'))).toBe('2026-07-15');
    expect(isValidISO('2026-02-30')).toBe(false);
    expect(isValidISO('26-1-1')).toBe(false);
    expect(isValidISO('2026-07-15')).toBe(true);
  });
});

describe('templates', () => {
  it.each(OCCASIONS)('%s has 8-14 acyclic tasks with valid dependencies', (o) => {
    const tasks = TASK_TEMPLATES[o];
    expect(tasks.length).toBeGreaterThanOrEqual(8);
    expect(tasks.length).toBeLessThanOrEqual(14);
    expect(detectCycles(tasks.map((t) => ({ ...t, status: 'todo' as const })))).toEqual([]);
  });

  it.each(OCCASIONS)('%s on-time plan has no at-risk or impossible tasks', (o) => {
    const plan = makePlan({}, o);
    const schedule = buildSchedule(plan.tasks, '2027-06-01', '2026-01-01');
    for (const s of schedule) {
      expect(s.flags.atRisk).toBe(false);
      expect(s.flags.impossible).toBe(false);
      expect(s.effectiveDate).toBe(s.dueDate);
    }
  });
});

describe('detectCycles', () => {
  it('finds a cycle and returns [] otherwise', () => {
    expect(detectCycles([task('a', 10, 1, ['b']), task('b', 20, 1, ['a'])]).length).toBeGreaterThan(
      0,
    );
    expect(detectCycles([task('a', 10, 1, ['a'])]).length).toBeGreaterThan(0);
    expect(detectCycles([task('a', 10, 1), task('b', 5, 1, ['a'])])).toEqual([]);
    expect(detectCycles([task('a', 10, 1, ['ghost'])])).toEqual([]);
    expect(detectCycles([])).toEqual([]);
  });

  it('buildSchedule throws typed errors', () => {
    expect(() =>
      buildSchedule([task('a', 10, 1, ['b']), task('b', 20, 1, ['a'])], EVENT, TODAY),
    ).toThrow(ScheduleError);
    try {
      buildSchedule([task('a', 10, 1, ['b']), task('b', 20, 1, ['a'])], EVENT, TODAY);
    } catch (e) {
      expect(e).toBeInstanceOf(ScheduleError);
      expect((e as ScheduleError).kind).toBe('cycle');
    }
    expect(() => buildSchedule([task('a', 10, 1, ['ghost'])], EVENT, TODAY)).toThrow(
      /Unknown dependency/,
    );
    expect(() => propagateDelay([task('a', 10, 1, ['ghost'])], 'a', 3)).toThrow(ScheduleError);
  });
});

describe('buildSchedule', () => {
  it('computes due dates from lead days and orders dependencies first', () => {
    const s = buildSchedule(
      [task('b', 10, 2, ['a']), task('a', 30, 1)],
      '2026-07-15',
      '2026-01-01',
    );
    expect(s.map((t) => t.id)).toEqual(['a', 'b']);
    expect(s[0]?.dueDate).toBe('2026-06-15');
    expect(s[1]?.dueDate).toBe('2026-07-05');
  });

  it('a delay pushes dependents and flags them at risk', () => {
    const tasks = [
      task('a', 30, 1, [], { status: 'delayed', delayDays: 25 }),
      task('b', 10, 2, ['a']),
    ];
    const s = buildSchedule(tasks, '2026-07-15', '2026-01-01');
    const b = s.find((t) => t.id === 'b');
    expect(b?.effectiveDate).toBe('2026-07-12');
    expect(b?.flags.atRisk).toBe(true);
    expect(s.find((t) => t.id === 'a')?.flags.atRisk).toBe(true);
  });

  it('flags impossible when a delay runs past the event', () => {
    const s = buildSchedule(
      [task('a', 5, 1, [], { status: 'delayed', delayDays: 30 })],
      '2026-07-15',
      '2026-01-01',
    );
    expect(s[0]?.flags.impossible).toBe(true);
  });

  it('flags overdue and tooLate for past-due tasks, but not done ones', () => {
    const tasks = [task('a', 30, 1), task('b', 30, 1, [], { status: 'done' })];
    const s = buildSchedule(tasks, '2026-07-05', '2026-07-10');
    expect(s[0]?.flags).toMatchObject({ overdue: true, tooLate: true });
    expect(s[1]?.flags).toEqual({
      overdue: false,
      atRisk: false,
      impossible: false,
      tooLate: false,
    });
  });

  it('handles an event date today or in the past', () => {
    const today = buildSchedule(
      TASK_TEMPLATES.kids_birthday.map((t) => ({ ...t, status: 'todo' as const })),
      '2026-01-01',
      '2026-01-01',
    );
    expect(today.every((t) => t.flags.tooLate || t.leadDays === 0)).toBe(true);
    const past = buildSchedule(
      TASK_TEMPLATES.kids_birthday.map((t) => ({ ...t, status: 'todo' as const })),
      '2025-01-01',
      '2026-01-01',
    );
    expect(past.every((t) => t.flags.overdue)).toBe(true);
  });

  it('empty task list is fine', () => {
    expect(buildSchedule([], EVENT, TODAY)).toEqual([]);
  });
});

describe('propagateDelay', () => {
  it('returns downstream tasks only', () => {
    const tasks = [
      task('a', 40, 1),
      task('b', 30, 2, ['a']),
      task('c', 20, 1, ['b']),
      task('d', 25, 1),
    ];
    const affected = propagateDelay(tasks, 'a', 20);
    expect(affected).toEqual(['b', 'c']);
    expect(propagateDelay(tasks, 'a', 0)).toEqual([]);
    expect(propagateDelay(tasks, 'd', 5)).toEqual([]);
  });

  it('a small delay absorbed by slack affects nothing', () => {
    const tasks = [task('a', 40, 1), task('b', 20, 1, ['a'])];
    expect(propagateDelay(tasks, 'a', 3)).toEqual([]);
  });

  it('re-delaying a done task still propagates', () => {
    const tasks = [task('a', 40, 1, [], { status: 'done' }), task('b', 30, 2, ['a'])];
    expect(propagateDelay(tasks, 'a', 30)).toEqual(['b']);
  });
});

describe('phaseFor', () => {
  it('chunks lead days into five phases', () => {
    expect(phaseFor(180).label).toBe('4+ months out');
    expect(phaseFor(90).order).toBe(2);
    expect(phaseFor(45).order).toBe(3);
    expect(phaseFor(20).label).toBe('Final month');
    expect(phaseFor(2).label).toBe('Final week');
    expect(phaseFor(-3).order).toBe(5);
  });
});

describe('affectedByDelays', () => {
  it('maps downstream tasks to the delayed task that pushes them', async () => {
    const { affectedByDelays } = await import('../../src/engine');
    const tasks = [
      task('a', 40, 1, [], { status: 'delayed', delayDays: 20 }),
      task('b', 30, 2, ['a']),
      task('c', 5, 1, ['b']),
      task('d', 25, 1),
    ];
    expect(affectedByDelays(tasks)).toEqual({ b: 'a' });
    expect(affectedByDelays(tasks.map((t) => ({ ...t, status: 'todo' as const })))).toEqual({});
  });
});
