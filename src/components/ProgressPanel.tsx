import { useEffect, useRef } from 'react';
import { planReadiness, vendorChecklist, VENDOR_STATUS_LABELS } from '../engine';
import type { Plan } from '../schemas';
import { Icon } from './Icon';

const TASK_LABEL = { todo: 'To do', done: 'Done', delayed: 'Delayed' } as const;

function Tick({ done, warn = false }: { done: boolean; warn?: boolean }) {
  return done ? (
    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
  ) : (
    <Icon
      name={warn ? 'alert' : 'circle'}
      className={`mt-0.5 h-4 w-4 shrink-0 ${warn ? 'text-warn' : 'text-ink-soft'}`}
    />
  );
}

/**
 * Everything still open, in one place: timeline tasks and vendor quotations, each with a text
 * status (never colour alone). A drawer the family can open from any tab and hide again.
 */
export function ProgressPanel({
  plan,
  open,
  onToggle,
  onNavigate,
}: {
  plan: Plan;
  open: boolean;
  onToggle: () => void;
  onNavigate: (tab: 'timeline' | 'vendors') => void;
}) {
  const readiness = planReadiness(plan);
  const vendors = vendorChecklist(plan);
  const tasks = [...plan.tasks].sort(
    (a, b) => Number(a.status === 'done') - Number(b.status === 'done'),
  );
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onToggle();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onToggle]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
    else if (wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="no-print fixed bottom-4 left-4 z-30 flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold shadow-md"
        aria-expanded={open}
        aria-controls="progress-panel"
        onClick={onToggle}
      >
        <Icon name="route" />
        Progress {readiness.percent}%
      </button>

      <aside
        id="progress-panel"
        aria-label="Plan progress"
        hidden={!open}
        className={`no-print fixed inset-y-0 left-0 z-40 ${open ? 'flex' : 'hidden'} w-[min(22rem,100vw)] flex-col border-r border-line bg-card shadow-xl`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-lg">Plan progress</h2>
          <button ref={closeRef} type="button" className="btn-secondary" onClick={onToggle}>
            <Icon name="x" />
            Hide
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
          <p className="text-sm">
            <strong>{readiness.percent}% ready.</strong> {readiness.tasksDone} of{' '}
            {readiness.tasksTotal} tasks done, {readiness.quotesVerified} of {readiness.quotesTotal}{' '}
            vendors confirmed.
          </p>

          <section aria-labelledby="progress-vendors">
            <div className="flex items-center justify-between gap-2">
              <h3 id="progress-vendors">Vendors and quotations</h3>
              <button type="button" className="btn-quiet" onClick={() => onNavigate('vendors')}>
                Open
              </button>
            </div>
            <ul className="mt-2 space-y-2">
              {vendors.map((item) => (
                <li key={item.category} className="flex gap-2 text-sm">
                  <Tick done={item.status === 'quote_accepted'} />
                  <span>
                    <span className="font-medium">{item.label}</span>
                    <span className="block text-xs text-ink-soft">
                      {VENDOR_STATUS_LABELS[item.status]}
                      {item.quotes > 0 && ` · ${item.quotes} saved`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="progress-tasks">
            <div className="flex items-center justify-between gap-2">
              <h3 id="progress-tasks">Timeline tasks</h3>
              <button type="button" className="btn-quiet" onClick={() => onNavigate('timeline')}>
                Open
              </button>
            </div>
            <ul className="mt-2 space-y-2">
              {tasks.map((task) => (
                <li key={task.id} className="flex gap-2 text-sm">
                  <Tick done={task.status === 'done'} warn={task.status === 'delayed'} />
                  <span>
                    <span className={task.status === 'done' ? 'text-ink-soft line-through' : ''}>
                      {task.title}
                    </span>
                    <span className="block text-xs text-ink-soft">{TASK_LABEL[task.status]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </>
  );
}
