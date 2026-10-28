/**
 * Duotone, tritone and gradient map (docs/TOOLS.md L4): luminance, tone
 * curve, optional grain, then a colour per tone from the gradient, blended
 * with the original. Pure and deterministic; runs per pixel in the worker.
 */
import { createPixelBuffer, type PixelBuffer } from "./buffer";
import { hashSigned } from "./grain";
import { gradientLut } from "./gradient-map";
import { normalizeWeights, type LumaWeights } from "./luminance";
import { toneCurve, type ToneOptions } from "./tone";

export interface GradientMapOptions extends ToneOptions {
  /** Gradient stops, dark end first (2 = duotone, 3 = tritone). */
  readonly stops: readonly string[];
  readonly weights: LumaWeights;
  /** 0 to 1: grain amplitude (up to `GRAIN_AMPLITUDE` of the tone range). */
  readonly grain: number;
  /** Grain cell size in pixels of the input (already scaled to the render size). */
  readonly grainCell: number;
  readonly seed: number;
  /** 0 to 1: share of the mapped colour (1 = full effect). */
  readonly amount: number;
}

/** Largest grain offset in tone units at `grain = 1`. */
export const GRAIN_AMPLITUDE = 0.25;

export function applyGradientMap(input: PixelBuffer, options: GradientMapOptions): PixelBuffer {
  const out = createPixelBuffer(input.width, input.height);
  const src = input.data;
  const dst = out.data;
  const w = normalizeWeights(options.weights);
  const tone = toneCurve(options);
  const lut = gradientLut(options.stops);
  const amount = Math.min(1, Math.max(0, options.amount));
  const keep = 1 - amount;
  const grain = Math.min(1, Math.max(0, options.grain)) * GRAIN_AMPLITUDE;
  // Below a quarter pixel the grain is noise per pixel anyway; bounds the lattice rows.
  const cell = Math.max(0.25, options.grainCell);
  const seed = options.seed | 0;
  const width = input.width;
  // Grain lattice values of the two lattice rows around the current pixel
  // row, hashed once per row instead of four times per pixel (same values
  // as `grainAt`).
  const latticeCols = Math.ceil(width / cell) + 2;
  const rowA = new Float32Array(latticeCols);
  const rowB = new Float32Array(latticeCols);
  let latticeRow = Number.NaN;
  for (let y = 0, i = 0; y < input.height; y++) {
    const gy = (y + 0.5) / cell;
    const fy = Math.floor(gy);
    let ty = gy - fy;
    ty = ty * ty * (3 - 2 * ty);
    if (grain > 0 && fy !== latticeRow) {
      latticeRow = fy;
      for (let j = 0; j < latticeCols; j++) {
        rowA[j] = hashSigned(j, fy, seed);
        rowB[j] = hashSigned(j, fy + 1, seed);
      }
    }
    for (let x = 0; x < width; x++, i += 4) {
      const r = src[i] ?? 0;
      const g = src[i + 1] ?? 0;
      const b = src[i + 2] ?? 0;
      const l = Math.round(r * w.r + g * w.g + b * w.b);
      let v = tone[l > 255 ? 255 : l] ?? 0;
      if (grain > 0) {
        const gx = (x + 0.5) / cell;
        const fx = Math.floor(gx);
        let tx = gx - fx;
        tx = tx * tx * (3 - 2 * tx);
        const a = rowA[fx] ?? 0;
        const c = rowB[fx] ?? 0;
        const top = a + ((rowA[fx + 1] ?? 0) - a) * tx;
        const bottom = c + ((rowB[fx + 1] ?? 0) - c) * tx;
        v += (top + (bottom - top) * ty) * grain;
        v = v < 0 ? 0 : v > 1 ? 1 : v;
      }
      const k = Math.round(v * 255) * 3;
      dst[i] = (lut[k] ?? 0) * amount + r * keep;
      dst[i + 1] = (lut[k + 1] ?? 0) * amount + g * keep;
      dst[i + 2] = (lut[k + 2] ?? 0) * amount + b * keep;
      dst[i + 3] = src[i + 3] ?? 255;
    }
  }
  return out;
}
