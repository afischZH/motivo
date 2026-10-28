/**
 * Seeded two-dimensional gradient noise (Perlin's "improved noise" layout in
 * 2D): a shuffled permutation of 256 lattice hashes picks one of eight unit
 * gradients per lattice point, blended with the quintic fade curve. Plus
 * fractal Brownian motion (fBm) on top of it.
 */
import type { Rng } from "./rng";

/** Lattice size of the 2D noise; it repeats every `NOISE2D_PERIOD` units on both axes. */
export const NOISE2D_PERIOD = 256;

/** A smooth noise function of two variables, roughly within [-1, 1]. */
export type Noise2D = (x: number, y: number) => number;

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

const D = Math.SQRT1_2;
/** Eight unit gradients (axes and diagonals), interleaved x, y. */
const GRADIENTS = new Float64Array([1, 0, -1, 0, 0, 1, 0, -1, D, D, -D, D, D, -D, -D, -D]);
/**
 * Unit gradients reach at most sqrt(1/2) in 2D Perlin noise; this scales the
 * output to roughly [-1, 1] (it never exceeds that range).
 */
const AMPLITUDE = Math.SQRT2;

/** Builds a noise function from `NOISE2D_PERIOD - 1` rng draws (a Fisher-Yates shuffle). */
export function createNoise2D(rng: Rng): Noise2D {
  const perm = new Uint8Array(NOISE2D_PERIOD * 2);
  const base = rng.shuffle(Array.from({ length: NOISE2D_PERIOD }, (_, i) => i));
  for (let i = 0; i < NOISE2D_PERIOD * 2; i++) perm[i] = base[i % NOISE2D_PERIOD] ?? 0;

  const grad = (hash: number, x: number, y: number): number => {
    const g = (hash & 7) * 2;
    return (GRADIENTS[g] ?? 0) * x + (GRADIENTS[g + 1] ?? 0) * y;
  };

  return (x: number, y: number): number => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const xi = fx & 255;
    const yi = fy & 255;
    const tx = x - fx;
    const ty = y - fy;
    const p0 = perm[xi] ?? 0;
    const p1 = perm[xi + 1] ?? 0;
    const aa = perm[p0 + yi] ?? 0;
    const ab = perm[p0 + yi + 1] ?? 0;
    const ba = perm[p1 + yi] ?? 0;
    const bb = perm[p1 + yi + 1] ?? 0;
    const u = fade(tx);
    const v = fade(ty);
    // Each corner once (same arithmetic as the textbook form, which evaluates two corners twice).
    const gaa = grad(aa, tx, ty);
    const gab = grad(ab, tx, ty - 1);
    const x1 = gaa + (grad(ba, tx - 1, ty) - gaa) * u;
    const x2 = gab + (grad(bb, tx - 1, ty - 1) - gab) * u;
    return (x1 + (x2 - x1) * v) * AMPLITUDE;
  };
}

export interface FbmOptions {
  /** Number of layers, at least 1. */
  readonly octaves: number;
  /** Amplitude factor per octave (persistence). Default 0.5. */
  readonly gain?: number;
  /** Frequency factor per octave. Default 2. */
  readonly lacunarity?: number;
}

/**
 * Fractal Brownian motion: `octaves` layers of `noise` at rising frequency
 * and falling amplitude, normalised by the amplitude sum so the result stays
 * within [-1, 1]. Every octave is shifted by a fixed offset, so lattice
 * points of different octaves do not line up at the origin.
 */
export function fbm2D(noise: Noise2D, x: number, y: number, options: FbmOptions): number {
  const octaves = Math.max(1, Math.floor(options.octaves));
  const gain = options.gain ?? 0.5;
  const lacunarity = options.lacunarity ?? 2;
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq + i * 17.31, y * freq + i * 9.73);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}
