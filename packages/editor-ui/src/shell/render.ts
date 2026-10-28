/**
 * Preview rendering. Calls the tool's single `render` function (the same one
 * the exporters use) and turns the result into something React can show
 * without injecting markup: SVG as a data URL for `<img>`, CSS as a style
 * object.
 */
import {
  createRenderContext,
  isImageEffectTool,
  type AnyToolDefinition,
  type CanvasSize,
  type RenderKind,
} from "@musterli/tool-registry";
import type { ParamValues } from "../store/editor-store";

/** A React-compatible inline style: camelCase or custom-property keys. */
export type MotifStyle = Readonly<Record<string, string>>;

/**
 * One CSS declaration list, grouped by property. Repeated properties keep all
 * values in source order (fallback first, progressive enhancement last).
 */
export type CssDeclarations = readonly (readonly [property: string, values: readonly string[]])[];

/** A box of a CSS element with parsed declarations. */
export interface MotifBox {
  x: number;
  y: number;
  width: number;
  height: number;
  declarations: CssDeclarations;
}

/** `CssElement` of a CSS output with parsed declarations. */
export interface MotifElement extends MotifBox {
  /** Applied only when the viewer allows motion. */
  motion: CssDeclarations;
  content: readonly MotifBox[];
}

export type MotifOutput =
  | { kind: "svg"; svg: string }
  | {
      kind: "css";
      css: string;
      declarations: CssDeclarations;
      element?: MotifElement;
      /** Global rules (`@property`, `@keyframes`) for a stylesheet. */
      rules?: string;
    }
  | {
      /**
       * An image effect: the pixels come from the raster-effect worker
       * (`RasterMotif`), so the output only names the design.
       */
      kind: "raster";
      tool: AnyToolDefinition;
      params: ParamValues;
      seed: number;
      size: CanvasSize;
    }
  | { kind: "unsupported"; renderKind: RenderKind };

const box = (b: { x: number; y: number; width: number; height: number; css: string }) => ({
  x: b.x,
  y: b.y,
  width: b.width,
  height: b.height,
  declarations: parseCssDeclarations(b.css),
});

/** Renders one design through the tool's render path. */
export function renderMotif(
  tool: AnyToolDefinition,
  params: ParamValues,
  seed: number,
  size: CanvasSize,
): MotifOutput {
  const ctx = createRenderContext(seed, size);
  // The store only holds params that passed the tool's schema.
  const p = params as Parameters<typeof tool.randomize>[1];
  const renderer = tool.render;
  switch (renderer.kind) {
    case "svg":
      return { kind: "svg", svg: renderer.render(p, ctx) };
    case "css": {
      const out = renderer.render(p, ctx);
      const motif: MotifOutput = {
        kind: "css",
        css: out.css,
        declarations: parseCssDeclarations(out.css),
      };
      if (out.element) {
        motif.element = {
          ...box(out.element),
          motion: parseCssDeclarations(out.element.motionCss ?? ""),
          content: (out.element.content ?? []).map(box),
        };
      }
      if (out.rules) motif.rules = out.rules;
      return motif;
    }
    case "image-effect":
      return isImageEffectTool(tool)
        ? { kind: "raster", tool, params, seed, size: { width: size.width, height: size.height } }
        : { kind: "unsupported", renderKind: renderer.kind };
    default:
      return { kind: "unsupported", renderKind: renderer.kind };
  }
}

import { svgDataUrl } from "./svg-data-url";

export { svgDataUrl };

/**
 * Recent outputs per params object (the store replaces params on every
 * change, so object identity plus seed and size identify a design). Lets
 * the filmstrip tile of the active variant reuse the preview's render
 * instead of rendering and decoding the same design a second time.
 */
const outputCache = new WeakMap<object, Map<string, MotifOutput>>();
/** Entries kept per params object (preview size, thumbnail size, a few resizes). */
const CACHE_ENTRIES_PER_PARAMS = 4;

const cacheKey = (tool: AnyToolDefinition, seed: number, size: CanvasSize) =>
  `${tool.id}@${tool.version}:${seed}:${size.width}x${size.height}`;

