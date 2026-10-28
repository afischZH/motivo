/**
 * The tool contract. Every generator in Musterli is a `ToolDefinition`; the
 * editor shell, persistence, API and SEO pages are derived from it, so a new
 * tool never needs tool-specific code outside its own definition file.
 */
import type { Rng } from "@musterli/engine";
import type * as z from "zod";

/** How a tool produces its output. Mirrors `Renderer["kind"]`. */
export type RenderKind = "svg" | "css" | "text" | "canvas2d" | "webgl" | "image-effect";

/** Every export format a tool can declare. */
export type ExportFormat =
  "svg" | "css" | "png" | "jpg" | "webp" | "gif" | "mp4" | "webm" | "react" | "json" | "tailwind";

/** Catalogue categories (docs/TOOLS.md sections A to I). */
export const TOOL_CATEGORIES = [
  "patterns",
  "css-patterns",
  "gradients",
  "backgrounds",
  "image-effects",
  "colors",
  "converters",
  "social",
  "composer",
] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

/**
 * Parameter schemas are always objects: locks and control hints are
 * addressed per top-level key.
 */
export type ParamsSchema = z.ZodObject;

/** The parsed parameter object of a schema. */
export type Params<S extends ParamsSchema> = z.output<S>;

/** Top-level parameter keys of a parameter object. */
export type ParamKey<P> = keyof P & string;

/**
 * Lock key of one field of one item of a list param (array of objects):
 * `<listKey>.<index>.<field>`, e.g. `"layers.1.color"`. See `ListHint`.
 */
export type ItemLockKey = `${string}.${number}.${string}`;

/** What `randomize` may find in its lock set: whole params or single item fields. */
export type LockKey<P> = ParamKey<P> | ItemLockKey;

/** Item type of a list param (array of objects); a plain record for anything else. */
export type ItemOf<T> = T extends readonly (infer I extends object)[]
  ? I
  : Readonly<Record<string, unknown>>;

/** A named starting point shown in the preset strip. */
export interface Preset<P> {
  /** Stable id, unique within the tool, kebab-case (e.g. "sunset"). */
  id: string;
  /** i18n key of the display name. */
  nameKey: string;
  /** Complete parameter set; must pass `schema.parse`. */
  params: P;
  /** Optional seed the preset is designed for. Defaults to the editor seed. */
  seed?: number;
}

