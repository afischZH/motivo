/**
 * Strict whitelist sanitizer for user SVG files (uploads in Seamless
 * Patterns, later the Brand Kit). Pure TypeScript without DOM, so it runs in
 * the browser, in workers and on the server.
 *
 * The input is parsed by our own strict parser (`parse.ts`), rebuilt from
 * whitelisted elements and attributes only (`policy.ts`) and serialised
 * again. Nothing of the input is copied through as text: what is not
 * understood is dropped. Styles from `<style>` and `style=""` become
 * presentation attributes, so the output has no CSS at all.
 *
 * The result is safe to embed as an image (`<img>` or SVG `<image>` with a
 * data URI). It is still never inserted into a page as markup.
 *
 * Output is canonical: sanitising an already sanitised SVG returns the same
 * string, which callers use for cheap defence in depth (re-sanitising before
 * every render is a cache hit, see `sanitizeSvgCached`).
 */
import { matches, parseDeclarations, parseStylesheet, type CssRule } from "./css";
import { XmlParseError, parseXml, type ParseError, type XmlElement, type XmlNode } from "./parse";
import {
  ALLOWED_ELEMENTS,
  GEOMETRY,
  LOCAL_HREF_ELEMENTS,
  PRESENTATION,
  TEXT_ELEMENTS,
  UNWRAPPED_ELEMENTS,
  isSafeId,
  isSafeImageHref,
  isSafeValue,
} from "./policy";

export const SVG_NS = "http://www.w3.org/2000/svg";

/** Largest accepted SVG source in characters (about 1 MB). */
export const SVG_MAX_LENGTH = 1_048_576;
/** Nesting and element limits (deep or huge trees are rejected, not truncated). */
export const SVG_MAX_DEPTH = 64;
export const SVG_MAX_ELEMENTS = 20_000;
/** Most `<use>` elements kept; more are dropped (each may repeat a large group). */
export const SVG_MAX_USES = 2_000;

export type SanitizeError =
  ParseError | "too-large" | "not-svg" | "no-size" | "invalid-crop" | "invalid-color";

/** A rectangle in the SVG's own (viewBox) coordinates. */
export interface SvgRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SanitizeOptions {
  /** Longest accepted input. Default `SVG_MAX_LENGTH`. */
  maxLength?: number;
  /** Crops to this part of the viewBox (clamped to it). */
  crop?: SvgRect;
  /**
   * Recolours every fill, stroke and stop to this `#rrggbb` colour
   * ("monochrome"); opacity stays. Embedded raster images keep their colours.
   */
  recolor?: string;
}

export type SanitizeResult =
  | {
      ok: true;
      /** The sanitised document. */
      svg: string;
      /** Size of the (cropped) viewBox, also written as `width`/`height`. */
      width: number;
      height: number;
      viewBox: SvgRect;
      /**
       * How many unsafe or unsupported parts were removed (scripts, event
       * handlers, external references, unknown elements). Metadata, comments
       * and editor namespaces do not count.
       */
      removed: number;
    }
  | { ok: false; error: SanitizeError };

/** Removed silently: editor metadata and the stylesheets we inline. */
const SILENT_DROPS: ReadonlySet<string> = new Set(["title", "desc", "metadata", "style"]);

/** Attributes removed without counting (namespaces, editor data, harvested CSS). */
function isSilentAttribute(name: string): boolean {
  return (
    name === "xmlns" ||
    name.startsWith("xmlns:") ||
    name === "class" ||
    name === "style" ||
    name === "version" ||
    name === "baseProfile" ||
    name === "xml:space" ||
    name.startsWith("data-") ||
    name.startsWith("aria-") ||
    name === "role" ||
    name === "focusable" ||
    name === "enable-background" ||
    name.startsWith("sodipodi:") ||
    name.startsWith("inkscape:") ||
    name.startsWith("xml:")
  );
}

const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;

