/**
 * Small helpers for compact SVG string output.
 */
import { formatNumber } from "./curves";

/** Root `<svg>` element with xmlns, pixel size and matching viewBox. */
export function svgDocument(width: number, height: number, body: string): string {
  const w = formatNumber(width);
  const h = formatNumber(height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/** Full-size background rect, or an empty string for `"transparent"`. */
export function svgBackground(background: string, width: number, height: number): string {
  if (background === "transparent") return "";
  return `<rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${background}"/>`;
}

/**
 * Deterministic id for `<defs>` content (gradients, clip paths). Derived from
 * the content itself, so several inline SVGs on one page only share an id when
 * the referenced definition is identical, which renders the same either way.
 */
export function stableId(prefix: string, content: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${prefix}${(h >>> 0).toString(36)}`;
}

/**
 * Gradient vector of a CSS-style angle (0 = to top, 90 = to right) in
 * objectBoundingBox units, as SVG attributes.
 */
export function bboxGradientVector(angleDeg: number): string {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a) / 2;
  const dy = -Math.cos(a) / 2;
  const f = (v: number): string => formatNumber(v, 3);
  return `x1="${f(0.5 - dx)}" y1="${f(0.5 - dy)}" x2="${f(0.5 + dx)}" y2="${f(0.5 + dy)}"`;
}

/** Characters XML forbids: C0 controls except tab and newlines, U+FFFE, U+FFFF. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const XML_INVALID = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;
/** Lone surrogate halves (not valid in XML either). */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * Escapes text for XML and HTML, in content and in quoted attributes
 * (`&`, `<`, `>`, `"`, `'`), and drops characters XML forbids, so user text
 * can never break out of an element or attribute or corrupt the document.
 */
export function escapeXml(text: string): string {
  return text
    .replace(XML_INVALID, "")
    .replace(LONE_SURROGATE, "")
    .replace(/[&<>"']/g, (c) =>
      c === "&"
        ? "&amp;"
        : c === "<"
          ? "&lt;"
          : c === ">"
            ? "&gt;"
            : c === '"'
              ? "&quot;"
              : "&#39;",
    );
}
