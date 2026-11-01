import { useState } from 'react';
import { categoryLabel, type ScheduledTask } from '../engine';
import type { Occasion } from '../schemas';
import { formatDate } from '../lib/format';
import { Icon, type IconName } from './Icon';
import { Field } from './ui';

export interface TaskRowProps {
  task: ScheduledTask;
  occasion: Occasion;
  titles: Record<string, string>;
  /** Title of the delayed task that pushes this one, if any. */
  pushedBy: string | null;
  onStatus: (id: string, status: 'todo' | 'done') => void;
  onDelay: (id: string, days: number) => void;
  onAssignee: (id: string, assignee: string) => void;
}

function Flag({ icon, text }: { icon: IconName; text: string }) {
  return (
    <span className="badge-warn">
      <Icon name={icon} className="h-3 w-3" /> {text}
    </span>
  );
}

export function TaskRow({
  task,
  occasion,
  titles,
  pushedBy,
  onStatus,
  onDelay,
  onAssignee,
}: TaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState(String(task.delayDays ?? 7));
  const done = task.status === 'done';
  const delayed = task.status === 'delayed';
  const shifted = task.effectiveDate !== task.dueDate;
  const problem =
    !done &&
    (task.flags.atRisk || task.flags.overdue || task.flags.impossible || task.flags.tooLate);
  const dayCount = Number(days);
  const daysValid = Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 365;
  const flagged = Boolean(pushedBy) || problem;

  return (
    <li
      className="relative pb-6 pl-8 last:pb-0"
      data-testid={`task-${task.id}`}
      data-affected={pushedBy ? 'true' : undefined}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-paper ${
          done ? 'border-ok bg-ok text-paper' : flagged ? 'border-warn' : 'border-ink-soft/50'
        }`}
      >
        {done && <Icon name="check" className="h-3 w-3" />}
      </span>

      <div
        className={`rounded-2xl border p-4 transition-colors duration-200 ${
          flagged ? 'border-warn/50 bg-warn-soft/50' : 'border-line bg-card'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className={`text-base ${done ? 'text-ink-soft line-through' : ''}`}>
              {task.title}
            </h4>
            <p className="tabular text-sm text-ink-soft">
              {categoryLabel(occasion, task.category)} · Due {formatDate(task.dueDate)}
              {shifted && !done && <> · Now expected {formatDate(task.effectiveDate)}</>}
            </p>
          </div>
          <span className={done ? 'badge-verified' : 'badge-estimate'}>
            {done && <Icon name="check" className="h-3 w-3" />}
            {done ? 'Done' : delayed ? `Delayed ${task.delayDays} days` : 'To do'}
          </span>
        </div>

        {flagged && (
          <div className="mt-2 flex flex-wrap gap-2">
            {pushedBy && <Flag icon="alert" text={`Pushed by delay in "${pushedBy}"`} />}
            {task.flags.overdue && !done && <Flag icon="clock" text="Overdue" />}
            {task.flags.tooLate && !task.flags.overdue && !done && (
              <Flag icon="clock" text="Due date already passed" />
            )}
            {task.flags.atRisk && !pushedBy && !done && <Flag icon="alert" text="At risk" />}
            {task.flags.impossible && !done && (
              <Flag icon="stop" text="Cannot finish before the event" />
            )}
          </div>
        )}

        {task.dependsOn.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-soft">Needs:</span>
            {task.dependsOn.map((d) => (
              <span
                key={d}
                className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs"
              >
                {titles[d] ?? d}
              </span>
            ))}
          </p>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Assignee">
            {(p) => (
              <input
                {...p}
                className="input"
                maxLength={60}
                placeholder="Who is handling this?"
                value={task.assignee ?? ''}
                onChange={(e) => onAssignee(task.id, e.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              aria-pressed={done}
              onClick={() => onStatus(task.id, done ? 'todo' : 'done')}
            >
              {done ? 'Mark as to do' : 'Done'}
            </button>
            {!done && !editing && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                {delayed ? 'Change delay' : 'Mark delayed'}
              </button>
            )}
          </div>
        </div>

        {editing && !done && (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper p-3">
            <Field label="Delayed by (days)" error={daysValid ? null : 'Enter 1 to 365 days.'}>
              {(p) => (
                <input
                  {...p}
                  className="input w-32"
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              )}
            </Field>
            <button
              type="button"
              className="btn-primary"
              disabled={!daysValid}
              onClick={() => {
                onDelay(task.id, dayCount);
                setEditing(false);
              }}
            >
              Apply delay
            </button>
            {delayed && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  onDelay(task.id, 0);
                  setEditing(false);
                }}
              >
                Clear delay
              </button>
            )}
            <button type="button" className="btn-quiet" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
