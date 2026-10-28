/**
 * Pure derivation of the control panel from a tool's schema and control
 * hints (M1-AP03). React components only render what this returns, so the
 * mapping rules (docs/DESIGN.md section 3) are unit-testable without a DOM.
 */
import {
  PALETTE_MAX,
  PALETTE_MIN,
  controlKindRegistry,
  type AnyToolDefinition,
  type ControlHint,
  type ControlHints,
  type ControlKind,
  type ListHint,
  type OptionPreview,
} from "@musterli/tool-registry";
import * as z from "zod";
import type { ParamValues } from "../store/editor-store";
import { LIST_DEFAULT_MAX, lengthBounds, type ListItem } from "../store/list";

/**
 * What the panel is built from: a tool, or the item schema of a list param
 * (sub-form of the selected item). `AnyToolDefinition` satisfies it.
 */
export interface ControlSource {
  /** Tool id: default label keys are `tools.<id>.params.<key>.label`. */
  id: string;
  schema: z.ZodObject;
  defaults: ParamValues;
  controls?: ControlHints<ParamValues> | undefined;
}

/** A param hint as the panel reads it (type-erased). */
type AnyHint = ControlHint<ParamValues> & { list?: ListHint<ListItem> };

/** Enums with at most this many options become a segmented control, larger ones a select. */
export const SEGMENTED_MAX_OPTIONS = 5;

export type OptionValue = string | number;

export interface ControlOption {
  value: OptionValue;
  labelKey: string;
}

interface ControlBase {
  /** Top-level param key. */
  key: string;
  labelKey: string;
  descriptionKey?: string;
  lockable: boolean;
  advanced: boolean;
  /** Tool default, used by "reset" (double-click). */
  defaultValue: unknown;
}

export interface RangeControl extends ControlBase {
  kind: "slider" | "angle";
  min: number;
  max: number;
  step: number;
  integer: boolean;
  unit?: string;
}

export interface NumberControl extends ControlBase {
  kind: "number";
  min?: number;
  max?: number;
  step: number;
  integer: boolean;
  unit?: string;
}

export interface ChoiceControl extends ControlBase {
  kind: "segmented" | "select";
  options: ControlOption[];
}

/** A choice shown as a grid of previews (radio group). */
export interface ThumbnailControl extends ControlBase {
  kind: "thumbnails";
  options: ControlOption[];
  /** Preview of one option for the current params; cheap, called lazily per visible tile. */
  preview(value: OptionValue): OptionPreview;
  /** Named groups of options (e.g. shape packs); the picker shows one at a time. */
  groups?: ThumbnailGroup[];
  /** Image param that takes Brand Kit shapes (adds a "Brand Kit" group). */
  brandShapesParam?: string;
}

/** One group of a thumbnail picker: its options, in the control's order. */
export interface ThumbnailGroup {
  id: string;
  labelKey: string;
  options: ControlOption[];
}

/** An array of objects: item list plus a sub-form for the selected item. */
export interface ListControl extends ControlBase {
  kind: "list";
  minItems: number;
  maxItems: number;
  /** Source of the sub-form (item schema and hints). */
  item: ControlSource;
  /** Boolean item field behind the show/hide button. */
  visibilityField?: string;
  /** Choice field that names (and previews) an item in the list. */
  titleField?: string;
  /** i18n key of the item noun with `{index}` (1-based). */
  itemLabelKey: string;
  /** The item "add" inserts (`ListHint.newItem`, else the first default item). */
  newItem(items: readonly ListItem[]): ListItem | undefined;
}

export interface TextControl extends ControlBase {
  kind: "text";
  maxLength?: number;
}

export interface PaletteControl extends ControlBase {
  kind: "palette";
  minItems: number;
  maxItems: number;
}

export interface SimpleControl extends ControlBase {
  kind: "switch" | "color" | "background";
}

/** Kinds without a component yet (M1): resolved so callers can see them, rendered as nothing. */
export interface PendingControl extends ControlBase {
  kind: "shape" | "image";
}

export type ResolvedControl =
  | RangeControl
  | NumberControl
  | ChoiceControl
  | ThumbnailControl
  | ListControl
  | TextControl
  | PaletteControl
  | SimpleControl
  | PendingControl;

export interface ResolvedGroup {
  /** Group id from the hints; `null` for params without a (known) group. */
  id: string | null;
  labelKey?: string;
  collapsed: boolean;
  controls: ResolvedControl[];
  /** Controls collapsed under "Advanced". */
  advanced: ResolvedControl[];
}

type AnySchema = z.core.$ZodType;

/** Strips wrappers that do not change which control fits. */
function unwrap(schema: AnySchema): AnySchema {
  let s = schema;
  for (;;) {
    const def = s._zod.def as { type: string; innerType?: AnySchema };
    if (
      (def.type === "optional" ||
        def.type === "nullable" ||
        def.type === "default" ||
        def.type === "prefault" ||
        def.type === "readonly" ||
        def.type === "catch") &&
      def.innerType
    ) {
      s = def.innerType;
    } else {
      return s;
    }
  }
}

