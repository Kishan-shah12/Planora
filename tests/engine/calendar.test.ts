import { describe, expect, it } from 'vitest';
import { buildSchedule, escapeIcsText, timelineToIcs } from '../../src/engine';
import { makePlan, TODAY } from '../helpers';

describe('timelineToIcs', () => {
  const plan = makePlan();
  const schedule = buildSchedule(plan.tasks, plan.eventDate, TODAY);

  it('builds a valid calendar with the event and every open task', () => {
    const ics = timelineToIcs(plan, schedule, TODAY);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(plan.tasks.length + 1);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260715');
    expect(ics).toContain('SUMMARY:Wedding day');
    expect(ics).toContain('DTSTAMP:20260101T000000Z');
    expect(ics.split('\r\n').every((line) => line.length <= 75)).toBe(true);
  });

  it('uses the delay-aware date, skips done tasks and names the owner', () => {
    const tasks = plan.tasks.map((t) =>
      t.id === 'venue'
        ? { ...t, status: 'done' as const }
        : t.id === 'caterer'
          ? { ...t, status: 'delayed' as const, delayDays: 10, assignee: 'Mama, ji' }
          : t,
    );
    const ics = timelineToIcs(
      { ...plan, tasks },
      buildSchedule(tasks, plan.eventDate, TODAY),
      TODAY,
    );
    expect(ics).not.toContain('UID:venue-');
    expect(ics).toContain(String.raw`Owner: Mama\, ji.`);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(plan.tasks.length);
  });

  it('escapes special characters', () => {
    expect(escapeIcsText('a;b,c\\d\ne')).toBe(String.raw`a\;b\,c\\d\ne`);
  });
});