/** Canvas size in CSS pixels. Stored on the design, not in the params. */
export interface CanvasSize {
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/**
 * The control the editor renders for a parameter. Most kinds are derived from
 * the schema (number with min/max -> slider, enum -> segmented/select,
 * boolean -> switch); the rest must be stated because zod cannot tell a
 * colour string from free text.
 */
export type ControlKind =
  | "slider"
  | "number"
  | "segmented"
  | "select"
  | "switch"
  | "text"
  | "color"
  | "palette"
  | "background"
  | "angle"
  | "thumbnails"
  | "list"
  | "shape"
  | "image"
  | "hidden";

/**
 * A small preview of one option of a choice param (thumbnail picker). CSS
 * declarations (as in `CssOutput.css`) are applied as an inline style to a
 * small box; SVG is shown through `<img>`, never as inline markup.
 */
export type OptionPreview = { readonly css: string } | { readonly svg: string };

/** Presentation hints for one parameter. Everything is optional. */
export interface ControlHint<P> {
  /** Overrides the control derived from the schema. */
  kind?: ControlKind;
  /** Id of a group from `ControlHints.groups`. Ungrouped params go last. */
  group?: string;
  /** i18n key of the label. Default: `tools.<toolId>.params.<key>.label`. */
  labelKey?: string;
  /** i18n key of an optional help text. */
  descriptionKey?: string;
  /** i18n keys of enum option labels, by option value. */
  optionLabelKeys?: Readonly<Record<string, string>>;
  /** Slider/number step. Default: 1 for int schemas, otherwise (max - min) / 100. */
  step?: number;
  /** Unit suffix shown next to numbers, e.g. "px", "%", "°". Not translated. */
  unit?: string;
  /** Collapsed under "Advanced" by default. */
  advanced?: boolean;
  /** Whether the param gets a lock. Default true. */
  lockable?: boolean;
  /**
   * Hides the control when this returns false. Must be pure. In a list item
   * sub-form, `params` is the item.
   */
  visibleWhen?(params: P): boolean;
  /**
   * For `kind: "thumbnails"`: preview of one option, drawn small (about
   * 56 px) in a radio grid. Pure and cheap (well under 1 ms per option); the
   * editor renders previews lazily as tiles scroll into view. `params` is the
   * param object (or the list item in a sub-form), `root` the whole param
   * object of the tool. Without it the control falls back to a select.
   */
  optionPreview?(
    value: string | number,
    params: P,
    root: Readonly<Record<string, unknown>>,
  ): OptionPreview;
  /**
   * For `kind: "thumbnails"`: the options in named groups (e.g. shape packs).
   * The picker shows one group at a time behind a group select, which keeps
   * long option lists small. Options missing from every group are not shown
   * in the grid (they stay valid values).
   */
  optionGroups?: readonly OptionGroup[];
  /**
   * For `kind: "thumbnails"`: an image param (`kind: "image"`) that takes
   * the user's own shapes. With a Brand Kit, the picker adds a "Brand Kit"
   * group whose shapes go into that param, through the same checks,
   * sanitizer and crop dialog as an upload.
   */
  brandShapesParam?: string;
}

/** A named group of options of a thumbnail picker. */
export interface OptionGroup {
  readonly id: string;
  /** i18n key of the group name. */
  readonly labelKey: string;
  readonly values: readonly (string | number)[];
}

/**
 * Hints for a list param: an array of objects with `min`/`max` length,
 * edited as a list (add, duplicate, remove, reorder, show/hide, select) plus
 * a sub-form for the selected item, built from the item schema like the main
 * panel. Locks on item fields use `ItemLockKey`s; the editor shifts them
 * along when items move.
 */
export interface ListHint<I> {
  /** Controls of the item fields; `visibleWhen` and `optionPreview` receive the item. */
  item?: ControlHints<I>;
  /** Boolean item field toggled by the visibility button (hidden items stay in the list). */
  visibilityField?: ParamKey<I>;
  /** Choice field whose option label and preview name an item in the list. */
  titleField?: ParamKey<I>;
  /**
   * The item "Add" inserts. Pure; must pass the item schema. Default: a copy
   * of the first item of the tool defaults.
   */
  newItem?(items: readonly I[]): I;
  /** i18n key of the item noun with an `{index}` placeholder, e.g. "Layer {index}". */
  itemLabelKey?: string;
}

/** The hint of one param; list params may carry `list`. */
export type ParamHint<P, K extends ParamKey<P>> = ControlHint<P> & {
  list?: ListHint<ItemOf<P[K]>>;
};

/** A labelled section of controls in the panel. */
export interface ControlGroup {
  id: string;
  /** i18n key of the section title. */
  labelKey: string;
  /** Collapsed on first open. */
  collapsed?: boolean;
}

export interface ControlHints<P> {
  /** Groups in display order. */
  groups?: readonly ControlGroup[];
  /** Display order of params; keys not listed follow in schema order. */
  order?: readonly ParamKey<P>[];
  /** Per-param hints. */
  params?: { readonly [K in ParamKey<P>]?: ParamHint<P, K> };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Everything a renderer may depend on besides the params. */
export interface RenderContext {
  /** uint32 seed of the design. */
  seed: number;
  /** Rng seeded from `seed`. The only allowed source of randomness. */
  rng: Rng;
  /** Output size in CSS pixels. */
  width: number;
  height: number;
  /** Normalised animation time in [0, 1) for looped animations. */
  t?: number;
}

/** Output of a CSS renderer. */
export interface CssOutput {
  /** CSS declarations (e.g. `background-image: ...;`), without a selector. */
  css: string;
  /** Optional SVG equivalent for preview and SVG/PNG export. */
  previewSvg?: string;
}

/** Pure SVG string renderer; runs on the server and in workers. */
export interface SvgRenderer<P> {
  kind: "svg";
  render(params: P, ctx: RenderContext): string;
}

/** Native CSS renderer (gradients, CSS patterns). */
export interface CssRenderer<P> {
  kind: "css";
  render(params: P, ctx: RenderContext): CssOutput;
}

/** Plain text/code output (converters). */
export interface TextRenderer<P> {
  kind: "text";
  render(params: P, ctx: RenderContext): string;
}

/**
 * Placeholder until the first canvas tool: the target will become
 * `OffscreenCanvasRenderingContext2D` once a package enables the DOM lib.
 */
export interface Canvas2dRenderer<P> {
  kind: "canvas2d";
  render(target: unknown, params: P, ctx: RenderContext): void;
}

/** Shader uniform values. Placeholder until the shaders package exists. */
export type UniformValue = number | boolean | readonly number[];

/** Placeholder until the first shader tool (M5). */
export interface WebglRenderer<P> {
  kind: "webgl";
  fragment: string;
  uniforms(params: P, ctx: RenderContext): Readonly<Record<string, UniformValue>>;
}

/** Structural subset of `ImageData`, so effects run in workers and in Node tests. */
export interface PixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** Placeholder until the first image effect (M2). Runs in a Web Worker. */
export interface ImageEffectRenderer<P> {
  kind: "image-effect";
  render(input: PixelBuffer, params: P, ctx: RenderContext): PixelBuffer;
}

export type Renderer<P> =
  | SvgRenderer<P>
  | CssRenderer<P>
  | TextRenderer<P>
  | Canvas2dRenderer<P>
  | WebglRenderer<P>
  | ImageEffectRenderer<P>;

/** A repeat tile: SVG of exactly one tile, `width` × `height` CSS pixels. */
export interface TileOutput {
  svg: string;
  width: number;
  height: number;
}

/**
 * Seamless tools describe their repeat tile, built from the same markup as
 * `render` (one render path). Exporters use it for CSS backgrounds
 * (`background-size` + `repeat`) and the PNG tile export.
 */
export interface TileRenderer<P> {
  render(params: P, ctx: RenderContext): TileOutput;
}

// ---------------------------------------------------------------------------
// Extra exports
// ---------------------------------------------------------------------------

/** Language of a text output, for syntax highlighting and the file type. */
export type CodeLanguage = "css" | "html" | "js" | "json" | "text";

/**
 * A tool-specific text output beyond the generic formats, shown in the
 * export dialog's code section (e.g. Tailwind classes, `clip-path` CSS).
 */
export interface ExtraExport<P> {
  /** Stable kebab-case id, unique within the tool (e.g. "tailwind"). */
  id: string;
  /** i18n key of the label in the export dialog. */
  labelKey: string;
  language: CodeLanguage;
  /** Pure and deterministic, with the same inputs as the tool's `render`. */
  render(params: P, ctx: RenderContext): string;
}

// ---------------------------------------------------------------------------
// Image input
// ---------------------------------------------------------------------------

/**
 * A tool that analyses a user image (e.g. "Palette from image"). The editor
 * shows a generic image picker; the image is decoded and downsampled in the
 * browser (never uploaded, never stored, never in share links) and handed to
 * `derive`, which turns it into ordinary params. `render` therefore stays a
 * pure function of params and seed: preview and export are unchanged.
 *
 * `derive` runs again whenever the image, the seed (Space) or one of
 * `deriveOn` changes.
 */
export interface ImageInput<P> {
  /**
   * Params computed by `derive`. They describe the user's image, so share
   * links never carry them: they are reset to the defaults on encode and
   * decode, and the opened link shows the sample state.
   */
  derivedKeys: readonly ParamKey<P>[];
  /** Params that feed `derive` (e.g. a colour count). */
  deriveOn: readonly ParamKey<P>[];
  /** Longest edge in pixels of the buffer `derive` receives (downsampled before). */
  maxEdge: number;
  /**
   * Built-in picture used until the user picks one, so the tool never starts
   * empty. `defaults` should equal `derive(sample(), defaults, rng(seed 1))`.
   */
  sample(): PixelBuffer;
  /**
   * Pure and deterministic: same pixels, params and rng state give the same
   * patch. Must return values that pass the schema.
   */
  derive(pixels: PixelBuffer, params: P, rng: Rng): Partial<P>;
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export interface ToolDefinition<S extends ParamsSchema = ParamsSchema> {
  /** Stable kebab-case id, also the i18n namespace (`tools.<id>`). */
  id: string;
  /** Bump on any change that alters the output for the same (params, seed). */
  version: number;
  /** First entry is the primary category. */
  category: readonly [ToolCategory, ...ToolCategory[]];
  /** Zod schema of all params (without size and seed, see `RenderContext`). */
  schema: S;
  defaults: Params<S>;
  /**
   * Upgrades params stored by an older shape of this tool (share links, saved
   * designs) before schema validation, e.g. a single pattern to a list of
   * layers. Receives untrusted input: pure, must not throw, returns the
   * input unchanged when there is nothing to upgrade. The schema still
   * validates the result.
   */
  migrateParams?(raw: Readonly<Record<string, unknown>>): unknown;
  /** At least 6 presets with unique ids. */
  presets: readonly Preset<Params<S>>[];
  /** Initial canvas size. Default: `DEFAULT_CANVAS_SIZE`. */
  defaultSize?: CanvasSize;
  controls?: ControlHints<Params<S>>;
  /**
   * Returns a new param set for "new variant". Must be deterministic for a
   * given rng state, must not mutate `current`, and must copy every locked key
   * from `current` unchanged, including locked list item fields
   * (`ItemLockKey`; `keepLocked` handles both).
   */
  randomize(rng: Rng, current: Params<S>, locks: ReadonlySet<LockKey<Params<S>>>): Params<S>;
  /**
   * Params that steer `randomize` (e.g. a palette harmony). Changing one of
   * them in the editor re-runs `randomize` with the current seed (same salted
   * rng as the variant), so the change shows at once and stays deterministic;
   * locked keys and the changed param itself are kept.
   */
  regenerateOn?: readonly (keyof Params<S> & string)[];
  /**
   * Maps a brand palette (2 to 10 lower-case `#rrggbb` colours) onto the
   * params, for tools whose colours need more than the generic mapping of
   * `applyBrandPalette` (brand-palette.ts), e.g. a swatch count. Pure;
   * returns the changed params. Locks and the schema are applied afterwards
   * by the caller, so the hook may ignore them.
   */
  brandPalette?(colors: readonly string[], current: Params<S>): Partial<Params<S>>;
  /** The single render path for preview and export. `render.kind` is the render kind. */
  render: Renderer<Params<S>>;
  exports: readonly ExportFormat[];
  /** Tool-specific text outputs, offered next to `exports`. */
  extraExports?: readonly ExtraExport<Params<S>>[];
  /** Needs an uploaded image as render input (halftone, dither, ...). */
  needsImageInput?: boolean;
  /** Derives params from a user image; see `ImageInput`. */
  imageInput?: ImageInput<Params<S>>;
  /**
   * Params that hold the user's own files (uploads, `kind: "image"`). They
   * stay on the device: share links (and later saved designs) reset them
   * to the defaults in both directions, presets and variants keep them.
   * `render` must fall back to something sensible for the default value.
   */
  localParams?: readonly ParamKey<Params<S>>[];
  /** The repeat tile of a seamless design; see `TileRenderer`. */
  tile?: TileRenderer<Params<S>>;
  /** Uses `RenderContext.t` (GIF/video export). */
  supportsAnimation?: boolean;
}

/** A tool of any schema, as stored in a registry. */
export type AnyToolDefinition = ToolDefinition<ParamsSchema>;
