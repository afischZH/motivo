/**
 * List params (M2-AP04): pure helpers behind the generic list control, an
 * array of objects edited as a list of items plus a sub-form for the
 * selected item (e.g. the layers of the CSS pattern tool).
 *
 * Everything here is tool-agnostic and works on the schema: which params are
 * lists, how an operation changes the array, and how item lock keys
 * (`<list>.<index>.<field>`) follow their items when the list changes.
 */
import {
  itemLockKey,
  parseItemLockKey,
  type AnyToolDefinition,
  type ListHint,
} from "@musterli/tool-registry";
import * as z from "zod";
import { valuesEqual } from "./values";

export type ListItem = Readonly<Record<string, unknown>>;

/** One structural or field change of a list param. */
export type ListOp =
  | { type: "add"; at?: number }
  | { type: "remove"; index: number }
  | { type: "duplicate"; index: number }
  | { type: "move"; from: number; to: number }
  | { type: "set"; index: number; field: string; value: unknown };

type AnySchema = z.core.$ZodType;

/** Strips wrappers that do not change the shape (optional, default, ...). */
function unwrapSchema(schema: AnySchema): AnySchema {
  let s = schema;
  for (;;) {
    const def = s._zod.def as { innerType?: AnySchema };
    if (!def.innerType) return s;
    s = def.innerType;
  }
}

export interface ListSpec {
  /** Schema of the whole array (validates length and items). */
  schema: z.ZodArray;
  item: z.ZodObject;
  minItems: number;
  maxItems: number;
  hint: ListHint<ListItem>;
}

/** `.min()`/`.max()` of an array schema (also used by the control resolver). */
export function lengthBounds(schema: AnySchema): { min?: number; max?: number } {
  const out: { min?: number; max?: number } = {};
  for (const check of schema._zod.def.checks ?? []) {
    const def = check._zod.def as { check: string; minimum?: number; maximum?: number };
    if (def.check === "min_length" && def.minimum !== undefined) out.min = def.minimum;
    if (def.check === "max_length" && def.maximum !== undefined) out.max = def.maximum;
  }
  return out;
}

/** Hard cap for list params without `.max()`, so the UI and share links stay bounded. */
export const LIST_DEFAULT_MAX = 20;

/** The list spec of a param, or `null` when it is not an array of objects. */
export function listSpec(tool: AnyToolDefinition, key: string): ListSpec | null {
  const raw = (tool.schema.shape as Record<string, AnySchema | undefined>)[key];
  if (!raw) return null;
  const schema = unwrapSchema(raw);
  if (!(schema instanceof z.ZodArray)) return null;
  const element = unwrapSchema(schema.element as AnySchema);
  if (!(element instanceof z.ZodObject)) return null;
  const { min, max } = lengthBounds(schema);
  const hints = tool.controls?.params as
    Record<string, { list?: ListHint<ListItem> } | undefined> | undefined;
  return {
    schema,
    item: element,
    minItems: Math.max(0, min ?? 0),
    maxItems: max ?? LIST_DEFAULT_MAX,
    hint: hints?.[key]?.list ?? {},
  };
}

/** The item "add" inserts: `hint.newItem`, else a copy of the first default item. */
export function newListItem(
  tool: AnyToolDefinition,
  spec: ListSpec,
  key: string,
  items: readonly ListItem[],
): ListItem | undefined {
  if (spec.hint.newItem) return spec.hint.newItem(items);
  const defaults = (tool.defaults as Record<string, unknown>)[key];
  return Array.isArray(defaults) ? (defaults[0] as ListItem | undefined) : undefined;
}

const inRange = (i: number, length: number) => Number.isInteger(i) && i >= 0 && i < length;

/**
 * Applies `op` to `items`. Returns `null` when the op does not apply
 * (index out of range, length limits, no change). `item` is the new item
 * for "add". The caller validates the result against the schema.
 */