function registeredKind(schema: AnySchema): ControlKind | undefined {
  let s: AnySchema | undefined = schema;
  while (s) {
    const kind = controlKindRegistry.get(s)?.kind;
    if (kind) return kind;
    const def = s._zod.def as { innerType?: AnySchema };
    s = def.innerType;
  }
  return undefined;
}

/** Literal options of an enum, a multi-value literal or a union of literals. */
function choiceValues(schema: AnySchema): OptionValue[] | undefined {
  const def = schema._zod.def as {
    type: string;
    entries?: Record<string, OptionValue>;
    values?: readonly unknown[];
    options?: readonly AnySchema[];
  };
  const isOption = (v: unknown): v is OptionValue => typeof v === "string" || typeof v === "number";
  if (def.type === "enum" && def.entries) return Object.values(def.entries);
  if (def.type === "literal" && def.values?.every(isOption)) return [...def.values];
  if (def.type === "union" && def.options) {
    const out: OptionValue[] = [];
    for (const option of def.options) {
      const values = choiceValues(unwrap(option));
      if (!values) return undefined;
      out.push(...values);
    }
    return out;
  }
  return undefined;
}

interface NumberBounds {
  min?: number;
  max?: number;
  integer: boolean;
}

function numberBounds(schema: AnySchema): NumberBounds | undefined {
  if (!(schema instanceof z.ZodNumber)) return undefined;
  const out: NumberBounds = { integer: schema.isInt };
  if (Number.isFinite(schema.minValue)) out.min = schema.minValue as number;
  if (Number.isFinite(schema.maxValue)) out.max = schema.maxValue as number;
  return out;
}

/** The control kind for a param schema without hints (docs/DESIGN.md section 3). */
export function deriveControlKind(schema: AnySchema): ControlKind {
  const registered = registeredKind(schema);
  if (registered) return registered;
  const inner = unwrap(schema);
  const bounds = numberBounds(inner);
  if (bounds) return bounds.min !== undefined && bounds.max !== undefined ? "slider" : "number";
  const values = choiceValues(inner);
  if (values) return values.length <= SEGMENTED_MAX_OPTIONS ? "segmented" : "select";
  const type = inner._zod.def.type;
  if (type === "boolean") return "switch";
  if (type === "string") return "text";
  if (inner instanceof z.ZodArray && unwrap(inner.element as AnySchema) instanceof z.ZodObject) {
    return "list";
  }
  // Unknown shapes (objects, records, ...) need an explicit hint.
  return "hidden";
}

/** Default i18n key of a param label. */
export function paramLabelKey(toolId: string, key: string): string {
  return `tools.${toolId}.params.${key}.label`;
}

/** Default i18n key of an enum option label. */
export function optionLabelKey(toolId: string, key: string, value: OptionValue): string {
  return `tools.${toolId}.params.${key}.options.${String(value)}`;
}

/** Generic i18n key of a list item ("Item {index}"). */
export const LIST_ITEM_LABEL_KEY = "Editor.list.item";

/** Params the control is shown for: `params` (or the list item) and the whole tool params. */
export interface ResolveContext {
  params: ParamValues;
  root: ParamValues;
}

