import type { Task } from '../schemas';
import { compressTasks } from './compression';
import { addDays, diffDays } from './dates';

export class ScheduleError extends Error {
  readonly kind: 'cycle' | 'unknown_dependency';
  readonly ids: string[];
  constructor(kind: 'cycle' | 'unknown_dependency', ids: string[]) {
    super(
      kind === 'cycle'
        ? `Circular task dependency: ${ids.join(' -> ')}`
        : `Unknown dependency: ${ids.join(', ')}`,
    );
    this.name = 'ScheduleError';
    this.kind = kind;
    this.ids = ids;
  }
}

/** The tasks a task depends on; ids that match no task are skipped. */
function dependenciesOf(task: Task, byId: ReadonlyMap<string, Task>): Task[] {
  return task.dependsOn.flatMap((id) => {
    const dep = byId.get(id);
    return dep ? [dep] : [];
  });
}

/** Returns the ids of one dependency cycle (first id repeated at the end), or [] when acyclic. */
export function detectCycles(tasks: readonly Task[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (task: Task): string[] => {
    state.set(task.id, 1);
    stack.push(task.id);
    for (const dep of dependenciesOf(task, byId)) {
      if (state.get(dep.id) === 1) return [...stack.slice(stack.indexOf(dep.id)), dep.id];
      if (!state.has(dep.id)) {
        const found = visit(dep);
        if (found.length) return found;
      }
    }
    stack.pop();
    state.set(task.id, 2);
    return [];
  };
  for (const t of tasks) {
    if (!state.has(t.id)) {
      const found = visit(t);
      if (found.length) return found;
    }
  }
  return [];
}

/** Dependencies first. Throws ScheduleError on cycles or unknown dependency ids. */
function topoOrder(tasks: readonly Task[]): Task[] {
  const ids = new Set(tasks.map((t) => t.id));
  const unknown = tasks.flatMap((t) => t.dependsOn.filter((d) => !ids.has(d)));
  if (unknown.length) throw new ScheduleError('unknown_dependency', [...new Set(unknown)]);
  const cycle = detectCycles(tasks);
  if (cycle.length) throw new ScheduleError('cycle', cycle);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const out: Task[] = [];
  const visit = (t: Task) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    dependenciesOf(t, byId).forEach(visit);
    out.push(t);
  };
  tasks.forEach(visit);
  return out;
}

interface Offset {
  task: Task;
  /** Effective day relative to the event (negative = before it). */
  offset: number;
}

/** Effective offsets in dependency order; dependencies are always computed first. */
function effectiveOffsets(ordered: readonly Task[]): Offset[] {
  const eff = new Map<string, number>();
  return ordered.map((t) => {
    const delay = t.status === 'done' ? 0 : (t.delayDays ?? 0);
    const depOffsets = t.dependsOn
      .map((d) => eff.get(d))
      .filter((v): v is number => v !== undefined);
    const depEnd = Math.max(Number.NEGATIVE_INFINITY, ...depOffsets) + t.durationDays;
    const offset = t.status === 'done' ? -t.leadDays : Math.max(-t.leadDays + delay, depEnd);
    eff.set(t.id, offset);
    return { task: t, offset };
  });
}

const offsetsById = (list: readonly Offset[]) =>
  new Map(list.map(({ task, offset }) => [task.id, offset]));

export interface ScheduledTask extends Task {
  dueDate: string;
  effectiveDate: string;
  flags: { overdue: boolean; atRisk: boolean; impossible: boolean; tooLate: boolean };
}

/**
 * Dates for every task, delay-aware. When the event is closer than the usual lead time the plan is
 * compressed first (see compressTasks), so the returned lead times may be shorter than the template.
 */
export function buildSchedule(
  tasks: readonly Task[],
  eventDate: string,
  today: string,
): ScheduledTask[] {
  const ordered = topoOrder(compressTasks(tasks, eventDate, today));
  return effectiveOffsets(ordered).map(({ task: t, offset }) => {
    const dueDate = addDays(eventDate, -t.leadDays);
    const effectiveDate = addDays(eventDate, offset);
    const done = t.status === 'done';
    return {
      ...t,
      dueDate,
      effectiveDate,
      flags: {
        overdue: !done && diffDays(effectiveDate, today) > 0,
        atRisk: !done && effectiveDate > dueDate,
        impossible: !done && effectiveDate > eventDate,
        tooLate: !done && dueDate < today,
      },
    };
  });
}

/** Ids of downstream tasks whose effective date moves if `taskId` slips by `delayDays`. */
export function propagateDelay(
  tasks: readonly Task[],
  taskId: string,
  delayDays: number,
): string[] {
  const ordered = topoOrder(tasks);
  const before = offsetsById(effectiveOffsets(ordered));
  const days = Math.max(0, Math.floor(delayDays));
  const after = offsetsById(
    effectiveOffsets(
      ordered.map((t) =>
        t.id === taskId
          ? { ...t, status: t.status === 'done' ? 'todo' : t.status, delayDays: days }
          : t,
      ),
    ),
  );
  return ordered
    .filter((t) => t.id !== taskId && after.get(t.id) !== before.get(t.id))
    .map((t) => t.id);
}

/** Maps each downstream task id to the id of the delayed task that pushes it. */
export function affectedByDelays(tasks: readonly Task[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const delayed of tasks) {
    const days = delayed.delayDays ?? 0;
    if (delayed.status !== 'delayed' || days <= 0) continue;
    const baseline = tasks.map((t) =>
      t.id === delayed.id ? { ...t, status: 'todo' as const, delayDays: 0 } : t,
    );
    for (const id of propagateDelay(baseline, delayed.id, days)) out[id] ??= delayed.id;
  }
  return out;
}

export interface Phase {
  key: string;
  label: string;
  order: number;
}

const PHASES: { min: number; phase: Phase }[] = [
  { min: 120, phase: { key: 'p1', label: '4+ months out', order: 1 } },
  { min: 60, phase: { key: 'p2', label: '2 to 4 months out', order: 2 } },
  { min: 30, phase: { key: 'p3', label: '1 to 2 months out', order: 3 } },
  { min: 8, phase: { key: 'p4', label: 'Final month', order: 4 } },
];
const FINAL_WEEK: Phase = { key: 'p5', label: 'Final week', order: 5 };

/** Chunks tasks into a few phases by how many days before the event they are due. */
export function phaseFor(leadDays: number): Phase {
  return PHASES.find((p) => leadDays >= p.min)?.phase ?? FINAL_WEEK;
}
