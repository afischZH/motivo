/**
 * The whitelist: which elements, attributes and values survive. Anything not
 * listed here is removed. The output never contains `<style>`, `style=""`,
 * scripts, event handlers, animation, `foreignObject` or any reference that
 * leaves the document (only `#id` and embedded raster `data:` images).
 */

/** Elements kept as they are. */
export const ALLOWED_ELEMENTS: ReadonlySet<string> = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "image",
  "filter",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feFuncR",
  "feFuncG",
  "feFuncB",
  "feFuncA",
  "feComposite",
  "feDropShadow",
  "feFlood",
  "feGaussianBlur",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "feTile",
]);

/**
 * Containers rewritten to a plain `<g>`: their children stay, their own
 * behaviour (links, conditional rendering) goes.
 */
export const UNWRAPPED_ELEMENTS: ReadonlySet<string> = new Set(["a", "switch"]);

/** Elements whose text content is kept. */
export const TEXT_ELEMENTS: ReadonlySet<string> = new Set(["text", "tspan"]);

/** Elements that may reference another element of the document by `href="#id"`. */
export const LOCAL_HREF_ELEMENTS: ReadonlySet<string> = new Set([
  "use",
  "linearGradient",
  "radialGradient",
  "pattern",
  "filter",
]);

/** Presentation properties: allowed as attribute and as CSS (style attribute or class rule). */
export const PRESENTATION: ReadonlySet<string> = new Set([
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "clip-path",
  "clip-rule",
  "mask",
  "filter",
  "display",
  "visibility",
  "color",
  "paint-order",
  "vector-effect",
  "shape-rendering",
  "color-interpolation",
  "color-interpolation-filters",
  "marker-start",
  "marker-mid",
  "marker-end",
  "stop-color",
  "stop-opacity",
  "flood-color",
  "flood-opacity",
  "lighting-color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "baseline-shift",
  "letter-spacing",
  "word-spacing",
  "text-decoration",
  "writing-mode",
]);

/** Geometry and structure attributes (never accepted from CSS). */
export const GEOMETRY: ReadonlySet<string> = new Set([
  "id",
  "transform",
  "x",
  "y",
  "width",
  "height",
  "rx",
  "ry",
  "cx",
  "cy",
  "r",
  "x1",
  "y1",
  "x2",
  "y2",
  "d",
  "points",
  "pathLength",
  "viewBox",
  "preserveAspectRatio",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "fx",
  "fy",
  "fr",
  "offset",
  "patternUnits",
  "patternContentUnits",
  "patternTransform",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "markerWidth",
  "markerHeight",
  "markerUnits",
  "refX",
  "refY",
  "orient",
  "filterUnits",
  "primitiveUnits",
  "in",
  "in2",
  "result",
  "stdDeviation",
  "dx",
  "dy",
  "mode",
  "operator",
  "k1",
  "k2",
  "k3",
  "k4",
  "values",
  "type",
  "tableValues",
  "slope",
  "intercept",
  "amplitude",
  "exponent",
  "radius",
  "edgeMode",
  "rotate",
  "textLength",
  "lengthAdjust",
]);

/** Attributes whose values may be long (path data, point lists). */
export const LONG_VALUES: ReadonlySet<string> = new Set(["d", "points", "values", "tableValues"]);

/** Longest accepted value of a normal attribute and of a long one. */
export const MAX_VALUE_LENGTH = 4096;
export const MAX_LONG_VALUE_LENGTH = 1_000_000;

/** CSS-like functions a value may call. `url()` is checked separately (only `#id`). */
const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  "url",
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "translate",
  "translatex",
  "translatey",
  "rotate",
  "scale",
  "scalex",
  "scaley",
  "matrix",
  "skewx",
  "skewy",
]);

