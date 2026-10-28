/**
 * CSS gradient generator (linear, radial, conic) with eased colour stops.
 *
 * Easing: between two palette colours, `steps` intermediate stops are placed
 * at even positions with colours mixed at `ease(t)`. This avoids the linear
 * banding look and gives browsers without `in oklch` support a close
 * approximation of the perceptual interpolation (first declaration is the
 * fallback, the second uses the native colour interpolation method).
 *
 * The SVG preview reproduces the CSS geometry exactly for linear and radial
 * gradients (gradient line length and farthest-corner sizing per CSS Images 3)
 * and approximates conic gradients with thin wedges, as SVG has no conic paint.
 */
import { type ColorSpace, type HueInterpolation, mixHex } from "../../color";
import { formatNumber } from "../../curves";
import { type Easing, ease } from "../../easing";
import { stableId, svgDocument } from "../../svg";

export const GRADIENT_TYPES = ["linear", "radial", "conic"] as const;
export type GradientType = (typeof GRADIENT_TYPES)[number];

export const RADIAL_SHAPES = ["circle", "ellipse"] as const;
export type RadialShape = (typeof RADIAL_SHAPES)[number];

export interface CssGradientOptions {
  readonly type: GradientType;
  /** Two or more hex colours, spread evenly from 0 % to 100 %. */
  readonly colors: readonly string[];
  /** Direction for linear (0 = to top, clockwise) and start angle for conic, in degrees. */
  readonly angle: number;
  /** Centre for radial and conic, in percent of width/height. */
  readonly centerX: number;
  readonly centerY: number;
  readonly shape: RadialShape;
  readonly interpolation: ColorSpace;
  readonly hue: HueInterpolation;
  readonly easing: Easing;
  /** Intermediate stops per colour pair (0 disables easing stops). */
  readonly steps: number;
  /** Repeat the first colour at the end (seamless conic, mirrored linear). */
  readonly loop: boolean;
  readonly width: number;
  readonly height: number;
}

export interface GradientStop {
  readonly color: string;
  /** Position in [0, 1]. */
  readonly offset: number;
}

export interface CssGradientResult {
  readonly css: string;
  readonly previewSvg: string;
}

/** Fewest intermediate stops per pair used for the SVG preview of non-sRGB/eased gradients. */
export const PREVIEW_MIN_STEPS = 16;
/** Wedges used to approximate a conic gradient in SVG (2 degrees each). */
export const CONIC_WEDGES = 180;

function stopColors(o: Pick<CssGradientOptions, "colors" | "loop">): readonly string[] {
  const first = o.colors[0];
  if (first === undefined || o.colors.length < 2) {
    throw new RangeError("cssGradient: at least two colours are required");
  }
  return o.loop ? [...o.colors, first] : o.colors;
}

/** Colour of the gradient at `f` in [0, 1], honouring easing, space and hue method. */
export function gradientColorAt(
  o: Pick<CssGradientOptions, "colors" | "loop" | "easing" | "interpolation" | "hue">,
  f: number,
): string {
  const colors = stopColors(o);
  const segments = colors.length - 1;
  const x = Math.min(Math.max(f, 0), 1) * segments;
  const i = Math.min(Math.floor(x), segments - 1);
  const t = ease(o.easing, x - i);
  return mixHex(colors[i] as string, colors[i + 1] as string, t, o.interpolation, o.hue);
}

/**
 * Builds the stop list: every palette colour at an even position plus
 * `steps` mixed stops per pair. With linear easing in sRGB the extra stops
 * would be redundant and are skipped.
 */
export function gradientStops(
  o: Pick<CssGradientOptions, "colors" | "loop" | "easing" | "interpolation" | "hue" | "steps">,
): GradientStop[] {
  const colors = stopColors(o);
  const segments = colors.length - 1;
  const steps =
    o.easing === "linear" && o.interpolation === "srgb" ? 0 : Math.max(0, Math.floor(o.steps));
  const stops: GradientStop[] = [];
  for (let s = 0; s < segments; s++) {
    const a = colors[s] as string;
    const b = colors[s + 1] as string;
    stops.push({ color: a.toLowerCase(), offset: s / segments });
    for (let k = 1; k <= steps; k++) {
      const t = k / (steps + 1);
      stops.push({
        color: mixHex(a, b, ease(o.easing, t), o.interpolation, o.hue),
        offset: (s + t) / segments,
      });
    }
  }
  stops.push({ color: (colors[segments] as string).toLowerCase(), offset: 1 });
  return stops;
}