/** A previously rendered output for exactly this design, if any. Never renders. */
export function peekMotif(
  tool: AnyToolDefinition,
  params: ParamValues,
  seed: number,
  size: CanvasSize,
): MotifOutput | undefined {
  return outputCache.get(params)?.get(cacheKey(tool, seed, size));
}

/** `renderMotif` with the per-params cache described above. */
export function renderMotifCached(
  tool: AnyToolDefinition,
  params: ParamValues,
  seed: number,
  size: CanvasSize,
): MotifOutput {
  const key = cacheKey(tool, seed, size);
  let entries = outputCache.get(params);
  const hit = entries?.get(key);
  if (hit) return hit;
  const output = renderMotif(tool, params, seed, size);
  if (!entries) {
    entries = new Map();
    outputCache.set(params, entries);
  }
  if (entries.size >= CACHE_ENTRIES_PER_PARAMS) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  entries.set(key, output);
  return output;
}

const dataUrlCache = new WeakMap<MotifOutput, string>();

/** `svgDataUrl` of an SVG output, computed once per output object. */
export function motifDataUrl(output: Extract<MotifOutput, { kind: "svg" }>): string {
  let url = dataUrlCache.get(output);
  if (url === undefined) {
    url = svgDataUrl(output.svg);
    dataUrlCache.set(output, url);
  }
  return url;
}

/**
 * Splits `prop: value; prop: value` into declarations. Semicolons inside
 * parentheses or quotes (data URLs, `url("a;b")`) do not end a declaration.
 */
export function parseCssDeclarations(css: string): CssDeclarations {
  const order: string[] = [];
  const values = new Map<string, string[]>();
  const push = (raw: string) => {
    const colon = raw.indexOf(":");
    if (colon <= 0) return;
    const property = raw.slice(0, colon).trim().toLowerCase();
    const value = raw.slice(colon + 1).trim();
    if (!property || !value) return;
    const list = values.get(property);
    if (list) list.push(value);
    else {
      values.set(property, [value]);
      order.push(property);
    }
  };

  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  /** Index of the next backslash at or after the scan position (searched again once passed). */
  let nextEscape = -1;
  /**
   * Index of the next current quote character, cached like `nextEscape`
   * (Infinity: none). Searching again per character made values with many
   * escapes, or an unterminated quote, quadratic (M4b-AP05).
   */
  let nextClose = -1;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote !== null) {
      // Jump to the closing quote when no escape comes first: a data URL of
      // several megabytes (an uploaded picture) is skipped in native code.
      if (nextClose < i) {
        const found = css.indexOf(quote, i);
        nextClose = found === -1 ? Infinity : found;
      }
      if (nextEscape < i) {
        const found = css.indexOf("\\", i);
        nextEscape = found === -1 ? Infinity : found;
      }
      if (nextClose !== Infinity && nextEscape > nextClose) {
        i = nextClose;
        quote = null;
      } else if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      nextClose = -1;
    } else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      push(css.slice(start, i));
      start = i + 1;
    }
  }
  push(css.slice(start));
  return order.map((property) => [property, values.get(property) ?? []] as const);
}

/** `background-image` -> `backgroundImage`, `-webkit-mask` -> `WebkitMask`, `--x` stays. */
export function toReactStyleProperty(property: string): string {
  if (property.startsWith("--")) return property;
  const camel = property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return property.startsWith("-") ? camel.charAt(0).toUpperCase() + camel.slice(1) : camel;
}

export type CssSupports = (property: string, value: string) => boolean;

/**
 * Builds a React style object. A style object holds one value per property,
 * so for repeated properties the last value the browser supports wins, as it
 * would in a stylesheet. Without `supports` (server render, first client
 * render) the first value, the fallback, is used.
 */
export function cssToStyle(declarations: CssDeclarations, supports?: CssSupports): MotifStyle {
  const style: Record<string, string> = {};
  for (const [property, list] of declarations) {
    let chosen = list[0];
    if (supports) {
      for (let i = list.length - 1; i > 0; i--) {
        const candidate = list[i];
        if (candidate !== undefined && supports(property, candidate)) {
          chosen = candidate;
          break;
        }
      }
    }
    if (chosen !== undefined) style[toReactStyleProperty(property)] = chosen;
  }
  return style;
}
