/**
 * Pixelate and posterize (docs/TOOLS.md E7). Pixelating is a block mean:
 * the caller draws the picture at the block grid (one pixel per block, box
 * filtered) and enlarges the result with nearest neighbour, exactly like
 * the dither grid. Posterizing quantizes each block: evenly spaced levels
 * per channel, or the nearest colour of a palette. Pure and deterministic.
 */
import { hexToRgb255 } from "@musterli/engine";
import { createPixelBuffer, type PixelBuffer } from "./buffer";
import { DITHER_DISTANCE_WEIGHTS } from "./dither";
import { toneCurve, type ToneOptions } from "./tone";

/** Colours of the blocks: the picture's own, levels per channel, or a palette. */
export const POSTERIZE_MODES = ["original", "levels", "palette"] as const;
export type PosterizeMode = (typeof POSTERIZE_MODES)[number];

export const POSTERIZE_LEVELS_MIN = 2;
export const POSTERIZE_LEVELS_MAX = 16;

export interface PosterizeOptions extends ToneOptions {
  readonly mode: PosterizeMode;
  /** Levels per channel for `levels` (2 to 16). */
  readonly levels: number;
  /** Colours for `palette` (hex, at least one). */
  readonly palette: readonly string[];
}

/**
 * Quantized value table per byte for `levels` steps: `round(v · (n − 1)) / (n − 1)`.
 * Exposed for tests.
 */
export function posterizeLut(levels: number): Uint8Array {
  const n = Math.max(POSTERIZE_LEVELS_MIN, Math.min(255, Math.round(levels)));
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++)
    lut[i] = Math.round((Math.round((i / 255) * (n - 1)) / (n - 1)) * 255);
  return lut;
}

/** Index of the palette colour nearest to (r, g, b), weighted RGB distance (2, 4, 3). */
export function nearestColor(
  colors: readonly (readonly [number, number, number])[],
  r: number,
  g: number,
  b: number,
): number {
  const [wr, wg, wb] = DITHER_DISTANCE_WEIGHTS;
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < colors.length; k++) {
    const c = colors[k];
    if (!c) continue;
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    const dist = wr * dr * dr + wg * dg * dg + wb * db * db;
    if (dist < bestD) {
      bestD = dist;
      best = k;
    }
  }
  return best;
}

/**
 * Tone curve per channel, then quantization, pixel by pixel (the caller
 * chooses the grid: one input pixel per block). Alpha is kept.
 */
export function applyPosterize(input: PixelBuffer, o: PosterizeOptions): PixelBuffer {
  const { width, height, data } = input;
  const out = createPixelBuffer(width, height);
  const d = out.data;
  const curve = toneCurve(o);
  const tone = new Uint8Array(256);
  for (let i = 0; i < 256; i++) tone[i] = Math.round((curve[i] ?? 0) * 255);
  if (o.mode === "palette") {
    const colors = o.palette.map((hex) => hexToRgb255(hex));
    if (colors.length === 0) throw new RangeError("applyPosterize: the palette is empty");
    for (let i = 0; i < data.length; i += 4) {
      const k = nearestColor(
        colors,
        tone[data[i] ?? 0] ?? 0,
        tone[data[i + 1] ?? 0] ?? 0,
        tone[data[i + 2] ?? 0] ?? 0,
      );
      const c = colors[k] ?? [0, 0, 0];
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = data[i + 3] ?? 255;
    }
    return out;
  }
  const q = o.mode === "levels" ? posterizeLut(o.levels) : null;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = tone[data[i + c] ?? 0] ?? 0;
      d[i + c] = q ? (q[v] ?? 0) : v;
    }
    d[i + 3] = data[i + 3] ?? 255;
  }
  return out;
}

/** Number with at most `d` decimals, no trailing zeros. */
function fmt(value: number, d: number): string {
  const f = 10 ** d;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? "0" : String(r);
}

const hex2 = (v: number): string => v.toString(16).padStart(2, "0");

/**
 * The blocks of `grid` (one pixel per block) as SVG of `design` size: one
 * `<path>` per colour, each horizontal run of equal blocks one rectangle,
 * in grid units scaled to the design (`preserveAspectRatio="none"`, so the
 * blocks fill the design exactly). Blocks with alpha below half are left
 * out; the others are drawn opaque.
 */
export function pixelateSvg(grid: PixelBuffer, design: { width: number; height: number }): string {
  const { width: gw, height: gh, data } = grid;
  const runs = new Map<number, string[]>();
  for (let y = 0; y < gh; y++) {
    let x = 0;
    while (x < gw) {
      const i = (y * gw + x) * 4;
      if ((data[i + 3] ?? 0) < 128) {
        x++;
        continue;
      }
      const rgb = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
      const start = x;
      x++;
      while (x < gw) {
        const j = (y * gw + x) * 4;
        const next = ((data[j] ?? 0) << 16) | ((data[j + 1] ?? 0) << 8) | (data[j + 2] ?? 0);
        if ((data[j + 3] ?? 0) < 128 || next !== rgb) break;
        x++;
      }
      let list = runs.get(rgb);
      if (!list) {
        list = [];
        runs.set(rgb, list);
      }
      list.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  }
  const paths = [...runs.entries()]
    .sort((p, q) => p[0] - q[0])
    .map(([rgb, d]) => {
      const fill = `#${hex2((rgb >> 16) & 255)}${hex2((rgb >> 8) & 255)}${hex2(rgb & 255)}`;
      return `<path fill="${fill}" d="${d.join("")}"/>`;
    });
  const { width, height } = design;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width, 2)}" height="${fmt(height, 2)}" viewBox="0 0 ${gw} ${gh}" preserveAspectRatio="none" shape-rendering="crispEdges">` +
    `${paths.join("")}</svg>`
  );
}

/** Rectangles `pixelateSvg` draws at most for a grid: one per block. */
export function pixelateShapeEstimate(grid: { width: number; height: number }): number {
  return grid.width * grid.height;
}
