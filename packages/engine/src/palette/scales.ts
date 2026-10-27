/**
 * Colour scales from a base colour: tints and shades (F2) and an 11-step
 * Tailwind-style scale anchored at 500 (F3). All lightness work happens in
 * OKLCH; results are gamut-mapped to sRGB hex.
 */
import { hexToOklch, mixHex, oklchToHex } from "../color";
import { normalizeHex } from "./format";

/**
 * `oklch`: lightness ramp at constant chroma and hue (gamut mapping trims
 * chroma near white and black). `oklab`: perceptual mix with white/black.
 * `srgb`: classic channel mix with white/black (like Sass `tint`/`shade`).
 */
export const SCALE_METHODS = ["oklch", "oklab", "srgb"] as const;
export type ScaleMethod = (typeof SCALE_METHODS)[number];

export type ScaleRole = "tint" | "base" | "shade";

export interface ScaleColor {
  color: string;
  role: ScaleRole;
  /** 1-based distance from the base (tint 1 is the one next to the base); 0 for the base. */
  index: number;
}

export interface TintsAndShadesOptions {
  base: string;
  tints: number;
  shades: number;
  /** How far the outermost steps go towards white/black, in (0, 1]. */
  range: number;
  method: ScaleMethod;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Tints (lightest first), the base, then shades (darkest last). Step `i` of
 * `n` sits at `range * i / (n + 1)` of the way to white or black, so even
 * `range = 1` never repeats pure white or black.
 */
export function tintsAndShades(o: TintsAndShadesOptions): ScaleColor[] {
  const base = normalizeHex(o.base);
  const range = clamp(o.range, 0, 1);
  const lch = hexToOklch(base);
  const step = (target: "white" | "black", t: number): string => {
    if (o.method === "oklch") {
      const l = target === "white" ? lch.l + (1 - lch.l) * t : lch.l * (1 - t);
      return oklchToHex({ l, c: lch.c, h: lch.h });
    }
    return mixHex(base, target === "white" ? "#ffffff" : "#000000", t, o.method);
  };
  const tints: ScaleColor[] = [];
  for (let i = o.tints; i >= 1; i--) {
    tints.push({ color: step("white", (range * i) / (o.tints + 1)), role: "tint", index: i });
  }
  const shades: ScaleColor[] = [];
  for (let i = 1; i <= o.shades; i++) {
    shades.push({ color: step("black", (range * i) / (o.shades + 1)), role: "shade", index: i });
  }
  return [...tints, { color: base, role: "base", index: 0 }, ...shades];
}

/** Tailwind's colour steps. */
export const TAILWIND_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type TailwindStep = (typeof TAILWIND_STEPS)[number];

/**
 * Typical OKLCH lightness per step, averaged over well-known UI palettes
 * (rounded). Only the shape of this curve is used: it is stretched so that
 * 50 hits `lightest`, 500 hits the base and 950 hits `darkest`.
 */
export const TAILWIND_REFERENCE_LIGHTNESS: Readonly<Record<TailwindStep, number>> = {
  50: 0.975,
  100: 0.945,
  200: 0.9,
  300: 0.83,
  400: 0.72,
  500: 0.64,
  600: 0.56,
  700: 0.49,
  800: 0.43,
  900: 0.38,
  950: 0.27,
};

export interface TailwindScaleOptions {
  base: string;
  /** OKLCH lightness of step 50. */
  lightest: number;
  /** OKLCH lightness of step 950. */
  darkest: number;
  /** Chroma reduction at 50 and 950, 0 (none) to 1 (grey ends). */
  chromaFalloff: number;
  /** Hue rotation in degrees at 50 (950 rotates the opposite way). */
  hueShift: number;
}

export interface TailwindColor {
  step: TailwindStep;
  color: string;
}

/** Smallest lightness gap kept between the base and the ends. */
const MIN_END_GAP = 0.02;

/**
 * An 11-step scale with the base colour exactly at 500. Lighter steps follow
 * the reference curve between the base and `lightest`, darker ones between
 * the base and `darkest`. Chroma shrinks towards both ends by
 * `chromaFalloff * t^1.5` (t = 0 at 500, 1 at 50/950).
 */
export function tailwindScale(o: TailwindScaleOptions): TailwindColor[] {
  const base = normalizeHex(o.base);
  const lch = hexToOklch(base);
  const lightest = clamp(Math.max(o.lightest, lch.l + MIN_END_GAP), 0, 1);
  const darkest = clamp(Math.min(o.darkest, lch.l - MIN_END_GAP), 0, 1);
  const ref = TAILWIND_REFERENCE_LIGHTNESS;
  const falloff = clamp(o.chromaFalloff, 0, 1);
  return TAILWIND_STEPS.map((step) => {
    if (step === 500) return { step, color: base };
    const lighter = step < 500;
    const t = lighter
      ? (ref[step] - ref[500]) / (ref[50] - ref[500])
      : (ref[500] - ref[step]) / (ref[500] - ref[950]);
    const l = lighter ? lch.l + (lightest - lch.l) * t : lch.l - (lch.l - darkest) * t;
    const c = lch.c * (1 - falloff * t ** 1.5);
    const h = Number.isNaN(lch.h) ? lch.h : lch.h + (lighter ? 1 : -1) * o.hueShift * t;
    return { step, color: oklchToHex({ l, c, h: Number.isNaN(h) ? h : ((h % 360) + 360) % 360 }) };
  });
}
