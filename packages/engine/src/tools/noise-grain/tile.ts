/**
 * Seamless Gaussian grain tile (docs/TOOLS.md E1).
 *
 * Every pixel gets a normally distributed value per channel (one channel for
 * mono grain, three independent ones for colour grain). Grain coarser than
 * one pixel is a periodic lattice of Gaussian values, bilinearly
 * interpolated and renormalised per pixel, so every pixel keeps unit
 * variance (no visible lattice) and the tile still wraps seamlessly.
 *
 * Cost is fixed by `GRAIN_TILE_EDGE`, independent of canvas size and params.
 */
import type { RgbaBuffer } from "../../png";
import type { Rng } from "../../rng";
import type { GrainBlend } from "./index";

/** Edge of the square grain tile in px. 256 hides the repeat at grain scale. */
export const GRAIN_TILE_EDGE = 256;
export const GRAIN_SIZE_MIN = 1;
export const GRAIN_SIZE_MAX = 8;
/** Standard deviation of the grain in 8-bit units (before layer opacity). */
export const GRAIN_SIGMA = 56;

export interface GrainTileOptions {
  /** Grain size in px (lattice spacing); clamped to [GRAIN_SIZE_MIN, GRAIN_SIZE_MAX]. */
  readonly size: number;
  /** One shared value for R, G and B (grey grain) instead of three. */
  readonly mono: boolean;
  /** Sets the neutral value: mid-grey for overlay/soft-light, white for multiply. */
  readonly blend: GrainBlend;
  /** Tile edge in px. Default `GRAIN_TILE_EDGE`; clamped to [8, GRAIN_TILE_EDGE]. */
  readonly edge?: number;
}

/**
 * Maps a unit-variance sample to an 8-bit value whose neutral point fits the
 * blend mode: overlay and soft-light leave 128 unchanged, multiply leaves 255
 * unchanged and only darkens.
 */
export function grainTone(z: number, blend: GrainBlend): number {
  const v = blend === "multiply" ? 255 - Math.abs(z) * GRAIN_SIGMA : 128 + z * GRAIN_SIGMA;
  return Math.min(255, Math.max(0, Math.round(v)));
}

/** Per-axis interpolation table: lattice indices, weights and squared-weight sum. */
interface Axis {
  i0: Int32Array;
  i1: Int32Array;
  w0: Float64Array;
  w1: Float64Array;
  sq: Float64Array;
}

function axis(edge: number, lattice: number): Axis {
  const a: Axis = {
    i0: new Int32Array(edge),
    i1: new Int32Array(edge),
    w0: new Float64Array(edge),
    w1: new Float64Array(edge),
    sq: new Float64Array(edge),
  };
  for (let p = 0; p < edge; p++) {
    const u = ((p + 0.5) * lattice) / edge - 0.5;
    const f = Math.floor(u);
    const t = u - f;
    a.i0[p] = (f + lattice) % lattice;
    a.i1[p] = (f + 1 + lattice) % lattice;
    a.w0[p] = 1 - t;
    a.w1[p] = t;
    a.sq[p] = (1 - t) * (1 - t) + t * t;
  }
  return a;
}

/** Builds the RGBA grain tile (alpha 255). Deterministic for a given rng state. */
export function grainTile(rng: Rng, options: GrainTileOptions): RgbaBuffer {
  const edge = Math.round(Math.min(GRAIN_TILE_EDGE, Math.max(8, options.edge ?? GRAIN_TILE_EDGE)));
  const size = Math.min(GRAIN_SIZE_MAX, Math.max(GRAIN_SIZE_MIN, options.size));
  const channels = options.mono ? 1 : 3;
  // Lattice points per edge; a whole number so the tile wraps without seams.
  const lattice = Math.max(1, Math.min(edge, Math.round(edge / size)));

  const values = new Float64Array(lattice * lattice * channels);
  for (let i = 0; i < values.length; i++) values[i] = rng.gaussian();

  const data = new Uint8ClampedArray(edge * edge * 4);
  const direct = lattice === edge;
  const ax = direct ? null : axis(edge, lattice);
  const z = new Float64Array(channels);

  for (let y = 0; y < edge; y++) {
    for (let x = 0; x < edge; x++) {
      if (ax === null) {
        const base = (y * lattice + x) * channels;
        for (let c = 0; c < channels; c++) z[c] = values[base + c] as number;
      } else {
        const r0 = (ax.i0[y] as number) * lattice;
        const r1 = (ax.i1[y] as number) * lattice;
        const c0 = ax.i0[x] as number;
        const c1 = ax.i1[x] as number;
        const wy0 = ax.w0[y] as number;
        const wy1 = ax.w1[y] as number;
        const wx0 = ax.w0[x] as number;
        const wx1 = ax.w1[x] as number;
        // Sum of iid N(0,1) weighted by w has variance sum(w^2): divide it out.
        const norm = 1 / Math.sqrt((ax.sq[x] as number) * (ax.sq[y] as number));
        for (let c = 0; c < channels; c++) {
          const v =
            wy0 *
              (wx0 * (values[(r0 + c0) * channels + c] as number) +
                wx1 * (values[(r0 + c1) * channels + c] as number)) +
            wy1 *
              (wx0 * (values[(r1 + c0) * channels + c] as number) +
                wx1 * (values[(r1 + c1) * channels + c] as number));
          z[c] = v * norm;
        }
      }
      const o = (y * edge + x) * 4;
      if (channels === 1) {
        const v = grainTone(z[0] as number, options.blend);
        data[o] = v;
        data[o + 1] = v;
        data[o + 2] = v;
      } else {
        data[o] = grainTone(z[0] as number, options.blend);
        data[o + 1] = grainTone(z[1] as number, options.blend);
        data[o + 2] = grainTone(z[2] as number, options.blend);
      }
      data[o + 3] = 255;
    }
  }
  return { width: edge, height: edge, data };
}
