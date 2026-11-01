import { useEffect, useReducer } from 'react';
import {
  acceptQuote,
  addQuote,
  applyOption,
  formatINR,
  redistribute,
  removeQuote,
  setTotalBudget,
  toggleContacted,
  type BudgetChange,
  type TradeoffOption,
} from '../engine';
import { MAX_GUESTS, type Category, type Plan, type Quote } from '../schemas';
import { planFromHash } from './share';
import { parsePlan } from './validate';

export const STORAGE_KEY = 'aayojan.plan.v1';

export interface ToastData {
  key: number;
  changes: BudgetChange[];
  note?: string;
}

export interface StoreState {
  plan: Plan | null;
  toast: ToastData | null;
  seq: number;
}

export type Action =
  | { type: 'create'; plan: Plan }
  | { type: 'reset' }
  | { type: 'setAmount'; category: Category; amount: number }
  | { type: 'toggleLock'; category: Category }
  | { type: 'toggleContacted'; category: Category }
  | { type: 'setGuests'; guests: number }
  | { type: 'setPerPlate'; perPlate: number }
  | { type: 'setTotal'; total: number }
  | { type: 'applyOption'; option: TradeoffOption }
  | { type: 'setTaskStatus'; id: string; status: 'todo' | 'done' }
  | { type: 'setDelay'; id: string; days: number }
  | { type: 'setAssignee'; id: string; assignee: string }
  | { type: 'addQuote'; quote: Quote; id: string; accept: boolean }
  | { type: 'acceptQuote'; id: string }
  | { type: 'removeQuote'; id: string }
  | { type: 'dismissToast' };

function withPlan(state: StoreState, plan: Plan, toast?: Omit<ToastData, 'key'>): StoreState {
  const seq = state.seq + 1;
  return { plan, seq, toast: toast ? { ...toast, key: seq } : state.toast };
}

export function reducer(state: StoreState, action: Action): StoreState {
  if (action.type === 'create') return { plan: action.plan, toast: null, seq: state.seq + 1 };
  if (action.type === 'reset') return { plan: null, toast: null, seq: state.seq + 1 };
  if (action.type === 'dismissToast') return { ...state, toast: null };
  const plan = state.plan;
  if (!plan) return state;

  switch (action.type) {
    case 'setAmount': {
      if (plan.locked.includes(action.category)) return state;
      const result = redistribute(plan.allocation, action.category, action.amount, plan.locked);
      if (result.changes.length === 0 && !result.capped) return state;
      const note = result.capped
        ? `Capped at ${formatINR(result.applied)}. Unlock other categories to go further.`
        : undefined;
      return withPlan(
        state,
        { ...plan, allocation: result.allocation },
        { changes: result.changes, note },
      );
    }
    case 'toggleLock': {
      const locked = plan.locked.includes(action.category)
        ? plan.locked.filter((c) => c !== action.category)
        : [...plan.locked, action.category];
      return withPlan(state, { ...plan, locked });
    }
    case 'toggleContacted':
      return withPlan(state, toggleContacted(plan, action.category));
    case 'setGuests':
      return withPlan(state, {
        ...plan,
        guests: Math.min(MAX_GUESTS, Math.max(1, Math.floor(action.guests))),
      });
    case 'setPerPlate':
      return withPlan(state, { ...plan, perPlate: Math.max(0, action.perPlate) });
    case 'setTotal':
      return withPlan(state, setTotalBudget(plan, action.total));
    case 'applyOption': {
      const next = applyOption(plan, action.option);
      const note =
        action.option.newGuests != null
          ? `Guest count is now ${action.option.newGuests}.`
          : undefined;
      return withPlan(state, next, { changes: action.option.changes, note });
    }
    case 'setTaskStatus':
      return withPlan(state, {
        ...plan,
        tasks: plan.tasks.map((t) =>
          t.id === action.id ? { ...t, status: action.status, delayDays: undefined } : t,
        ),
      });
    case 'setDelay':
      return withPlan(state, {
        ...plan,
        tasks: plan.tasks.map((t) =>
          t.id === action.id
            ? action.days > 0
              ? {
                  ...t,
                  status: 'delayed' as const,
                  delayDays: Math.min(365, Math.floor(action.days)),
                }
              : { ...t, status: 'todo' as const, delayDays: undefined }
            : t,
        ),
      });
    case 'setAssignee':
      return withPlan(state, {
        ...plan,
        tasks: plan.tasks.map((t) =>
          t.id === action.id ? { ...t, assignee: action.assignee.slice(0, 60) } : t,
        ),
      });
    case 'addQuote': {
      const added = addQuote(plan, action.quote, action.id);
      if (!added.added) return state;
      return withPlan(state, action.accept ? acceptQuote(added.plan, action.id) : added.plan);
    }
    case 'acceptQuote':
      return withPlan(state, acceptQuote(plan, action.id));
    case 'removeQuote':
      return withPlan(state, removeQuote(plan, action.id));
  }
}

export interface InitialLoad {
  plan: Plan | null;
  notice: { kind: 'shared' | 'bad_link'; message: string } | null;
}

/** Share link wins over autosave; both are validated before use. Storage failures are ignored. */
export function loadInitial(hash: string, storage: Pick<Storage, 'getItem'> | null): InitialLoad {
  const shared = planFromHash(hash);
  if (shared) {
    return shared.ok
      ? {
          plan: shared.plan,
          notice: {
            kind: 'shared',
            message: 'Opened a shared plan. Your changes stay in this browser.',
          },
        }
      : {
          plan: loadStored(storage),
          notice: {
            kind: 'bad_link',
            message:
              shared.reason === 'too_large'
                ? 'That share link is too large to open.'
                : 'That share link could not be opened. It may be damaged or from another version.',
          },
        };
  }
  return { plan: loadStored(storage), notice: null };
}

function loadStored(storage: Pick<Storage, 'getItem'> | null): Plan | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? parsePlan(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function usePlanStore(initial: InitialLoad) {
  const [state, dispatch] = useReducer(reducer, { plan: initial.plan, toast: null, seq: 0 });

  useEffect(() => {
    try {
      const storage = safeStorage();
      if (!storage) return;
      if (state.plan) storage.setItem(STORAGE_KEY, JSON.stringify(state.plan));
      else storage.removeItem(STORAGE_KEY);
    } catch {
      // Autosave is best effort: private mode or a full disk must never break the app.
    }
  }, [state.plan]);

  return { state, dispatch };
}

export { safeStorage };
