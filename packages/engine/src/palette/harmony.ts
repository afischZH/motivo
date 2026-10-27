/**
 * Colour harmonies in OKLCH: hue relations on the OKLCH hue circle, applied
 * to a lightness ramp so every palette mixes light and dark tones.
 */
import { hexToOklch, oklchToHex } from "../color";
import type { Rng } from "../rng";

export const HARMONIES = ["analogous", "complementary", "triadic", "split", "tetradic"] as const;
export type Harmony = (typeof HARMONIES)[number];

/** Harmony choice of a tool: a fixed harmony, or `auto` for a random one per palette. */
export const HARMONY_MODES = ["auto", ...HARMONIES] as const;
export type HarmonyMode = (typeof HARMONY_MODES)[number];

const wrapHue = (h: number): number => ((h % 360) + 360) % 360;

/**
 * Hue offsets in degrees for `count` colours. Fixed harmonies cycle their
 * hue set (complementary: 0, 180, 0, ...); analogous steps by `spread`
 * degrees per colour around the base hue.
 */
export function harmonyOffsets(harmony: Harmony, count: number, spread = 25): number[] {
  if (harmony === "analogous") {
    const mid = (count - 1) / 2;
    return Array.from({ length: count }, (_, i) => (i - mid) * spread);
  }
  const set =
    harmony === "complementary"
      ? [0, 180]
      : harmony === "triadic"
        ? [0, 120, 240]
        : harmony === "split"
          ? [0, 150, 210]
          : [0, 90, 180, 270];
  return Array.from({ length: count }, (_, i) => set[i % set.length] as number);
}

export interface HarmonyPaletteOptions {
  harmony: Harmony;
  count: number;
  rng: Rng;
  /**
   * A colour the palette must fit (usually the first locked swatch) and its
   * index: the base hue is chosen so this slot lands on the anchor's hue.
   */
  anchor?: { index: number; color: string };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Generates `count` hex colours in the given harmony. Lightness runs from
 * light to dark (or the reverse) with a little jitter, chroma varies per
 * colour; out-of-gamut colours are mapped into sRGB at constant hue.
 * Deterministic for a given rng state.
 */
export function harmonyPalette({ harmony, count, rng, anchor }: HarmonyPaletteOptions): string[] {
  const spread = rng.float(18, 34);
  const offsets = harmonyOffsets(harmony, count, spread);
  let baseHue = rng.float(0, 360);
  const anchorLch = anchor ? hexToOklch(anchor.color) : undefined;
  if (anchor && anchorLch && !Number.isNaN(anchorLch.h)) {
    baseHue = wrapHue(anchorLch.h - (offsets[anchor.index] ?? 0));
  }
  const lLight = rng.float(0.86, 0.96);
  const lDark = rng.float(0.24, 0.42);
  const reverse = rng.bool();
  const chroma = rng.float(0.07, 0.17);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;
    const l = lerp(lLight, lDark, reverse ? 1 - t : t) + rng.float(-0.03, 0.03);
    const c = chroma * rng.float(0.7, 1.3);
    const h = wrapHue(baseHue + (offsets[i] ?? 0) + rng.float(-6, 6));
    out.push(oklchToHex({ l, c, h }));
  }
  return out;
}
