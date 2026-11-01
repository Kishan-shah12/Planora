import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildSchedule,
  compressTasks,
  RUN_SHEETS,
  scheduleCompression,
  TASK_TEMPLATES,
} from '../../src/engine';
import { OCCASIONS } from '../../src/schemas';
import { TODAY } from '../helpers';

const templates = (o: (typeof OCCASIONS)[number]) =>
  TASK_TEMPLATES[o].map((t) => ({ ...t, status: 'todo' as const }));

describe('scheduleCompression', () => {
  it('only compresses when the event is closer than the longest lead time', () => {
    const tasks = templates('wedding');
    expect(scheduleCompression(tasks, addDays(TODAY, 200), TODAY)).toMatchObject({
      compressed: false,
      factor: 1,
      spanDays: 180,
    });
    expect(scheduleCompression(tasks, addDays(TODAY, 90), TODAY)).toMatchObject({
      compressed: true,
      factor: 0.5,
      availableDays: 90,
    });
    expect(scheduleCompression(tasks, addDays(TODAY, -5), TODAY).compressed).toBe(false);
    expect(scheduleCompression([], addDays(TODAY, 5), TODAY)).toMatchObject({
      compressed: false,
      spanDays: 0,
    });
  });

  it('leaves tasks untouched when there is enough time', () => {
    const tasks = templates('kids_birthday');
    expect(compressTasks(tasks, addDays(TODAY, 300), TODAY)).toEqual(tasks);
  });
});

describe('compressed schedules (property check over every occasion and many dates)', () => {
  for (const occasion of OCCASIONS) {
    it(`${occasion}: an on-time plan fits between today and the event, in order, never at risk`, () => {
      const tasks = templates(occasion);
      for (let days = 0; days <= 200; days += 3) {
        const eventDate = addDays(TODAY, days);
        const schedule = buildSchedule(tasks, eventDate, TODAY);
        for (const t of schedule) {
          expect(t.dueDate >= TODAY, `${occasion} ${days}d ${t.id}`).toBe(true);
          expect(t.dueDate <= eventDate).toBe(true);
          expect(t.flags).toEqual({
            overdue: false,
            atRisk: false,
            impossible: false,
            tooLate: false,
          });
        }
        const original = new Map(tasks.map((t) => [t.id, t.leadDays]));
        const byLead = [...schedule].sort(
          (a, b) => (original.get(b.id) ?? 0) - (original.get(a.id) ?? 0),
        );
        for (let i = 1; i < byLead.length; i++) {
          expect((byLead[i - 1]?.dueDate ?? '') <= (byLead[i]?.dueDate ?? '')).toBe(true);
        }
      }
    });
  }
});

describe('RUN_SHEETS', () => {
  it.each(OCCASIONS)('%s has a run sheet in time order', (occasion) => {
    const sheet = RUN_SHEETS[occasion];
    expect(sheet.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < sheet.length; i++) {
      expect((sheet[i - 1]?.time ?? '') < (sheet[i]?.time ?? '')).toBe(true);
    }
    expect(sheet.every((item) => /^\d{2}:\d{2}$/.test(item.time))).toBe(true);
  });
});
