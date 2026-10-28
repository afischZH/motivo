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
  "css-effects",
  "icons",
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

/** An output size a tool suggests; see `ToolDefinition.sizePresets`. */
export interface ToolSizePreset extends CanvasSize {
  /** Stable kebab-case id, unique within the tool. */
  id: string;
  /** i18n key of the display name. */
  nameKey: string;
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
  /** For `kind: "image"`: how the upload is prepared; see `ImageHint`. */
  image?: ImageHint;
}

/**
 * Options of an upload field (`kind: "image"`). The param schema must
 * accept what the field produces (`photoAssetSchema` for `maxEdge` 2048).
 */
export interface ImageHint {
  /** Longest edge of a raster upload after downsampling. Default 1024. */
  readonly maxEdge?: number;
  /**
   * Re-encode raster uploads as JPEG (transparency flattened onto white),
   * for backgrounds where a large PNG would be needlessly heavy.
   */
  readonly photo?: boolean;
  /**
   * Whether the field takes images pasted anywhere in the editor. Default
   * true; set false when several upload fields are visible at once.
   */
  readonly paste?: boolean;
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

/** A box inside a `CssElement`, positioned in CSS px relative to it (e.g. sample text bars). */
export interface CssBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** CSS declarations of the box, without a selector. */
  css: string;
}

/**
 * An element drawn on top of the `css` box (the stage), for code-first
 * effects whose subject is a component, not a background: a glass card, a
 * gradient border. The preview renders it as a real element, so effects
 * like `backdrop-filter` act on the stage behind it.
 */
export interface CssElement {
  /** Position and size in CSS px at the render size. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** CSS declarations of the element, without a selector. */
  css: string;
  /**
   * Animation declarations (e.g. `animation: ...`). The preview applies them
   * only when the viewer allows motion (`prefers-reduced-motion`), the
   * exports guard them with a media query.
   */
  motionCss?: string;
  /** Boxes inside the element, in paint order. */
  content?: readonly CssBox[];
}

