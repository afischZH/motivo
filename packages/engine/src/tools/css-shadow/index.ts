/**
 * Layered CSS shadows (docs/TOOLS.md J1): several `box-shadow` layers whose
 * offset and blur grow along an easing curve, which looks softer and more
 * natural than one large shadow.
 *
 * Layer i of n (i = 1 ... n, t = i / n) gets offset, blur and spread
 * `max * ease(t)` and an opacity share weighted slightly towards the small,
 * close layers (weight 2 - ease(t), normalised so the shares add up to
 * `opacity`). Lengths are rounded to 0.1 px, alphas to 0.001.
 *
 * The same layer list drives the CSS (`box-shadow`, Tailwind, variables,
 * `filter: drop-shadow()`) and the SVG twin used for image exports, which
 * draws each layer as a rounded rectangle blurred with a Gaussian of
 * standard deviation blur / 2, as CSS Backgrounds 3 defines the blur radius.
 */
import { hexToOklch, hexToRgb, oklchToHex } from "../../color";
import { formatNumber } from "../../curves";
import { ease } from "../../easing";
import { stableId, svgDocument } from "../../svg";
import { cssGradient } from "../css-gradient";
import { cssPattern } from "../css-patterns";

export const SHADOW_EASINGS = ["linear", "ease-out", "exponential"] as const;
export type ShadowEasing = (typeof SHADOW_EASINGS)[number];

export const SHADOW_LAYERS_MIN = 1;
export const SHADOW_LAYERS_MAX = 8;

export interface ShadowOptions {
  /** Number of layers, 1 to 8. */
  readonly layers: number;
  /** Offset of the largest layer in px. */
  readonly distance: number;
  /** Blur radius of the largest layer in px. */
  readonly blur: number;
  /** Spread of the largest layer in px (may be negative). */
  readonly spread: number;
  /** Direction the light comes from: 0 = top, clockwise in degrees. */
  readonly angle: number;
  /** Combined opacity of all layers, 0 to 1. */
  readonly opacity: number;
  readonly easing: ShadowEasing;
}

export interface ShadowLayer {
  readonly x: number;
  readonly y: number;
  readonly blur: number;
  readonly spread: number;
  readonly alpha: number;
}

const round1 = (v: number): number => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
};
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Growth of layer `t` in (0, 1]: `exponential` doubles from layer to layer. */
export function shadowEase(easing: ShadowEasing, t: number, layers: number): number {
  if (t >= 1) return 1;
  if (easing === "exponential") return 2 ** (layers * (t - 1));
  return ease(easing, t);
}

/** The layers, smallest (closest) first, as in the CSS value. */
export function shadowLayers(o: ShadowOptions): ShadowLayer[] {
  const n = Math.min(SHADOW_LAYERS_MAX, Math.max(SHADOW_LAYERS_MIN, Math.round(o.layers)));
  const a = (o.angle * Math.PI) / 180;
  const dirX = -Math.sin(a);
  const dirY = Math.cos(a);
  const eased = Array.from({ length: n }, (_, k) => shadowEase(o.easing, (k + 1) / n, n));
  const weights = eased.map((e) => 2 - e);
  const total = weights.reduce((s, w) => s + w, 0);
  return eased.map((e, k) => {
    const d = o.distance * e;
    return {
      x: round1(dirX * d),
      y: round1(dirY * d),
      blur: round1(Math.max(0, o.blur * e)),
      spread: round1(o.spread * e),
      alpha: round3((o.opacity * (weights[k] as number)) / total),
    };
  });
}

const px = (v: number): string => (v === 0 ? "0" : `${formatNumber(v, 1)}px`);

/** `rgb(r g b / a)` of a hex colour. */
export function shadowColor(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const c = (v: number): number => Math.round(v * 255);
  return `rgb(${c(r)} ${c(g)} ${c(b)} / ${formatNumber(alpha, 3)})`;
}

/** One `box-shadow` entry per layer. */
export function boxShadowEntries(
  layers: readonly ShadowLayer[],
  color: string,
  inset: boolean,
): string[] {
  return layers.map(
    (l) =>
      `${inset ? "inset " : ""}${px(l.x)} ${px(l.y)} ${px(l.blur)} ${px(l.spread)} ${shadowColor(color, l.alpha)}`,
  );
}

