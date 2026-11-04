import { mixHex, oklchToHex, type Rng } from "@musterli/engine";
import type { Preset } from "@musterli/tool-registry";

/**
 * Helpers for the wallpaper-only styles (docs/WALLPAPERS.md). These styles
 * are ToolDefinitions like Musterli's, registered only in this app's copy of
 * the registry, so share links, randomize and export work the same way.
 */

/** Compact numbers for SVG attributes. */
export const n = (value: number): string => Number(value.toFixed(2)).toString();

/** A colour along a multi-stop gradient, mixed in OKLab (no muddy midpoints). */
export function gradientAt(colors: readonly string[], t: number): string {
  const first = colors[0] ?? "#000000";
  if (colors.length < 2) return first;
  const x = Math.min(1, Math.max(0, t)) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(x));
  return mixHex(colors[i] ?? first, colors[i + 1] ?? first, x - i, "oklab");
}

/**
 * `gradientAt` sampled once into 256 steps: for styles that colour
 * thousands of cells, where mixing in OKLab per cell would be slow.
 */
export function gradientLookup(colors: readonly string[]): (t: number) => string {
  const table = Array.from({ length: 256 }, (_, i) => gradientAt(colors, i / 255));
  return (t) => table[Math.round(Math.min(1, Math.max(0, t)) * 255)] ?? table[0] ?? "#000000";
}

/** Gradient stops for an SVG `<linearGradient>`/`<radialGradient>`. */
export function stops(colors: readonly string[]): string {
  const last = Math.max(1, colors.length - 1);
  return colors.map((c, i) => `<stop offset="${n(i / last)}" stop-color="${c}"/>`).join("");
}

interface Range {
  readonly l: readonly [number, number];
  readonly c: readonly [number, number];
}

/** Colours around a random hue, lightness running from `l[0]` to `l[1]`. */
export function huePalette(rng: Rng, count: number, range: Range, spread = 70): string[] {
  const hue = rng.float(0, 360);
  const step = rng.float(spread * 0.4, spread);
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1);
    return oklchToHex({
      l: range.l[0] + (range.l[1] - range.l[0]) * t,
      c: rng.float(range.c[0], range.c[1]),
      h: (hue + i * step + 360) % 360,
    });
  });
}

/** Presets with complete params; names come from `messages/*.json` `Tools.<id>.presets`. */
export function presetsFor<P>(
  id: string,
  defaults: P,
  list: readonly (readonly [string, Partial<P>, number?])[],
): Preset<P>[] {
  return list.map(([presetId, params, seed]) => ({
    id: presetId,
    nameKey: `Tools.${id}.presets.${presetId}`,
    params: { ...defaults, ...params },
    ...(seed === undefined ? {} : { seed }),
  }));
}

export const svgOpen = (w: number, h: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