export function applyListOp(
  items: readonly ListItem[],
  op: ListOp,
  limits: { minItems: number; maxItems: number },
  item?: ListItem,
): ListItem[] | null {
  const next = [...items];
  switch (op.type) {
    case "add": {
      if (item === undefined || items.length >= limits.maxItems) return null;
      const at = op.at ?? items.length;
      if (!Number.isInteger(at) || at < 0 || at > items.length) return null;
      next.splice(at, 0, item);
      return next;
    }
    case "duplicate": {
      if (!inRange(op.index, items.length) || items.length >= limits.maxItems) return null;
      next.splice(op.index + 1, 0, items[op.index] as ListItem);
      return next;
    }
    case "remove": {
      if (!inRange(op.index, items.length) || items.length <= limits.minItems) return null;
      next.splice(op.index, 1);
      return next;
    }
    case "move": {
      if (!inRange(op.from, items.length) || !inRange(op.to, items.length)) return null;
      if (op.from === op.to) return null;
      const [moved] = next.splice(op.from, 1);
      next.splice(op.to, 0, moved as ListItem);
      return next;
    }
    case "set": {
      if (!inRange(op.index, items.length)) return null;
      const current = items[op.index] as ListItem;
      if (!Object.prototype.hasOwnProperty.call(current, op.field)) return null;
      if (valuesEqual(current[op.field], op.value)) return null;
      next[op.index] = { ...current, [op.field]: op.value };
      return next;
    }
  }
}

/** Index of the item to select after `op` (the new, moved, or a neighbouring item). */
export function selectionAfter(op: ListOp, lengthBefore: number): number {
  switch (op.type) {
    case "add":
      return op.at ?? lengthBefore;
    case "duplicate":
      return op.index + 1;
    case "remove":
      return Math.max(0, Math.min(op.index, lengthBefore - 2));
    case "move":
      return op.to;
    case "set":
      return op.index;
  }
}

/**
 * Where the item at `index` ends up after `op`, or `null` when it is
 * removed. Duplicates are new items, so they have no origin.
 */
function remapIndex(op: ListOp, index: number): number | null {
  switch (op.type) {
    case "add": {
      const at = op.at ?? Number.POSITIVE_INFINITY;
      return index >= at ? index + 1 : index;
    }
    case "duplicate":
      return index > op.index ? index + 1 : index;
    case "remove":
      if (index === op.index) return null;
      return index > op.index ? index - 1 : index;
    case "move": {
      if (index === op.from) return op.to;
      let i = index;
      if (op.from < i) i--;
      if (op.to <= i) i++;
      return i;
    }
    case "set":
      return index;
  }
}

/**
 * Lock keys after `op` on list `key`: item locks follow their item, locks of
 * a removed item are dropped, a duplicate gets the locks of its original.
 * Returns the same set when nothing changes.
 */
export function remapLocks(
  locks: ReadonlySet<string>,
  key: string,
  op: ListOp,
): ReadonlySet<string> {
  if (op.type === "set") return locks;
  const next = new Set<string>();
  let changed = false;
  for (const lock of locks) {
    const path = parseItemLockKey(lock);
    if (!path || path.list !== key) {
      next.add(lock);
      continue;
    }
    const to = remapIndex(op, path.index);
    if (to !== null) next.add(itemLockKey(key, to, path.field));
    if (op.type === "duplicate" && path.index === op.index) {
      next.add(itemLockKey(key, op.index + 1, path.field));
    }
    if (to !== path.index || op.type === "duplicate") changed = true;
  }
  return changed ? next : locks;
}

/** Drops item locks whose item no longer exists (after undo, a variant or a preset). */
export function pruneItemLocks(
  locks: ReadonlySet<string>,
  params: Readonly<Record<string, unknown>>,
): ReadonlySet<string> {
  let next: Set<string> | null = null;
  for (const lock of locks) {
    const path = parseItemLockKey(lock);
    if (!path) continue;
    const list = params[path.list];
    if (Array.isArray(list) && path.index < list.length) continue;
    next ??= new Set(locks);
    next.delete(lock);
  }
  return next ?? locks;
}

/** Whether an item lock key names a lockable field of an existing list param. */
export function isItemLockable(tool: AnyToolDefinition, key: string): boolean {
  const path = parseItemLockKey(key);
  if (!path) return false;
  const spec = listSpec(tool, path.list);
  if (!spec || path.index >= spec.maxItems) return false;
  if (!Object.prototype.hasOwnProperty.call(spec.item.shape, path.field)) return false;
  const hint = (spec.hint.item?.params as Record<string, { lockable?: boolean; kind?: string }>)?.[
    path.field
  ];
  return hint?.lockable !== false && hint?.kind !== "hidden";
}
