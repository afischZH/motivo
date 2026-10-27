/**
 * Colour helpers: hex <-> sRGB <-> OKLab/OKLCH, gamut mapping, mixing in a
 * chosen interpolation space and seeded palette generation.
 *
 * Conversions use the tree-shakable `culori/fn` entry (only the converters
 * below are bundled, no mode registry).
 */
// A reference (not an import) because the file only declares the untyped
// `culori/fn` module and must be visible to every package compiling this source.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./culori-fn.d.ts" />
import {
  convertLabToLch,
  convertLchToLab,
  convertOklabToRgb,
  convertRgbToOklab,
  parseHex,
} from "culori/fn";
import type { Rng } from "./rng";

/** Gamma-encoded sRGB, channels nominally in [0, 1]. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Oklab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** OKLCH with hue in degrees [0, 360). Achromatic colours have `h = NaN`. */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

/** Interpolation spaces supported by CSS gradients and the engine. */
export const COLOR_SPACES = ["oklch", "oklab", "srgb"] as const;
export type ColorSpace = (typeof COLOR_SPACES)[number];

/** CSS `<hue-interpolation-method>` subset. */
export const HUE_INTERPOLATIONS = ["shorter", "longer"] as const;
export type HueInterpolation = (typeof HUE_INTERPOLATIONS)[number];

/** Chroma below this counts as achromatic (hue is "powerless"). */
const ACHROMATIC = 1e-4;
const GAMUT_EPSILON = 1e-5;

/** Parses a `#rgb` or `#rrggbb` colour. Throws on anything else. */
export function hexToRgb(hex: string): Rgb {
  const parsed = /^#(?:[0-9a-f]{3}){1,2}$/i.test(hex) ? parseHex(hex) : undefined;
  if (parsed === undefined) throw new RangeError(`Invalid hex colour "${hex}"`);
  return { r: parsed.r, g: parsed.g, b: parsed.b };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Formats sRGB as lowercase `#rrggbb`, clamping out-of-range channels. */
export function rgbToHex(rgb: Rgb): string {
  const h = (v: number): string =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}

export function rgbToOklab(rgb: Rgb): Oklab {
  const { l, a, b } = convertRgbToOklab(rgb);
  return { l, a, b };
}

export function oklabToRgb(lab: Oklab): Rgb {
  const { r, g, b } = convertOklabToRgb(lab);
  return { r, g, b };
}

export function oklabToOklch(lab: Oklab): Oklch {
  const lch = convertLabToLch(lab, "oklch");
  const h = lch.c < ACHROMATIC || lch.h === undefined ? Number.NaN : lch.h;
  return { l: lch.l, c: lch.c, h };
}

export function oklchToOklab(lch: Oklch): Oklab {
  const h = Number.isNaN(lch.h) ? 0 : lch.h;
  const { l, a, b } = convertLchToLab({ l: lch.l, c: Number.isNaN(lch.h) ? 0 : lch.c, h }, "oklab");
  return { l, a, b };
}

export function hexToOklch(hex: string): Oklch {
  return oklabToOklch(rgbToOklab(hexToRgb(hex)));
}

/** True if every channel lies in [0, 1] (with a tiny tolerance). */
export function isInGamut(rgb: Rgb): boolean {
  const lo = -GAMUT_EPSILON;
  const hi = 1 + GAMUT_EPSILON;
  return rgb.r >= lo && rgb.r <= hi && rgb.g >= lo && rgb.g <= hi && rgb.b >= lo && rgb.b <= hi;
}

/**
 * Converts OKLCH to hex. Out-of-gamut colours are mapped into sRGB by
 * reducing chroma at constant lightness and hue (binary search), which keeps
 * the perceived hue instead of shifting it like plain channel clipping.
 */
export function oklchToHex(lch: Oklch): string {
  const l = clamp01(lch.l);
  const direct = oklabToRgb(oklchToOklab({ l, c: lch.c, h: lch.h }));
  if (isInGamut(direct)) return rgbToHex(direct);
  let lo = 0;
  let hi = lch.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (isInGamut(oklabToRgb(oklchToOklab({ l, c: mid, h: lch.h })))) lo = mid;
    else hi = mid;
  }
  return rgbToHex(oklabToRgb(oklchToOklab({ l, c: lo, h: lch.h })));
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Hue difference b - a adjusted per CSS Color 4 hue interpolation. */
function hueDelta(a: number, b: number, method: HueInterpolation): number {
  let d = b - a;
  if (method === "shorter") {
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
  } else if (d > 0 && d < 180) {
    d -= 360;
  } else if (d > -180 && d <= 0) {
    d += 360;
  }
  return d;
}

function mixOklch(a: Oklch, b: Oklch, t: number, method: HueInterpolation): Oklch {
  // A powerless hue takes the other colour's hue (CSS Color 4, "missing" components).
  const ha = Number.isNaN(a.h) ? b.h : a.h;
  const hb = Number.isNaN(b.h) ? a.h : b.h;
  const l = lerp(a.l, b.l, t);
  const c = lerp(Number.isNaN(a.h) ? 0 : a.c, Number.isNaN(b.h) ? 0 : b.c, t);
  if (Number.isNaN(ha) || Number.isNaN(hb)) return { l, c, h: Number.NaN };
  const h = (((ha + hueDelta(ha, hb, method) * t) % 360) + 360) % 360;
  return { l, c, h };
}

/**
 * Mixes two hex colours at `t` in [0, 1] in the given space and returns hex.
 * `srgb` interpolates gamma-encoded channels like legacy CSS gradients.
 */
export function mixHex(
  a: string,
  b: string,
  t: number,
  space: ColorSpace,
  hue: HueInterpolation = "shorter",
): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (space === "srgb") {
    return rgbToHex({ r: lerp(ra.r, rb.r, t), g: lerp(ra.g, rb.g, t), b: lerp(ra.b, rb.b, t) });
  }
  const la = rgbToOklab(ra);
  const lb = rgbToOklab(rb);
  if (space === "oklab") {
    return rgbToHex(
      oklabToRgb({ l: lerp(la.l, lb.l, t), a: lerp(la.a, lb.a, t), b: lerp(la.b, lb.b, t) }),
    );
  }
  return oklchToHex(mixOklch(oklabToOklch(la), oklabToOklch(lb), t, hue));
}

