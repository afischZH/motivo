/**
 * CPU twins of the GLSL noise in `glsl/common.ts`: the same integer hash
 * (exact, via `Math.imul`), simplex lattice and fbm, in float64. Used by
 * the CPU references of shaders (static motifs, unit tests).
 */

/** lowbias32 integer hash, uint32 in and out (GLSL `musterliHash`). */
export function hash32(x: number): number {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** GLSL `musterliHash3`. */
export function hash3(a: number, b: number, c: number): number {
  return hash32((a ^ hash32((b ^ hash32(c >>> 0)) >>> 0)) >>> 0);
}

/** A uint32 seed salted with a small constant (one noise stream per use). */
export function saltSeed(seed: number, salt: number): number {
  return hash32((seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0);
}

const S = 0.70710678;
/** GLSL `MUSTERLI_GRAD` as float32 values, like the GPU stores them. */
const GRAD_X = Float64Array.from([1, S, 0, -S, -1, -S, 0, S], Math.fround);
const GRAD_Y = Float64Array.from([0, S, 1, S, 0, -S, -1, -S], Math.fround);

const F2 = 0.36602540378443865;
const G2 = 0.21132486540518713;
const LATTICE_OFFSET = 32768;

function corner(x: number, y: number, cx: number, cy: number, seed: number): number {
  let t = 0.5 - (x * x + y * y);
  if (t <= 0) return 0;
  const h = hash3(cx, cy, seed) & 7;
  t *= t;
  return t * t * ((GRAD_X[h] ?? 0) * x + (GRAD_Y[h] ?? 0) * y);
}

/** Seeded 2D simplex noise in about [-1, 1] (GLSL `musterliSimplex`). */
export function simplex2(px: number, py: number, seed: number): number {
  const s = (px + py) * F2;
  const ix = Math.floor(px + s);
  const iy = Math.floor(py + s);
  const t = (ix + iy) * G2;
  const x0 = px - (ix - t);
  const y0 = py - (iy - t);
  const ox = x0 > y0 ? 1 : 0;
  const oy = 1 - ox;
  const x1 = x0 - ox + G2;
  const y1 = y0 - oy + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const cx = ix + LATTICE_OFFSET;
  const cy = iy + LATTICE_OFFSET;
  return (
    99 *
    (corner(x0, y0, cx, cy, seed) +
      corner(x1, y1, cx + ox, cy + oy, seed) +
      corner(x2, y2, cx + 1, cy + 1, seed))
  );
}

/** Octave seed step (GLSL `0x9e3779b9u`). */
const OCTAVE_STEP = 0x9e3779b9;

/** Fractal sum of 1 to 6 octaves, normalised (GLSL `musterliFbm`). */
export function fbm2(px: number, py: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let x = px;
  let y = py;
  const n = Math.min(6, octaves);
  for (let i = 0; i < n; i++) {
    sum += amp * simplex2(x, y, (seed + Math.imul(i, OCTAVE_STEP)) >>> 0);
    norm += amp;
    const nx = 1.6 * x - 1.2 * y;
    y = 1.2 * x + 1.6 * y;
    x = nx;
    amp *= 0.5;
  }
  return norm > 0 ? sum / norm : 0;
}