/** The `box-shadow` value, one layer per line (indented continuation lines). */
export function boxShadowValue(
  layers: readonly ShadowLayer[],
  color: string,
  inset: boolean,
): string {
  return boxShadowEntries(layers, color, inset).join(",\n    ");
}

/**
 * `filter: drop-shadow()` chain for cut-out shapes. Its third length is a
 * standard deviation (Filter Effects 1), half the box-shadow blur radius;
 * `drop-shadow()` has no spread and no inset.
 */
export function dropShadowValue(layers: readonly ShadowLayer[], color: string): string {
  return layers
    .map(
      (l) =>
        `drop-shadow(${px(l.x)} ${px(l.y)} ${px(round1(l.blur / 2))} ${shadowColor(color, l.alpha)})`,
    )
    .join("\n    ");
}

/** Tailwind arbitrary value body: spaces become underscores, existing ones escaped. */
export function tailwindArbitraryValue(value: string): string {
  return value.trim().replace(/_/g, "\\_").replace(/\s+/g, "_");
}

/** `shadow-[...]` with all layers (commas need no escaping in Tailwind). */
export function shadowTailwindClass(
  layers: readonly ShadowLayer[],
  color: string,
  inset: boolean,
): string {
  return `shadow-[${boxShadowEntries(layers, color, inset).map(tailwindArbitraryValue).join(",")}]`;
}

/**
 * A shadow colour that fits a surface: the surface's hue at low lightness and
 * little chroma, instead of plain black (docs/TOOLS.md J1).
 */
export function shadowAutoColor(surface: string): string {
  const { c, h } = hexToOklch(surface);
  return oklchToHex({ l: 0.24, c: Math.min(c, 0.05), h });
}

// ---------------------------------------------------------------------------
// Stage (the Musterli background the preview element sits on)
// ---------------------------------------------------------------------------

export const SHADOW_STAGES = ["solid", "gradient", "dots", "grid"] as const;
export type ShadowStage = (typeof SHADOW_STAGES)[number];

function shade(hex: string, dl: number): string {
  const { l, c, h } = hexToOklch(hex);
  return oklchToHex({ l: Math.min(1, Math.max(0, l + dl)), c, h });
}

export interface StageOutput {
  /** CSS declarations filling the canvas. */
  readonly css: string;
  /** SVG markup of the same background (a nested `<svg>` or a rect). */
  readonly svg: string;
}

/**
 * The stage built with Musterli's own generators (CSS gradient, CSS
 * patterns), derived from one surface colour.
 */
export function shadowStage(
  stage: ShadowStage,
  surface: string,
  width: number,
  height: number,
): StageOutput {
  const w = formatNumber(width);
  const h = formatNumber(height);
  if (stage === "gradient") {
    const out = cssGradient({
      type: "linear",
      colors: [shade(surface, 0.05), shade(surface, -0.07)],
      angle: 160,
      centerX: 50,
      centerY: 50,
      shape: "ellipse",
      interpolation: "oklch",
      hue: "shorter",
      easing: "ease-in-out",
      steps: 6,
      loop: false,
      width,
      height,
    });
    return { css: out.css, svg: out.previewSvg };
  }
  if (stage === "dots" || stage === "grid") {
    const out = cssPattern({
      pattern: stage === "dots" ? "polka" : "grid-lines",
      color: shade(surface, -0.12),
      accent: shade(surface, -0.12),
      size: stage === "dots" ? 28 : 32,
      angle: 0,
      opacity: stage === "dots" ? 60 : 45,
      background: surface,
      width,
      height,
    });
    return { css: out.css, svg: out.svg };
  }
  return {
    css: `background-color: ${surface};`,
    svg: `<rect width="${w}" height="${h}" fill="${surface}"/>`,
  };
}

// ---------------------------------------------------------------------------
// Preview element and SVG twin
// ---------------------------------------------------------------------------

export const SHADOW_SHAPES = ["card", "button"] as const;
export type ShadowShape = (typeof SHADOW_SHAPES)[number];

