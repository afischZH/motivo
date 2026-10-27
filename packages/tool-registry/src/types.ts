/**
 * The tool contract. Every generator in Motivo is a `ToolDefinition`; the
 * editor shell, persistence, API and SEO pages are derived from it, so a new
 * tool never needs tool-specific code outside its own definition file.
 */
import type { Rng } from "@motivo/engine";
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
 * Parameter schemas are always objects: locks, control hints and gating are
 * addressed per top-level key.
 */
export type ParamsSchema = z.ZodObject;

/** The parsed parameter object of a schema. */
export type Params<S extends ParamsSchema> = z.output<S>;

/** Top-level parameter keys of a parameter object. */
export type ParamKey<P> = keyof P & string;

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
  | "shape"
  | "image"
  | "hidden";

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
  /** Hides the control when this returns false. Must be pure. */
  visibleWhen?(params: P): boolean;
}

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
  params?: { readonly [K in ParamKey<P>]?: ControlHint<P> };
}

// ---------------------------------------------------------------------------
// Gating (enforced from M4; until then every tool is fully free)
// ---------------------------------------------------------------------------

/** Licence tiers in ascending order. A Team seat counts as `pro`. */
export const LICENSE_TIERS = ["free", "solo", "pro"] as const;
export type LicenseTier = (typeof LICENSE_TIERS)[number];

/**
 * Minimum tier per feature. Anything not listed is free, so `{}` means the
 * whole tool is free.
 */
export interface Gating<P> {
  /** Minimum tier to change a param away from its default. */
  params?: { readonly [K in ParamKey<P>]?: LicenseTier };
  /** Minimum tier per export format. */
  exports?: { readonly [F in ExportFormat]?: LicenseTier };
  /** Largest export edge in pixels per tier; a missing tier means no limit. */
  maxExportEdge?: { readonly [T in LicenseTier]?: number };
  /** Minimum tier per extra export, by `ExtraExport.id`. */
  extraExports?: Readonly<Record<string, LicenseTier>>;
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
  /** At least 6 presets with unique ids. */
  presets: readonly Preset<Params<S>>[];
  /** Initial canvas size. Default: `DEFAULT_CANVAS_SIZE`. */
  defaultSize?: CanvasSize;
  controls?: ControlHints<Params<S>>;
  /**
   * Returns a new param set for "new variant". Must be deterministic for a
   * given rng state, must not mutate `current`, and must copy every locked key
   * from `current` unchanged.
   */
  randomize(rng: Rng, current: Params<S>, locks: ReadonlySet<ParamKey<Params<S>>>): Params<S>;
  /** The single render path for preview and export. `render.kind` is the render kind. */
  render: Renderer<Params<S>>;
  exports: readonly ExportFormat[];
  /** Tool-specific text outputs, offered next to `exports`. */
  extraExports?: readonly ExtraExport<Params<S>>[];
  gating: Gating<Params<S>>;
  /** Needs an uploaded image (halftone, dither, ...). */
  needsImageInput?: boolean;
  /** Uses `RenderContext.t` (GIF/video export). */
  supportsAnimation?: boolean;
}

/** A tool of any schema, as stored in a registry. */
export type AnyToolDefinition = ToolDefinition<ParamsSchema>;