/** Resolves one param. Returns `null` for hidden params or ones the schema cannot drive. */
export function resolveControl(
  tool: ControlSource | AnyToolDefinition,
  key: string,
  hint: AnyHint = {},
  context?: ResolveContext,
): ResolvedControl | null {
  const schema = (tool.schema.shape as Record<string, AnySchema | undefined>)[key];
  if (!schema) return null;
  const kind = hint.kind ?? deriveControlKind(schema);
  const inner = unwrap(schema);

  const base: ControlBase = {
    key,
    labelKey: hint.labelKey ?? paramLabelKey(tool.id, key),
    lockable: hint.lockable !== false,
    advanced: hint.advanced === true,
    defaultValue: (tool.defaults as ParamValues)[key],
  };
  if (hint.descriptionKey) base.descriptionKey = hint.descriptionKey;
  const withUnit = <T extends RangeControl | NumberControl>(c: T): T => {
    if (hint.unit !== undefined) c.unit = hint.unit;
    return c;
  };

  switch (kind) {
    case "hidden":
      return null;
    case "slider":
    case "angle": {
      const b = numberBounds(inner) ?? { integer: false };
      const min = b.min ?? (kind === "angle" ? 0 : undefined);
      const max = b.max ?? (kind === "angle" ? 360 : undefined);
      // A slider needs a finite range; fall back to a number field.
      if (min === undefined || max === undefined) {
        const c: NumberControl = {
          ...base,
          kind: "number",
          step: hint.step ?? 1,
          integer: b.integer,
        };
        return withUnit(c);
      }
      const step = hint.step ?? (b.integer ? 1 : (max - min) / 100);
      const c: RangeControl = { ...base, kind, min, max, step, integer: b.integer };
      return withUnit(c);
    }
    case "number": {
      const b = numberBounds(inner) ?? { integer: false };
      const c: NumberControl = { ...base, kind, step: hint.step ?? 1, integer: b.integer };
      if (b.min !== undefined) c.min = b.min;
      if (b.max !== undefined) c.max = b.max;
      return withUnit(c);
    }
    case "segmented":
    case "select":
    case "thumbnails": {
      const values = choiceValues(inner);
      if (!values) return null;
      const options = values.map((value) => ({
        value,
        labelKey: hint.optionLabelKeys?.[String(value)] ?? optionLabelKey(tool.id, key, value),
      }));
      const optionPreview = hint.optionPreview;
      if (kind !== "thumbnails") return { ...base, kind, options };
      // Without a preview (or params to draw it with) a grid would be blank: use a select.
      if (!optionPreview || !context) return { ...base, kind: "select", options };
      const { params, root } = context;
      const c: ThumbnailControl = {
        ...base,
        kind,
        options,
        preview: (value) => optionPreview(value, params, root),
      };
      if (hint.optionGroups) {
        const byValue = new Map(options.map((o) => [o.value, o]));
        c.groups = hint.optionGroups
          .map((g) => ({
            id: g.id,
            labelKey: g.labelKey,
            options: g.values.flatMap((v) => byValue.get(v) ?? []),
          }))
          .filter((g) => g.options.length > 0);
      }
      if (hint.brandShapesParam) c.brandShapesParam = hint.brandShapesParam;
      return c;
    }
    case "list": {
      if (!(inner instanceof z.ZodArray)) return null;
      const element = unwrap(inner.element as AnySchema);
      if (!(element instanceof z.ZodObject)) return null;
      const { min, max } = lengthBounds(inner);
      const list = hint.list ?? {};
      const defaults = (tool.defaults as ParamValues)[key];
      const first = Array.isArray(defaults) ? (defaults[0] as ListItem | undefined) : undefined;
      const c: ListControl = {
        ...base,
        kind,
        minItems: Math.max(0, min ?? 0),
        maxItems: max ?? LIST_DEFAULT_MAX,
        item: {
          id: tool.id,
          schema: element,
          defaults: first ?? {},
          controls: list.item as ControlHints<ParamValues> | undefined,
        },
        itemLabelKey: list.itemLabelKey ?? LIST_ITEM_LABEL_KEY,
        newItem: (items) => (list.newItem ? list.newItem(items) : first),
      };
      if (list.visibilityField !== undefined) c.visibilityField = list.visibilityField;
      if (list.titleField !== undefined) c.titleField = list.titleField;
      return c;
    }
    case "text": {
      const c: TextControl = { ...base, kind };
      const { max } = lengthBounds(inner);
      if (max !== undefined) c.maxLength = max;
      return c;
    }
    case "palette": {
      const { min, max } = lengthBounds(inner);
      return { ...base, kind, minItems: min ?? PALETTE_MIN, maxItems: max ?? PALETTE_MAX };
    }
    case "switch":
    case "color":
    case "background":
      return { ...base, kind };
    case "shape":
    case "image":
      return { ...base, kind };
  }
}

/** Param keys in display order: `controls.order` first, then schema order. */
export function orderedParamKeys(tool: ControlSource | AnyToolDefinition): string[] {
  const schemaKeys = Object.keys(tool.schema.shape);
  const order = (tool.controls?.order ?? []).filter((k) => schemaKeys.includes(k));
  return [...new Set([...order, ...schemaKeys])];
}

/**
 * The full panel for the current params: visible controls in display order,
 * grouped as declared. Empty groups are dropped; ungrouped params form a
 * trailing group with `id: null`.
 */
export function resolveControls(
  tool: ControlSource | AnyToolDefinition,
  params: ParamValues,
  root: ParamValues = params,
): ResolvedGroup[] {
  const hints = (tool.controls?.params ?? {}) as Record<string, AnyHint | undefined>;
  const declared = tool.controls?.groups ?? [];
  const groups = new Map<string | null, ResolvedGroup>();
  for (const g of declared) {
    groups.set(g.id, {
      id: g.id,
      labelKey: g.labelKey,
      collapsed: g.collapsed === true,
      controls: [],
      advanced: [],
    });
  }
  const ungrouped: ResolvedGroup = { id: null, collapsed: false, controls: [], advanced: [] };

  for (const key of orderedParamKeys(tool)) {
    const hint = hints[key] ?? {};
    if (hint.visibleWhen && !hint.visibleWhen(params)) continue;
    const control = resolveControl(tool, key, hint, { params, root });
    if (!control) continue;
    const group = (hint.group !== undefined ? groups.get(hint.group) : undefined) ?? ungrouped;
    (control.advanced ? group.advanced : group.controls).push(control);
  }

  return [...groups.values(), ungrouped].filter(
    (g) => g.controls.length > 0 || g.advanced.length > 0,
  );
}
