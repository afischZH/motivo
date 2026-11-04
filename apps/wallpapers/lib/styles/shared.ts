import { mixHex, type Noise2D, oklchToHex, type Rng } from "@musterli/engine";
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

/** Lighter (amount > 0, towards white) or darker (amount < 0, towards black), in OKLab. */
export function shade(hex: string, amount: number): string {
  return amount >= 0
    ? mixHex(hex, "#ffffff", Math.min(1, amount), "oklab")
    : mixHex(hex, "#000000", Math.min(1, -amount), "oklab");
}

/** Smooth path through points (Catmull-Rom as cubic Béziers), open. */
export function smoothPath(points: readonly (readonly [number, number])[]): string {
  const first = points[0];
  if (!first) return "";
  let d = `M${n(first[0])} ${n(first[1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i] ?? first;
    const p1 = points[i] ?? first;
    const p2 = points[i + 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

/** Relative brightness 0..1 of a `#rrggbb` colour (sRGB average, good enough to pick a blend mode). */
export function luminance(hex: string): number {
  const v = Number.parseInt(hex.slice(1, 7), 16);
  if (!Number.isFinite(v)) return 0;
  return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
}

/** Fractal noise: `octaves` layers of 2D noise, each finer and weaker; range about -1..1. */
export function fbm(noise: Noise2D, x: number, y: number, octaves = 4): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise(x * f, y * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return v / norm;
}

/** Hermite step from 0 at `a` to 1 at `b`. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Raster size for a smooth field: longest edge `edge`, same aspect as the canvas. */
export function fieldSize(w: number, h: number, edge: number): { cols: number; rows: number } {
  const scale = edge / Math.max(w, h);
  return {
    cols: Math.max(8, Math.round(w * scale)),
    rows: Math.max(8, Math.round(h * scale)),
  };
}

/** A raster field stretched over the whole canvas, under a solid fallback colour. */
export function fieldSvg(w: number, h: number, fallback: string, href: string): string {
  return (
    `${svgOpen(w, h)}<rect width="${w}" height="${h}" fill="${fallback}"/>` +
    `<image width="${n(w)}" height="${n(h)}" preserveAspectRatio="none" href="${href}"/></svg>`
  );
}