/**
 * Samples evenly spaced colours along a piecewise gradient through `colors`.
 * Returns `count` hex colours; `count = 1` yields the first colour.
 */
export function samplePalette(
  colors: readonly string[],
  count: number,
  space: ColorSpace = "oklch",
  hue: HueInterpolation = "shorter",
): string[] {
  const first = colors[0];
  if (first === undefined) throw new RangeError("samplePalette: at least one colour is required");
  if (count <= 1 || colors.length === 1)
    return Array.from({ length: Math.max(count, 0) }, () => first);
  const out: string[] = [];
  const segments = colors.length - 1;
  for (let i = 0; i < count; i++) {
    const f = (i / (count - 1)) * segments;
    const index = Math.min(Math.floor(f), segments - 1);
    out.push(mixHex(colors[index] as string, colors[index + 1] as string, f - index, space, hue));
  }
  return out;
}

/**
 * Generates a harmonious palette in OKLCH: a lightness ramp with analogous,
 * spread or evenly distributed hues. Deterministic for a given rng state.
 */
export function randomPalette(rng: Rng, count: number): string[] {
  const baseHue = rng.float(0, 360);
  const direction = rng.bool() ? 1 : -1;
  const scheme = rng.int(0, 2);
  const step =
    scheme === 0 ? rng.float(15, 40) : scheme === 1 ? rng.float(50, 110) : 360 / Math.max(count, 1);
  const lStart = rng.float(0.55, 0.93);
  const lEnd = rng.float(0.3, 0.75);
  const chroma = rng.float(0.06, 0.2);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const h = (((baseHue + direction * step * i) % 360) + 360) % 360;
    out.push(oklchToHex({ l: lerp(lStart, lEnd, t), c: chroma, h }));
  }
  return out;
}
