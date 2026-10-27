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
