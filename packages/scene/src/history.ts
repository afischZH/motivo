/**
 * Undo/redo history of immutable states, like the tool editor's: at most
 * 100 steps, and consecutive changes with the same key within 500 ms (a
 * slider drag, typing, arrow-key nudges) are merged into one step. Pure:
 * the caller passes the time.
 */
export const HISTORY_LIMIT = 100;
export const HISTORY_MERGE_MS = 500;

export interface History<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
  /** Key and time of the last change, for merging. */
  lastKey: string | null;
  lastAt: number;
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: -Infinity };
}

/**
 * Records `next` as the new present. With a `key` equal to the previous
 * change's within `HISTORY_MERGE_MS`, the change joins the previous step.
 */
export function pushHistory<T>(
  history: History<T>,
  next: T,
  now: number,
  key: string | null = null,
): History<T> {
  if (Object.is(next, history.present)) return history;
  const merge = key !== null && key === history.lastKey && now - history.lastAt <= HISTORY_MERGE_MS;
  if (merge) return { ...history, present: next, future: [], lastAt: now };
  const past = [...history.past, history.present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: key, lastAt: now };
}

/** Ends the current merge window (slider released, field left). */
export function commitHistory<T>(history: History<T>): History<T> {
  return history.lastKey === null ? history : { ...history, lastKey: null };
}

export function canUndo(history: History<unknown>): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History<unknown>): boolean {
  return history.future.length > 0;
}

export function undoHistory<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastKey: null,
    lastAt: -Infinity,
  };
}

export function redoHistory<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
    lastKey: null,
    lastAt: -Infinity,
  };
}

/** Replaces the present without a new step (e.g. a loaded design). */
export function resetHistory<T>(present: T): History<T> {
  return createHistory(present);
}