const pct = (v: number): string => `${formatNumber(v * 100)}%`;
const deg = (v: number): string => `${formatNumber(v)}deg`;

function cssStopList(stops: readonly GradientStop[]): string {
  return stops.map((s) => `${s.color} ${pct(s.offset)}`).join(", ");
}

/** The prelude before the stops, e.g. `135deg` or `circle at 50% 50%`. */
function cssPrelude(o: CssGradientOptions): string {
  const at = `at ${formatNumber(o.centerX)}% ${formatNumber(o.centerY)}%`;
  switch (o.type) {
    case "linear":
      return deg(o.angle);
    case "radial":
      return `${o.shape} ${at}`;
    case "conic":
      return `from ${deg(o.angle)} ${at}`;
  }
}

function interpolationMethod(o: CssGradientOptions): string {
  if (o.interpolation === "srgb") return "";
  if (o.interpolation === "oklch" && o.hue === "longer") return " in oklch longer hue";
  return ` in ${o.interpolation}`;
}

/** The values behind `cssGradientCss`, for other code outputs (Tailwind, ...). */
export interface CssGradientLayers {
  /** First stop colour, used as `background-color`. */
  readonly color: string;
  /** Gradient with precomputed (eased, perceptually mixed) sRGB stops; works everywhere. */
  readonly fallback: string;
  /** Same gradient using the native interpolation method; absent for sRGB. */
  readonly native?: string;
}

export function cssGradientLayers(o: CssGradientOptions): CssGradientLayers {
  const fn = `${o.type}-gradient`;
  const prelude = cssPrelude(o);
  const eased = gradientStops(o);
  const color = eased[0]?.color ?? "#000000";
  const fallback = `${fn}(${prelude}, ${cssStopList(eased)})`;
  const method = interpolationMethod(o);
  if (method === "") return { color, fallback };
  // Native interpolation handles linear easing itself; keep only the palette stops then.
  const native = o.easing === "linear" ? gradientStops({ ...o, steps: 0 }) : eased;
  return { color, fallback, native: `${fn}(${prelude}${method}, ${cssStopList(native)})` };
}

/** CSS declarations with an sRGB fallback followed by the native interpolation method. */
export function cssGradientCss(o: CssGradientOptions): string {
  const layers = cssGradientLayers(o);
  const lines = [`background-color: ${layers.color};`, `background-image: ${layers.fallback};`];
  if (layers.native !== undefined) lines.push(`background-image: ${layers.native};`);
  return lines.join("\n");
}

/**
 * Turns a CSS value into a Tailwind arbitrary value body: spaces become
 * underscores (Tailwind turns them back), existing underscores are escaped.
 */
export function tailwindArbitrary(value: string): string {
  return value.trim().replace(/_/g, "\\_").replace(/\s+/g, "_");
}

/**
 * Tailwind utility classes for the gradient (arbitrary values, v3 and v4).
 * Uses the fallback stops: they are precomputed in the chosen colour space,
 * so the result matches the native version closely without needing
 * `in oklch` support.
 */
export function cssGradientTailwind(o: CssGradientOptions): string {
  const layers = cssGradientLayers(o);
  return `bg-[${layers.color}] bg-[${tailwindArbitrary(layers.fallback)}]`;
}

function svgStops(stops: readonly GradientStop[]): string {
  return stops
    .map((s) => `<stop offset="${formatNumber(s.offset, 4)}" stop-color="${s.color}"/>`)
    .join("");
}

function previewStops(o: CssGradientOptions): GradientStop[] {
  const needsDense = o.easing !== "linear" || o.interpolation !== "srgb";
  return gradientStops({ ...o, steps: needsDense ? Math.max(o.steps, PREVIEW_MIN_STEPS) : 0 });
}

