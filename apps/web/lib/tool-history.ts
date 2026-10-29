/**
 * Favourite and recently used tools (W1-AP03), only in this browser
 * (localStorage, no server, no cookie). Ids are kept as written; callers
 * show only ids they know (the registry may drop a tool), so a stale or
 * hand-edited entry is never trusted beyond being a string.
 */

export const RECENT_TOOLS_KEY = "musterli.recent-tools";
export const FAVORITE_TOOLS_KEY = "musterli.favorite-tools";
/** How many recent tools are remembered. */
export const RECENT_TOOLS_MAX = 6;
/** More favourites than tools exist today; a cap keeps a hand-edited entry small. */
export const FAVORITE_TOOLS_MAX = 100;

/** Fired on this page after a change (the `storage` event covers other tabs). */
const CHANGE_EVENT = "musterli:tool-history";

const ID = /^[a-z0-9-]{1,64}$/;

/** A list of unique tool ids from stored JSON; anything else is an empty list. */
export function parseToolIds(raw: string | null, max: number): string[] {
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !ID.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/** `id` first, without duplicates, at most `max`. */
export function withRecent(list: readonly string[], id: string, max = RECENT_TOOLS_MAX): string[] {
  return [id, ...list.filter((other) => other !== id)].slice(0, max);
}

/** `list` with `id` added at the end, or removed if it was there. */
export function toggledFavorite(list: readonly string[], id: string): string[] {
  return list.includes(id)
    ? list.filter((other) => other !== id)
    : [...list, id].slice(-FAVORITE_TOOLS_MAX);
}

function read(key: string, max: number): string[] {
  try {
    return parseToolIds(window.localStorage.getItem(key), max);
  } catch {
    // Storage blocked (private mode): nothing remembered.
    return [];
  }
}

function write(key: string, list: readonly string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage blocked or full: the page works without the history.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export const readRecentTools = () => read(RECENT_TOOLS_KEY, RECENT_TOOLS_MAX);
export const readFavoriteTools = () => read(FAVORITE_TOOLS_KEY, FAVORITE_TOOLS_MAX);

export function recordToolVisit(id: string): void {
  if (!ID.test(id)) return;
  write(RECENT_TOOLS_KEY, withRecent(readRecentTools(), id));
}

export function toggleFavoriteTool(id: string): void {
  if (!ID.test(id)) return;
  write(FAVORITE_TOOLS_KEY, toggledFavorite(readFavoriteTools(), id));
}

/** Calls `onChange` after any change in this tab or another one. */
export function subscribeToolHistory(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === RECENT_TOOLS_KEY || event.key === FAVORITE_TOOLS_KEY) {
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