export interface ElementBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Size and centred position of the preview element on a canvas. */
export function shadowElementBox(shape: ShadowShape, width: number, height: number): ElementBox {
  const m = Math.min(width, height);
  let w: number;
  let h: number;
  if (shape === "button") {
    w = Math.round(Math.min(width * 0.6, m * 0.42));
    h = Math.round(w * 0.3);
  } else {
    w = Math.round(Math.min(width * 0.62, m * 0.8));
    h = Math.round(Math.min(w * 0.62, height * 0.62));
  }
  w = Math.max(8, w);
  h = Math.max(4, h);
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

/** Corner radius after spread (CSS Backgrounds 3: grows with spread, square corners stay square). */
function spreadRadius(radius: number, spread: number): number {
  if (radius <= 0) return 0;
  return Math.max(0, radius + spread);
}

const f = (v: number): string => formatNumber(v, 2);

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (w <= 0 || h <= 0) return "";
  if (rr === 0) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
  return (
    `M${f(x + rr)} ${f(y)}h${f(w - 2 * rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(rr)}` +
    `v${f(h - 2 * rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(-rr)} ${f(rr)}h${f(-(w - 2 * rr))}` +
    `a${f(rr)} ${f(rr)} 0 0 1 ${f(-rr)} ${f(-rr)}v${f(-(h - 2 * rr))}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(-rr)}Z`
  );
}

export interface ShadowSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly layers: readonly ShadowLayer[];
  readonly color: string;
  readonly inset: boolean;
  readonly radius: number;
  readonly element: ElementBox;
  readonly elementColor: string;
  readonly stageSvg: string;
}

/** SVG twin of the preview: stage, shadow layers and the element. */
export function shadowSvg(o: ShadowSvgOptions): string {
  const { width, height, element: e, radius } = o;
  const filters: string[] = [];
  const filterId = (blur: number): string | null => {
    if (blur <= 0) return null;
    const def = `<filter id="ID" x="0" y="0" width="${f(width)}" height="${f(height)}" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="${f(blur / 2)}"/></filter>`;
    const id = stableId("sh", `${def}`);
    const full = def.replace('id="ID"', `id="${id}"`);
    if (!filters.includes(full)) filters.push(full);
    return id;
  };
  const r = Math.max(0, Math.min(radius, e.width / 2, e.height / 2));
  // CSS paints the first layer on top: draw the list back to front.
  const ordered = [...o.layers].reverse();
  let shadows = "";
  let insetShadows = "";
  for (const l of ordered) {
    const id = filterId(l.blur);
    const filter = id ? ` filter="url(#${id})"` : "";
    const fill = ` fill="${o.color}" fill-opacity="${formatNumber(l.alpha, 3)}"`;
    if (!o.inset) {
      const x = e.x + l.x - l.spread;
      const y = e.y + l.y - l.spread;
      const w = e.width + 2 * l.spread;
      const h = e.height + 2 * l.spread;
      const d = roundedRectPath(x, y, w, h, spreadRadius(r, l.spread));
      if (d) shadows += `<path d="${d}"${fill}${filter}/>`;
    } else {
      // Everything outside the shifted, shrunken hole casts the inner shadow.
      const margin = l.blur + Math.abs(l.spread) + Math.abs(l.x) + Math.abs(l.y) + 1;
      const outer = roundedRectPath(
        e.x - margin,
        e.y - margin,
        e.width + 2 * margin,
        e.height + 2 * margin,
        0,
      );
      const hole = roundedRectPath(
        e.x + l.x + l.spread,
        e.y + l.y + l.spread,
        e.width - 2 * l.spread,
        e.height - 2 * l.spread,
        Math.max(0, r - l.spread),
      );
      insetShadows += `<path d="${outer}${hole}" fill-rule="evenodd"${fill}${filter}/>`;
    }
  }
  const card = roundedRectPath(e.x, e.y, e.width, e.height, r);
  let body = o.stageSvg;
  let defs = filters.join("");
  let inner = "";
  if (o.inset && insetShadows) {
    const clipId = stableId("cl", card);
    defs += `<clipPath id="${clipId}"><path d="${card}"/></clipPath>`;
    inner = `<g clip-path="url(#${clipId})">${insetShadows}</g>`;
  }
  if (defs) body += `<defs>${defs}</defs>`;
  body += shadows;
  body += `<path d="${card}" fill="${o.elementColor}"/>`;
  body += inner;
  return svgDocument(width, height, body);
}
