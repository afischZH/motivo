/**
 * Brand palettes in every tool (M3-AP06). Generic: a tool's colour params
 * are found from its schema and control hints, so a new tool gets "apply
 * brand palette" without any code. A tool may refine the mapping with
 * `ToolDefinition.brandPalette` (e.g. the palette generator also sets how
 * many swatches it shows).
 *
 * Generic mapping of a brand palette `colors` (2 to 10 hex colours):
 *  - every palette param (`kind: "palette"`) gets the whole palette, cut to
 *    its schema maximum or repeated up to its minimum;
 *  - colour params (`kind: "color"`) take the colours in order, one each
 *    (`color1` to `color8` become the palette, a single accent colour the
 *    first brand colour), starting over when the palette runs out;
 *  - colour fields of list items (e.g. CSS pattern layers) continue that
 *    order item by item;
 *  - backgrounds stay: a brand palette names the colours of the motif, the
 *    background is the user's own choice of contrast.
 * Locked params and locked item fields keep their values. The result is
 * validated with the tool schema; `null` means the tool has nothing to map
 * or the result would be invalid.
 */
import * as z from "zod";
import { controlKindRegistry, HEX_COLOR_PATTERN, PALETTE_MAX, PALETTE_MIN } from "./common";
import { itemLockKey, keepLocked, parseToolParams } from "./randomize";
import type { AnyToolDefinition, ControlKind } from "./types";

/** A place in the params that takes brand colours. */
export type ColorTarget =
  | { type: "palette"; key: string; min: number; max: number }
  | { type: "color"; key: string }
  | { type: "item-color"; list: string; field: string };

type AnySchema = z.core.$ZodType;

function innerOf(schema: AnySchema): AnySchema | undefined {
  return (schema._zod.def as { innerType?: AnySchema }).innerType;
}

/** The registered control kind of a schema or of any wrapped inner schema. */
function registeredKind(schema: AnySchema): ControlKind | undefined {
  let s: AnySchema | undefined = schema;
  while (s) {
    const kind = controlKindRegistry.get(s)?.kind;
    if (kind) return kind;
    s = innerOf(s);
  }
  return undefined;
}

function unwrap(schema: AnySchema): AnySchema {
  let s = schema;
  for (let inner = innerOf(s); inner; inner = innerOf(s)) s = inner;
  return s;
}

function lengthBounds(schema: AnySchema): { min?: number; max?: number } {
  const out: { min?: number; max?: number } = {};
  for (const check of schema._zod.def.checks ?? []) {
    const def = check._zod.def as { check: string; minimum?: number; maximum?: number };
    if (def.check === "min_length" && def.minimum !== undefined) out.min = def.minimum;
    if (def.check === "max_length" && def.maximum !== undefined) out.max = def.maximum;
  }
  return out;
}

type HintMap = Readonly<
  Record<string, { kind?: ControlKind; list?: { item?: unknown } } | undefined>
>;

const hintsOf = (controls: { params?: unknown } | undefined): HintMap =>
  (controls?.params ?? {}) as HintMap;

/** Colour params of a tool in schema order (see the module comment for the rules). */
export function colorTargets(tool: AnyToolDefinition): ColorTarget[] {
  const hints = hintsOf(tool.controls);
  const out: ColorTarget[] = [];
  for (const [key, raw] of Object.entries(tool.schema.shape as Record<string, AnySchema>)) {
    const hint = hints[key];
    const kind = hint?.kind ?? registeredKind(raw);
    if (kind === "hidden") continue;
    if (kind === "palette") {
      const { min, max } = lengthBounds(unwrap(raw));
      out.push({ type: "palette", key, min: min ?? PALETTE_MIN, max: max ?? PALETTE_MAX });
      continue;
    }
    if (kind === "color") {
      out.push({ type: "color", key });
      continue;
    }
    const inner = unwrap(raw);
    if (kind !== "list" && kind !== undefined) continue;
    if (!(inner instanceof z.ZodArray)) continue;
    const element = unwrap(inner.element as AnySchema);
    if (!(element instanceof z.ZodObject)) continue;
    const itemHints = hintsOf(hint?.list?.item as { params?: unknown } | undefined);
    for (const [field, fieldSchema] of Object.entries(element.shape as Record<string, AnySchema>)) {
      const fieldKind = itemHints[field]?.kind ?? registeredKind(fieldSchema);
      if (fieldKind === "color") out.push({ type: "item-color", list: key, field });
    }
  }
  return out;
}

