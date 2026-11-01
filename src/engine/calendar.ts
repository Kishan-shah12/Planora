import type { Plan } from '../schemas';
import { addDays } from './dates';
import { OCCASION_LABELS, categoryLabel } from './presets';
import type { ScheduledTask } from './timeline';

/** RFC 5545 text escaping: backslash, semicolon, comma and newlines. */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds lines longer than 75 characters, as calendar apps expect. */
function fold(line: string): string {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 74) parts.push(line.slice(i, i + 74));
  return parts.join('\r\n ');
}

const compact = (iso: string) => iso.replace(/-/g, '');

function allDayEvent(
  uid: string,
  stamp: string,
  date: string,
  summary: string,
  description: string,
) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${compact(stamp)}T000000Z`,
    `DTSTART;VALUE=DATE:${compact(date)}`,
    `DTEND;VALUE=DATE:${compact(addDays(date, 1))}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'END:VEVENT',
  ];
}

/**
 * Calendar file for the event and every open task on its current (delay-aware) date, so the plan
 * can live in the family's phone calendar. `stamp` (YYYY-MM-DD) is injected to keep this pure.
 */
export function timelineToIcs(
  plan: Plan,
  schedule: readonly ScheduledTask[],
  stamp: string,
): string {
  const occasion = OCCASION_LABELS[plan.occasion];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aayojan//Celebration planner//EN',
    'CALSCALE:GREGORIAN',
    ...allDayEvent(
      `event-${plan.eventDate}@aayojan`,
      stamp,
      plan.eventDate,
      `${occasion} day`,
      `${plan.guests} guests. Planned with Aayojan.`,
    ),
  ];
  for (const task of schedule) {
    if (task.status === 'done') continue;
    const owner = task.assignee ? ` Owner: ${task.assignee}.` : '';
    lines.push(
      ...allDayEvent(
        `${task.id}-${plan.eventDate}@aayojan`,
        stamp,
        task.effectiveDate,
        task.title,
        `${occasion}: ${categoryLabel(plan.occasion, task.category)}.${owner}`,
      ),
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