const ID_PATTERN = /^[A-Za-z_][\w.-]{0,199}$/;
const LOCAL_URL = /^url\(\s*(['"]?)#([A-Za-z_][\w.-]{0,199})\1\s*\)$/;
const PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAaEe0-9.,+\-\s]*$/;
const NUMBER_LIST = /^[0-9eE.,+\-\s]*$/;

const isFnChar = (code: number): boolean => (code >= 0x61 && code <= 0x7a) || code === 0x2d; // a-z and "-"
const isSpace = (code: number): boolean =>
  code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d || code === 0x0c;

/**
 * Whether every `name(` in the (lower-cased) value calls an allowed function.
 * A linear scan backwards from each `(`: a regex like `/([a-z-]*)\s*\(/g`
 * backtracks quadratically on long letter runs without a parenthesis.
 */
function functionsAllowed(lower: string): boolean {
  let from = 0;
  for (;;) {
    const paren = lower.indexOf("(", from);
    if (paren === -1) return true;
    let end = paren;
    while (end > from && isSpace(lower.charCodeAt(end - 1))) end--;
    let start = end;
    while (start > from && isFnChar(lower.charCodeAt(start - 1))) start--;
    if (!ALLOWED_FUNCTIONS.has(lower.slice(start, end))) return false;
    from = paren + 1;
  }
}

/** Whether `id` is a plain, safe XML id. */
export function isSafeId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** The id inside `url(#id)`, or `null` if the value is anything else. */
export function localUrlTarget(value: string): string | null {
  return LOCAL_URL.exec(value.trim())?.[2] ?? null;
}

/**
 * Whether a presentation or geometry value is harmless: bounded length, no
 * markup or CSS syntax characters, only whitelisted functions and `url()`
 * only to a local `#id`.
 */
export function isSafeValue(name: string, value: string): boolean {
  const max = LONG_VALUES.has(name) ? MAX_LONG_VALUE_LENGTH : MAX_VALUE_LENGTH;
  if (value.length > max) return false;
  if (name === "d") return PATH_DATA.test(value);
  if (name === "points") return NUMBER_LIST.test(value);
  // Characters with meaning in CSS or markup never appear in plain SVG values.
  if (/[<>{};\\@`]/.test(value)) return false;
  // Every `name(` must be an allowed function; url() only to a local id.
  const lower = value.toLowerCase();
  if (!functionsAllowed(lower)) return false;
  if (lower.includes("url")) {
    const urls = value.match(/url\s*\([^)]*\)/gi) ?? [];
    const total = (lower.match(/url/g) ?? []).length;
    if (urls.length !== total) return false;
    if (!urls.every((u) => localUrlTarget(u) !== null)) return false;
  }
  if (/(?:java|vb)script\s*:|data\s*:|expression/i.test(value)) return false;
  // Quotes only make sense in font names.
  if (/["']/.test(value) && name !== "font-family") return false;
  return true;
}

const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Longest embedded raster image inside an uploaded SVG (characters of the data URI). */
export const MAX_EMBEDDED_IMAGE = 4_000_000;

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decodes the first bytes of a base64 string (enough for a file signature). */
function base64Head(b64: string, bytes: number): number[] {
  const out: number[] = [];
  let bits = 0;
  let buffer = 0;
  for (let i = 0; i < b64.length && out.length < bytes; i++) {
    const v = BASE64_ALPHABET.indexOf(b64.charAt(i));
    if (v === -1) break;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

const startsWith = (head: readonly number[], sig: readonly number[], at = 0): boolean =>
  sig.every((b, i) => head[at + i] === b);

/**
 * Whether the decoded bytes carry the signature of the declared type, so an
 * SVG or HTML document cannot hide behind `data:image/png` (browsers do not
 * sniff SVG in images today; this keeps it that way should one ever do).
 */
function magicMatches(type: string, head: readonly number[]): boolean {
  switch (type) {
    case "png":
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpeg":
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case "gif":
      return startsWith(head, [0x47, 0x49, 0x46, 0x38]); // GIF8
    case "webp":
      return (
        startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)
      );
    default:
      return false;
  }
}

/** Whether `href` is an embedded raster image (never SVG, never remote). */
export function isSafeImageHref(href: string): boolean {
  const compact = href.replace(/\s+/g, "");
  if (compact.length > MAX_EMBEDDED_IMAGE) return false;
  const m = DATA_IMAGE.exec(compact);
  if (!m) return false;
  const payload = compact.slice(compact.indexOf(",") + 1);
  return magicMatches(m[1] ?? "", base64Head(payload, 12));
}
