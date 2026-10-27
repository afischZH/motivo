import type { AnyToolDefinition, ItemLockKey } from "./types";

const ITEM_LOCK_KEY = /^([^.]+)\.(0|[1-9]\d{0,3})\.([^.]+)$/;

/** Builds the lock key of one item field: `itemLockKey("layers", 1, "color")` = `"layers.1.color"`. */
export function itemLockKey(list: string, index: number, field: string): ItemLockKey {
  return `${list}.${index}.${field}`;
}

/** Splits an `ItemLockKey`; `null` for a plain param key. */
export function parseItemLockKey(
  key: string,
): { list: string; index: number; field: string } | null {
  const m = ITEM_LOCK_KEY.exec(key);
  if (!m) return null;
  return { list: m[1] as string, index: Number(m[2]), field: m[3] as string };
}

const own = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Returns `next` with every locked key copied back from `current`. Use it at
 * the end of `randomize` so lock handling is identical across tools.
 *
 * Understands item locks (`"<list>.<index>.<field>"`): the field is copied
 * into the item at the same index of `next`, when both lists have one.
 * Unknown keys are ignored.
 */
export function keepLocked<P extends object>(next: P, current: P, locks: ReadonlySet<string>): P {
  if (locks.size === 0) return next;
  const out: Record<string, unknown> = { ...(next as unknown as Record<string, unknown>) };
  const cur = current as unknown as Record<string, unknown>;
  const items: string[] = [];
  for (const key of locks) {
    if (own(cur, key)) out[key] = cur[key];
    else items.push(key);
  }
  for (const key of items) {
    const path = parseItemLockKey(key);
    if (!path || locks.has(path.list)) continue;
    const from = cur[path.list];
    const to = out[path.list];
    if (!Array.isArray(from) || !Array.isArray(to)) continue;
    const source = from[path.index] as unknown;
    const target = to[path.index] as unknown;
    if (!isRecord(source) || !isRecord(target) || !own(source, path.field)) continue;
    if (to === (next as unknown as Record<string, unknown>)[path.list]) out[path.list] = [...to];
    (out[path.list] as unknown[])[path.index] = { ...target, [path.field]: source[path.field] };
  }
  return out as unknown as P;
}

/** Whether `locks` holds the whole list or this item's field. */
export function isItemLocked(
  locks: ReadonlySet<string>,
  list: string,
  index: number,
  field: string,
): boolean {
  return locks.has(list) || locks.has(itemLockKey(list, index, field));
}

/**
 * Validates untrusted params (share links, saved designs) for a tool:
 * `tool.migrateParams` first (old shapes), then the schema. Never throws.
 */
export function parseToolParams(
  tool: AnyToolDefinition,
  raw: unknown,
): ReturnType<AnyToolDefinition["schema"]["safeParse"]> {
  let input = raw;
  if (tool.migrateParams && isRecord(raw)) {
    try {
      input = tool.migrateParams(raw);
    } catch {
      input = raw;
    }
  }
  return tool.schema.safeParse(input);
}
