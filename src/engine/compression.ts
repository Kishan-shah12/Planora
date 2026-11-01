import type { Task } from '../schemas';
import { diffDays } from './dates';

export interface Compression {
  /** True when the event is closer than the plan's longest lead time. */
  compressed: boolean;
  /** Share of the usual lead time that is available (1 when not compressed). */
  factor: number;
  availableDays: number;
  spanDays: number;
}

export function scheduleCompression(
  tasks: readonly Task[],
  eventDate: string,
  today: string,
): Compression {
  const spanDays = Math.max(0, ...tasks.map((t) => t.leadDays));
  const availableDays = diffDays(today, eventDate);
  const compressed = availableDays >= 0 && availableDays < spanDays;
  return { compressed, factor: compressed ? availableDays / spanDays : 1, availableDays, spanDays };
}

/**
 * When the event is closer than the usual lead time, pull every task in proportionally so the plan
 * starts today and keeps its order, instead of opening with a wall of overdue tasks. Leads and
 * durations are both rounded down, which keeps every dependency satisfiable (an on-time plan never
 * starts "at risk"). Past events are left alone, so their tasks honestly show as overdue.
 */
export function compressTasks(tasks: readonly Task[], eventDate: string, today: string): Task[] {
  const { compressed, factor } = scheduleCompression(tasks, eventDate, today);
  if (!compressed) return [...tasks];
  return tasks.map((t) => ({
    ...t,
    leadDays: Math.floor(t.leadDays * factor),
    durationDays: Math.floor(t.durationDays * factor),
  }));
}