/** Whether "apply brand palette" has anything to change in this tool. */
export function acceptsBrandPalette(tool: AnyToolDefinition): boolean {
  return colorTargets(tool).length > 0;
}

/** `colors` cut to `max` or repeated up to `min`. */
export function fitPalette(colors: readonly string[], min: number, max: number): string[] {
  const out = colors.slice(0, max);
  for (let i = 0; out.length < min && colors.length > 0; i++) {
    out.push(colors[i % colors.length] as string);
  }
  return out;
}

/** The generic mapping without locks; `brandPalette` hooks may start from it. */
export function mapBrandPalette(
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
  colors: readonly string[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...params };
  let cursor = 0;
  const take = () => colors[cursor++ % colors.length] as string;
  const lists = new Map<string, string[]>();
  for (const target of colorTargets(tool)) {
    if (target.type === "palette") next[target.key] = fitPalette(colors, target.min, target.max);
    else if (target.type === "color") next[target.key] = take();
    else {
      const fields = lists.get(target.list) ?? [];
      fields.push(target.field);
      lists.set(target.list, fields);
    }
  }
  for (const [list, fields] of lists) {
    const items = params[list];
    if (!Array.isArray(items)) continue;
    next[list] = items.map((item: unknown) => {
      if (typeof item !== "object" || item === null) return item;
      const copy: Record<string, unknown> = { ...(item as Record<string, unknown>) };
      for (const field of fields) copy[field] = take();
      return copy;
    });
  }
  return next;
}

/** Lock keys of the colour targets, for these params (item fields per item). */
export function colorLockKeys(
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
): string[] {
  const out: string[] = [];
  for (const target of colorTargets(tool)) {
    if (target.type !== "item-color") {
      out.push(target.key);
      continue;
    }
    const items = params[target.list];
    if (!Array.isArray(items)) continue;
    items.forEach((_, index) => out.push(itemLockKey(target.list, index, target.field)));
  }
  return out;
}

export interface BrandPaletteResult {
  /** The new params, valid for the tool. */
  params: Record<string, unknown>;
  /**
   * Lock keys of the colour params that now hold brand colours (changed or
   * not, locked ones excluded). Locking them keeps the brand colours when
   * the user rolls new variants.
   */
  applied: string[];
}

const isHex = (c: unknown): c is string => typeof c === "string" && HEX_COLOR_PATTERN.test(c);

/**
 * Applies a brand palette to a tool's params, respecting `locks`. Returns
 * `null` when the palette is unusable (fewer than 2 or more than 10 valid
 * colours), the tool has no colour params, or the result does not pass the
 * tool schema. Pure.
 */
export function applyBrandPalette(
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
  colors: readonly string[],
  locks: ReadonlySet<string> = new Set(),
): BrandPaletteResult | null {
  if (colors.length < PALETTE_MIN || colors.length > PALETTE_MAX || !colors.every(isHex)) {
    return null;
  }
  if (!acceptsBrandPalette(tool)) return null;
  const palette = colors.map((c) => c.toLowerCase());
  let mapped: Record<string, unknown>;
  try {
    mapped = tool.brandPalette
      ? { ...params, ...(tool.brandPalette(palette, params as never) as Record<string, unknown>) }
      : mapBrandPalette(tool, params, palette);
  } catch {
    return null;
  }
  const next = keepLocked(mapped, params as Record<string, unknown>, locks);
  const parsed = parseToolParams(tool, next);
  if (!parsed.success) return null;
  const result = parsed.data as Record<string, unknown>;
  const applied = colorLockKeys(tool, result).filter((key) => {
    if (locks.has(key)) return false;
    const list = key.split(".")[0] as string;
    return !(key.includes(".") && locks.has(list));
  });
  return { params: result, applied };
}