function linearSvg(o: CssGradientOptions): string {
  const { width: w, height: h } = o;
  const a = (o.angle * Math.PI) / 180;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  // CSS gradient line: through the centre, long enough that the corners hit 0 % and 100 %.
  const half = (Math.abs(w * sin) + Math.abs(h * cos)) / 2;
  const f = (v: number): string => formatNumber(v);
  const vector = `x1="${f(w / 2 - sin * half)}" y1="${f(h / 2 + cos * half)}" x2="${f(w / 2 + sin * half)}" y2="${f(h / 2 - cos * half)}"`;
  const inner = `gradientUnits="userSpaceOnUse" ${vector}>${svgStops(previewStops(o))}`;
  const id = stableId("lg", inner);
  return `<defs><linearGradient id="${id}" ${inner}</linearGradient></defs><rect width="${f(w)}" height="${f(h)}" fill="url(#${id})"/>`;
}

function radialSvg(o: CssGradientOptions): string {
  const { width: w, height: h } = o;
  const cx = (o.centerX / 100) * w;
  const cy = (o.centerY / 100) * h;
  const dx = Math.max(cx, w - cx);
  const dy = Math.max(cy, h - cy);
  // farthest-corner sizing (the CSS default).
  let rx: number;
  let ry: number;
  if (o.shape === "circle") {
    rx = ry = Math.hypot(dx, dy);
  } else {
    rx = dx * Math.SQRT2;
    ry = dy * Math.SQRT2;
  }
  const f = (v: number): string => formatNumber(v);
  // Degenerate radius (centre on a corner of a zero-size side) still needs a valid matrix.
  const sx = Math.max(rx, 0.01);
  const sy = Math.max(ry, 0.01);
  const inner = `gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="matrix(${f(sx)} 0 0 ${f(sy)} ${f(cx)} ${f(cy)})">${svgStops(previewStops(o))}`;
  const id = stableId("rg", inner);
  return `<defs><radialGradient id="${id}" ${inner}</radialGradient></defs><rect width="${f(w)}" height="${f(h)}" fill="url(#${id})"/>`;
}

function conicSvg(o: CssGradientOptions): string {
  const { width: w, height: h } = o;
  const cx = (o.centerX / 100) * w;
  const cy = (o.centerY / 100) * h;
  const r = Math.hypot(w, h);
  const f = (v: number): string => formatNumber(v);
  const point = (turn: number): string => {
    const a = ((o.angle + turn * 360) * Math.PI) / 180;
    return `${f(cx + r * Math.sin(a))} ${f(cy - r * Math.cos(a))}`;
  };
  // Merge neighbouring wedges of the same colour; overlap each wedge slightly
  // into the next one to hide anti-aliasing seams.
  const overlap = 0.6 / 360;
  const paths: string[] = [];
  let start = 0;
  let color = gradientColorAt(o, 0.5 / CONIC_WEDGES);
  for (let i = 1; i <= CONIC_WEDGES; i++) {
    const next = i < CONIC_WEDGES ? gradientColorAt(o, (i + 0.5) / CONIC_WEDGES) : "";
    if (next === color) continue;
    const from = start / CONIC_WEDGES;
    const to = Math.min(i / CONIC_WEDGES + overlap, 1);
    // Wide wedges (flat colour areas) need corner points at least every quarter turn.
    const pieces = Math.ceil((to - from) / 0.25);
    let d = `M${f(cx)} ${f(cy)} L${point(from)}`;
    for (let k = 1; k <= pieces; k++) d += ` L${point(from + ((to - from) * k) / pieces)}`;
    paths.push(`<path d="${d}Z" fill="${color}"/>`);
    start = i;
    color = next;
  }
  // The underlay hides anti-aliasing gaps where wedges meet (centre, start seam);
  // crisp edges avoid conflation lines between neighbouring wedges of near-equal colour.
  const underlay = `<rect width="${f(w)}" height="${f(h)}" fill="${gradientColorAt(o, 0)}"/>`;
  return `${underlay}<g shape-rendering="crispEdges">${paths.join("")}</g>`;
}

/**
 * The SVG elements of the gradient on a `width` × `height` box at the origin
 * (without the root `<svg>`), for tools that place or animate it.
 */
export function cssGradientSvgBody(o: CssGradientOptions): string {
  return o.type === "linear" ? linearSvg(o) : o.type === "radial" ? radialSvg(o) : conicSvg(o);
}

/** Renders CSS declarations and an equivalent SVG preview. Pure and deterministic. */
export function cssGradient(o: CssGradientOptions): CssGradientResult {
  return {
    css: cssGradientCss(o),
    previewSvg: svgDocument(o.width, o.height, cssGradientSvgBody(o)),
  };
}
