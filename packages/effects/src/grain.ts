/**
 * Deterministic film grain without an rng stream: a value per lattice cell
 * from an integer hash of (cell, seed), smoothly interpolated, so any pixel
 * can be evaluated on its own (strips, workers, any resolution).
 */

/** 32-bit integer hash of a lattice point and a seed (murmur-style avalanche). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca77);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae3d);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Hash mapped to [-1, 1). */
export function hashSigned(x: number, y: number, seed: number): number {
  return hash2(x, y, seed) / 2147483648 - 1;
}

/**
 * Grain value in [-1, 1] at a point given in lattice units (one unit per
 * grain cell): value noise with smoothstep interpolation between hashed
 * lattice values.
 */
export function grainAt(x: number, y: number, seed: number): number {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  let tx = x - fx;
  let ty = y - fy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = hashSigned(fx, fy, seed);
  const b = hashSigned(fx + 1, fy, seed);
  const c = hashSigned(fx, fy + 1, seed);
  const d = hashSigned(fx + 1, fy + 1, seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}