interface Out {
  name: string;
  attrs: Map<string, string>;
  children: (Out | string)[];
  parent: Out | null;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function fmt(value: number): string {
  const r = round(value);
  return Object.is(r, -0) ? "0" : String(r);
}

/** A plain length (`12`, `12.5px`); `null` for percentages, other units or junk. */
function plainLength(value: string | undefined): number | null {
  if (value === undefined) return null;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px)?\s*$/i.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseViewBox(value: string | undefined): SvgRect | null {
  if (value === undefined) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [x = 0, y = 0, width = 0, height = 0] = parts;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** Collects the text of every `<style>` element (any depth). */
function collectStyles(node: XmlElement, out: string[]): void {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (child.name === "style") {
      out.push(child.children.map((c) => (c.type === "text" ? c.value : "")).join(""));
    } else {
      collectStyles(child, out);
    }
  }
}

class Sanitizer {
  removed = 0;
  private readonly rules: CssRule[];

  constructor(rules: CssRule[]) {
    this.rules = rules;
  }

  /** Cascaded presentation values of an element: attributes < class rules < style attribute. */
  private presentation(el: XmlElement, tag: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const [name, value] of el.attrs) {
      if (!PRESENTATION.has(name)) continue;
      const v = name === "font-family" ? value.replace(/["']/g, "") : value;
      if (isSafeValue(name, v)) out.set(name, v);
      else this.removed++;
    }
    if (this.rules.length > 0) {
      const id = el.attrs.get("id");
      const classes = (el.attrs.get("class") ?? "").split(/\s+/).filter(Boolean);
      const hits: { specificity: number; order: number; rule: CssRule }[] = [];
      for (const rule of this.rules) {
        let best = -1;
        for (const s of rule.selectors) {
          if (matches(s, tag, id, classes)) best = Math.max(best, s.specificity);
        }
        if (best >= 0) hits.push({ specificity: best, order: rule.order, rule });
      }
      hits.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
      for (const hit of hits) for (const [k, v] of hit.rule.declarations) out.set(k, v);
    }
    const style = el.attrs.get("style");
    if (style !== undefined) for (const [k, v] of parseDeclarations(style)) out.set(k, v);
    return out;
  }

  /** Rebuilds one element, or returns `null` to drop it (and its subtree). */
  clean(el: XmlElement, parent: Out | null): Out | null {
    const xmlns = el.attrs.get("xmlns");
    const foreign = el.name.includes(":") || (xmlns !== undefined && xmlns !== SVG_NS);
    let tag = el.name;
    if (!foreign && UNWRAPPED_ELEMENTS.has(tag)) tag = "g";
    if (foreign || !ALLOWED_ELEMENTS.has(tag)) {
      if (
        !SILENT_DROPS.has(el.name) &&
        !el.name.startsWith("sodipodi:") &&
        !el.name.startsWith("inkscape:")
      ) {
        this.removed++;
      }
      return null;
    }

    const out: Out = { name: tag, attrs: new Map(), children: [], parent };

    for (const [name, value] of el.attrs) {
      if (PRESENTATION.has(name)) continue; // handled by the cascade below
      if (name === "href" || name === "xlink:href") continue; // handled below
      if (GEOMETRY.has(name)) {
        if (name === "id") {
          if (isSafeId(value)) out.attrs.set("id", value);
          else this.removed++;
        } else if (isSafeValue(name, value)) {
          out.attrs.set(name, value);
        } else {
          this.removed++;
        }
        continue;
      }
      if (!isSilentAttribute(name)) this.removed++;
    }
    for (const [name, value] of this.presentation(el, el.name)) out.attrs.set(name, value);

    // References: only to this document (`#id`) or embedded raster images.
    const href = el.attrs.get("href") ?? el.attrs.get("xlink:href");
    if (href !== undefined) {
      const trimmed = href.trim();
      if (tag === "image") {
        if (isSafeImageHref(trimmed)) out.attrs.set("href", trimmed.replace(/\s+/g, ""));
        else this.removed++;
      } else if (LOCAL_HREF_ELEMENTS.has(tag) && /^#[A-Za-z_][\w.-]{0,199}$/.test(trimmed)) {
        out.attrs.set("href", trimmed);
      } else {
        this.removed++;
      }
    }
    // An image without a safe source, or a use without a target, draws nothing useful.
    if ((tag === "image" || tag === "use") && !out.attrs.has("href")) return null;

    for (const child of el.children) {
      if (child.type === "text") {
        if (TEXT_ELEMENTS.has(tag) && child.value.trim() !== "") {
          out.children.push(child.value.replace(/\s+/g, " "));
        }
        continue;
      }
      const cleaned = this.clean(child, out);
      if (cleaned) out.children.push(cleaned);
    }
    return out;
  }
}

function* walk(node: Out): Generator<Out> {
  yield node;
  for (const child of node.children) if (typeof child !== "string") yield* walk(child);
}

/** Adds every node whose subtree contains a `<use>` to `out`, in one pass. */
function markUseContainers(node: Out, out: Set<Out>): boolean {
  let has = node.name === "use";
  for (const child of node.children) {
    if (typeof child !== "string" && markUseContainers(child, out)) has = true;
  }
  if (has) out.add(node);
  return has;
}

function isAncestor(candidate: Out, node: Out): boolean {
  for (let p: Out | null = node; p; p = p.parent) if (p === candidate) return true;
  return false;
}

function removeNode(node: Out): void {
  const parent = node.parent;
  if (!parent) return;
  const index = parent.children.indexOf(node);
  if (index !== -1) parent.children.splice(index, 1);
}

/**
 * `<use>` may only point at an existing element of this document that is
 * not one of its ancestors and contains no `<use>` itself. That rules out
 * reference cycles and the exponential "use of a use of a use" blow-up.
 */
function checkUses(root: Out): number {
  const ids = new Map<string, Out>();
  for (const n of walk(root)) {
    const id = n.attrs.get("id");
    if (id !== undefined && !ids.has(id)) ids.set(id, n);
  }
  const all = [...walk(root)];
  const uses = all.filter((n) => n.name === "use");
  // Decided on the tree as parsed, so the result does not depend on document order.
  const withUse = new Set<Out>();
  markUseContainers(root, withUse);
  let removed = 0;
  let kept = 0;
  for (const use of uses) {
    const target = ids.get((use.attrs.get("href") ?? "").slice(1));
    const ok =
      kept < SVG_MAX_USES &&
      target !== undefined &&
      !isAncestor(target, use) &&
      !withUse.has(target);
    if (ok) kept++;
    else {
      removeNode(use);
      removed++;
    }
  }
  return removed;
}

const RECOLOR_PAINT = ["fill", "stroke"] as const;
const RECOLOR_ALWAYS = ["stop-color", "flood-color", "lighting-color", "color"] as const;

function recolor(root: Out, color: string): void {
  for (const n of walk(root)) {
    for (const name of RECOLOR_PAINT) {
      const value = n.attrs.get(name);
      if (value === undefined) continue;
      const v = value.trim().toLowerCase();
      if (v !== "none" && v !== "transparent") n.attrs.set(name, color);
    }
    for (const name of RECOLOR_ALWAYS) if (n.attrs.has(name)) n.attrs.set(name, color);
  }
  // Shapes without their own fill inherit it from the root (SVG default: black).
  if (!root.attrs.has("fill")) root.attrs.set("fill", color);
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Root attributes first in a fixed order, then the rest sorted, for canonical output. */
const ROOT_ORDER = ["xmlns", "viewBox", "width", "height"];

function serialize(node: Out | string): string {
  if (typeof node === "string") return escapeText(node);
  const keys = [...node.attrs.keys()];
  const ordered =
    node.parent === null
      ? [
          ...ROOT_ORDER.filter((k) => node.attrs.has(k)),
          ...keys.filter((k) => !ROOT_ORDER.includes(k)).sort(),
        ]
      : keys.sort();
  let out = `<${node.name}`;
  for (const key of ordered) out += ` ${key}="${escapeAttr(node.attrs.get(key) ?? "")}"`;
  if (node.children.length === 0) return `${out}/>`;
  return `${out}>${node.children.map(serialize).join("")}</${node.name}>`;
}

function clampCrop(crop: SvgRect, box: SvgRect): SvgRect | null {
  const values = [crop.x, crop.y, crop.width, crop.height];
  if (!values.every(Number.isFinite)) return null;
  const x0 = Math.max(box.x, Math.min(crop.x, box.x + box.width));
  const y0 = Math.max(box.y, Math.min(crop.y, box.y + box.height));
  const x1 = Math.max(box.x, Math.min(crop.x + crop.width, box.x + box.width));
  const y1 = Math.max(box.y, Math.min(crop.y + crop.height, box.y + box.height));
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return null;
  return { x: round(x0), y: round(y0), width: round(x1 - x0), height: round(y1 - y0) };
}

/** Sanitises an SVG document. Never throws. */
export function sanitizeSvg(input: string, options: SanitizeOptions = {}): SanitizeResult {
  if (typeof input !== "string") return { ok: false, error: "not-svg" };
  if (input.length > (options.maxLength ?? SVG_MAX_LENGTH))
    return { ok: false, error: "too-large" };
  if (options.recolor !== undefined && !HEX.test(options.recolor)) {
    return { ok: false, error: "invalid-color" };
  }

  let tree: XmlElement;
  try {
    tree = parseXml(input, { maxDepth: SVG_MAX_DEPTH, maxElements: SVG_MAX_ELEMENTS });
  } catch (error) {
    return { ok: false, error: error instanceof XmlParseError ? error.code : "malformed" };
  }
  const xmlns = tree.attrs.get("xmlns");
  if (tree.name !== "svg" || (xmlns !== undefined && xmlns !== SVG_NS)) {
    return { ok: false, error: "not-svg" };
  }

  const box =
    parseViewBox(tree.attrs.get("viewBox")) ??
    (() => {
      const w = plainLength(tree.attrs.get("width"));
      const h = plainLength(tree.attrs.get("height"));
      return w !== null && h !== null ? { x: 0, y: 0, width: w, height: h } : null;
    })();
  if (!box) return { ok: false, error: "no-size" };
  let view = box;
  if (options.crop) {
    const cropped = clampCrop(options.crop, box);
    if (!cropped) return { ok: false, error: "invalid-crop" };
    view = cropped;
  }

  const styles: string[] = [];
  collectStyles(tree, styles);
  let order = 0;
  const rules = styles.flatMap((css) => {
    const parsed = parseStylesheet(css, order);
    order += parsed.length;
    return parsed;
  });

  const sanitizer = new Sanitizer(rules);
  const root = sanitizer.clean(tree, null);
  if (!root) return { ok: false, error: "not-svg" };
  const removed = sanitizer.removed + checkUses(root);

  // The root gets a fixed coordinate system; size and placement come from the viewer.
  for (const name of ["x", "y", "width", "height", "viewBox", "preserveAspectRatio", "transform"]) {
    root.attrs.delete(name);
  }
  root.attrs.set("xmlns", SVG_NS);
  root.attrs.set("viewBox", `${fmt(view.x)} ${fmt(view.y)} ${fmt(view.width)} ${fmt(view.height)}`);
  root.attrs.set("width", fmt(view.width));
  root.attrs.set("height", fmt(view.height));

  if (options.recolor !== undefined) recolor(root, options.recolor.toLowerCase());

  return {
    ok: true,
    svg: serialize(root),
    width: round(view.width),
    height: round(view.height),
    viewBox: view,
    removed,
  };
}

/**
 * `sanitizeSvg` with a small memo per (input, recolour), for renderers that
 * re-sanitise the same upload on every frame. Strings are compared by value;
 * V8 caches string hashes, so a hit on the same string instance is cheap.
 */
const MEMO_INPUTS = 4;
const MEMO_VARIANTS = 16;
const memo = new Map<string, Map<string, SanitizeResult>>();

export function sanitizeSvgCached(
  input: string,
  options: Pick<SanitizeOptions, "recolor"> = {},
): SanitizeResult {
  const variant = options.recolor ?? "";
  let entries = memo.get(input);
  const hit = entries?.get(variant);
  if (hit) return hit;
  const result = sanitizeSvg(input, options);
  if (!entries) {
    if (memo.size >= MEMO_INPUTS) {
      const oldest = memo.keys().next().value;
      if (oldest !== undefined) memo.delete(oldest);
    }
    entries = new Map();
    memo.set(input, entries);
  }
  if (entries.size >= MEMO_VARIANTS) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  entries.set(variant, result);
  return result;
}

export type { XmlNode };