/** Output of a CSS renderer. */
export interface CssOutput {
  /** CSS declarations (e.g. `background-image: ...;`), without a selector. */
  css: string;
  /** Optional SVG equivalent for preview and SVG/PNG export. */
  previewSvg?: string;
  /** Optional element on top of the box; see `CssElement`. */
  element?: CssElement;
  /**
   * Global rules the output needs (`@property`, `@keyframes`), installed by
   * the preview as a stylesheet. Must not depend on anything but constants
   * of the tool: several previews may share the rules on one page.
   */
  rules?: string;
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
// Bundles (multi-file exports)
// ---------------------------------------------------------------------------

/**
 * One file of a bundle. Image files are rendered by the exporter through
 * the tool's own `render` (one render path) at their pixel size, with the
 * design's seed and `params` (default: the current params), then encoded.
 */
export type BundleFile<P> =
  /** UTF-8 text (manifest, HTML snippet, an SVG the tool built with its engine). */
  | { readonly kind: "text"; readonly path: string; readonly text: string }
  /** The design rendered at `width` × `height` as PNG. */
  | {
      readonly kind: "png";
      readonly path: string;
      readonly width: number;
      readonly height: number;
      readonly params?: P;
    }
  /** An `.ico` with one PNG image per square size (1 to 256 px). */
  | {
      readonly kind: "ico";
      readonly path: string;
      readonly sizes: readonly number[];
      readonly params?: P;
    };

/** Text shown in the export dialog next to a bundle, ready to copy (e.g. HTML head tags). */
export interface BundleSnippet<P> {
  /** i18n key of the code label. */
  labelKey: string;
  language: CodeLanguage;
  /** Pure and deterministic. */
  render(params: P, ctx: RenderContext): string;
}

/**
 * A multi-file export, downloaded as one ZIP (e.g. the icon pack of the
 * favicon generator). Offered in the export dialog's "Bundle" group.
 */
export interface BundleExport<P> {
  /** Stable kebab-case id, unique within the tool; also the file name suffix. */
  id: string;
  /** i18n key of the label in the export dialog. */
  labelKey: string;
  /** i18n key of a one-line description shown when the bundle is chosen. */
  descriptionKey?: string;
  /**
   * The files in archive order. Pure and cheap (no rendering here); paths
   * are relative, `/` separated and unique.
   */
  files(params: P, ctx: RenderContext): readonly BundleFile<P>[];
  /** Optional copyable text shown in the dialog. */
  snippet?: BundleSnippet<P>;
}

// ---------------------------------------------------------------------------
// Editable preview regions
// ---------------------------------------------------------------------------

/**
 * A clickable area of the preview (e.g. one tile of a grid), in CSS px of
 * the render size. See `RegionEditor`.
 */
export interface PreviewRegion {
  /** Stable id within the design; also the key of its stored edits. */
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** i18n key of the accessible name, with `labelValues` as placeholders. */
  readonly labelKey: string;
  readonly labelValues?: Readonly<Record<string, string | number>>;
  /** The region carries an edit (enables "reset", announced as edited). */
  readonly edited: boolean;
}

/**
 * Lets the user edit single regions of the preview (M4-AP03: tiles of
 * Geometric Patterns). The shell shows a generic cell picker over the
 * preview (click, or focus plus arrow keys and Enter) and a popover whose
 * form is built from `schema` and `controls` like a list item sub-form.
 * Edits are ordinary params (`set`/`reset` return new params), so they are
 * part of undo, share links and saved designs without any extra code.
 *
 * Every function is pure and deterministic; `ctx` is a fresh render
 * context of the design (same seed and size as the preview).
 */
/** Values of one editable region (the popover form). */
export type RegionValues = Readonly<Record<string, unknown>>;

export interface RegionEditor<P, V extends RegionValues = RegionValues> {
  /** i18n key of the popover title (e.g. "Edit tile"). */
  titleKey: string;
  /** The regions of these params, in reading order. Must stay cheap (capped count). */
  regions(params: P, ctx: RenderContext): readonly PreviewRegion[];
  /** Schema of the values of one region (the popover form). */
  schema: ParamsSchema;
  /**
   * Hints of the form fields; `optionPreview` receives the region values as
   * `params` and the tool params as `root`.
   */
  controls?: ControlHints<V>;
  /** Current values of a region (generated or edited), `undefined` for unknown ids. */
  values(params: P, regionId: string, ctx: RenderContext): V | undefined;
  /**
   * Params with fields of one region changed. Returns `params` itself when
   * the edit does not apply (unknown region, limit of edited regions reached).
   */
  set(params: P, regionId: string, patch: Partial<V>, ctx: RenderContext): P;
  /** Params with one region (or every region for `null`) back to generated. */
  reset(params: P, regionId: string | null): P;
  /** Number of edited regions stored in the params (also ones outside the current grid). */
  editedCount(params: P): number;
  /** Most edited regions the params may hold (share link size). */
  maxEdited: number;
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

/**
 * A one-click change the tool proposes for the current params (e.g. the
 * nearest text colour that passes WCAG AA). The editor lists them above the
 * controls; choosing one merges `patch` into the params as one undo step.
 */
export interface ParamSuggestion<P> {
  /** Stable kebab-case id, unique within one result. */
  id: string;
  /** i18n key of the button text; may use the placeholders in `values`. */
  labelKey: string;
  values?: Readonly<Record<string, string | number>>;
  /** Optional colour shown as a swatch on the button (hex). */
  swatch?: string;
  /** Params to merge; must keep the params valid. */
  patch: Partial<P>;
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
// Animation (GIF export)
// ---------------------------------------------------------------------------

/**
 * Where the frames of an animated export come from:
 *  - `seeds`: frame i renders the same params with seed `seed + i` (the
 *    tool's own randomness, e.g. a new blob outline per frame);
 *  - `colors`: the colour params rotate through the frames, blended in
 *    OKLab, so the last frame leads smoothly back to the first;
 *  - `time`: the renderer reads `RenderContext.t` = i / count (looped
 *    motion); only for tools whose renderer uses `t`;
 *  - `custom`: the tool's own `AnimationSupport.frame`.
 */
export type AnimationSource = "seeds" | "colors" | "time" | "custom";

/** Position of one frame in an animation. */
export interface AnimationFrameInfo {
  /** 0-based frame index. */
  index: number;
  /** Number of frames. */
  count: number;
  /** `index / count`, in [0, 1). */
  t: number;
  /** Seed of the design (uint32). */
  seed: number;
}

/** What one frame renders: params, seed and an optional time. */
export interface AnimationFrame<P> {
  params: P;
  seed: number;
  t?: number;
}

/** Opt-in of a tool for animated exports. */
export interface AnimationSupport<P> {
  /** Frame sources in display order; the first is the default. */
  sources: readonly [AnimationSource, ...AnimationSource[]];
  /**
   * Frames of the `custom` source. Pure and deterministic; must return
   * params that pass the schema. Required when `sources` has `custom`.
   */
  frame?(params: P, info: AnimationFrameInfo): AnimationFrame<P>;
  /** i18n key of the `custom` source label. Required with `frame`. */
  customLabelKey?: string;
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
  /**
   * Output sizes suggested for this tool (e.g. Product Hunt for the
   * screenshot beautifier), offered first in the size picker next to the
   * common `SIZE_PRESETS`. Ids unique within the tool.
   */
  sizePresets?: readonly ToolSizePreset[];
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
  /**
   * Multi-file exports downloaded as one ZIP (icon pack); see
   * `BundleExport`. Needs SVG output (svg, or css with a preview SVG).
   */
  bundles?: readonly BundleExport<Params<S>>[];
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
  /**
   * Opt-in for animated exports (GIF): which frame sources the export
   * dialog offers. Every frame is rendered by `render` (one render path);
   * see `AnimationSupport` and `planAnimationFrames`. Most tools need one
   * line: `animation: SEED_AND_COLOR_ANIMATION`.
   */
  animation?: AnimationSupport<Params<S>>;
  /**
   * Single regions of the preview the user can click and edit (e.g. tiles);
   * see `RegionEditor`. Without it the preview is not interactive.
   */
  regionEditor?: RegionEditor<Params<S>>;
  /**
   * One-click changes for the current params; see `ParamSuggestion`. Pure
   * and cheap (runs on every change); an empty list shows nothing.
   */
  suggestions?(params: Params<S>): readonly ParamSuggestion<Params<S>>[];
  /**
   * The subset of `exports` offered for these params, when it depends on
   * them (e.g. image exports only for some effects). Pure. Default: all.
   */
  exportsFor?(params: Params<S>): readonly ExportFormat[];
  /**
   * Hints about the current params shown above the controls (e.g. text that
   * misses WCAG contrast). Pure and cheap; `values` fill the message's
   * placeholders. An empty list shows nothing.
   */
  advisories?(params: Params<S>, ctx: RenderContext): readonly ToolAdvisory[];
  /**
   * Live view of a website inside the preview (screenshot beautifier,
   * M4b-AP07): sandboxed frames over parts of the preview and a capture
   * that turns what they show into image params. See `LiveView`.
   */
  liveView?: LiveView<Params<S>>;
}

/**
 * One live frame: a web page shown in a sandboxed `<iframe>` over a part of
 * the preview, at its own CSS viewport and scaled down to fit.
 */
export interface LiveFrame {
  /** Stable id within the design (e.g. the device). */
  readonly id: string;
  /** The page; an absolute https URL the tool has checked. */
  readonly url: string;
  /** Where the page shows, in design px. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Corner radii in design px: top left, top right, bottom right, bottom left. */
  readonly radii: readonly [number, number, number, number];
  /** CSS viewport of the page; the frame is scaled by `width / viewportWidth`. */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /**
   * SVG path data (design px) of what the design paints on top of this
   * area (devices in front, a camera cut-out); the frame is masked there.
   */
  readonly occluders: readonly string[];
  /** Image param (`kind: "image"`) that receives the captured view. */
  readonly param: string;
  /** i18n key of the frame's accessible title (e.g. the device name). */
  readonly titleKey: string;
}

export interface LiveView<P> {
  /** Frames for the current params; empty when the live view is off. Pure and cheap. */
  frames(params: P, ctx: RenderContext): readonly LiveFrame[];
  /** Params set together with the captured pictures (e.g. turning the live view off). */
  afterCapture?: Partial<P>;
}

/** A hint about the current params; see `ToolDefinition.advisories`. */
export interface ToolAdvisory {
  /** Stable id, unique within the tool. */
  id: string;
  /** i18n key of the message. */
  messageKey: string;
  /** Placeholder values of the message. */
  values?: Readonly<Record<string, string | number>>;
}

/** A tool of any schema, as stored in a registry. */
export type AnyToolDefinition = ToolDefinition<ParamsSchema>;
