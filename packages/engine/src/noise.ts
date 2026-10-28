/**
 * Seeded one-dimensional gradient noise (Perlin's construction in 1D): a
 * random slope at every integer, blended with the quintic fade curve
 * 6t^5 - 15t^4 + 10t^3. Smooth, zero at integers, roughly within [-0.5, 0.5].
 */
import type { Rng } from "./rng";

/** Lattice size; the noise repeats every `NOISE_PERIOD` units. */
export const NOISE_PERIOD = 256;

/** A smooth noise function of one variable. */
export type Noise1D = (x: number) => number;

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Builds a noise function from `NOISE_PERIOD` rng draws. */
export function createNoise1D(rng: Rng): Noise1D {
  const slopes = new Float64Array(NOISE_PERIOD);
  for (let i = 0; i < NOISE_PERIOD; i++) slopes[i] = rng.float(-1, 1);
  const wrap = (i: number): number => ((i % NOISE_PERIOD) + NOISE_PERIOD) % NOISE_PERIOD;
  return (x: number): number => {
    if (!Number.isFinite(x)) return 0;
    const i = Math.floor(x);
    const t = x - i;
    const a = (slopes[wrap(i)] ?? 0) * t;
    const b = (slopes[wrap(i + 1)] ?? 0) * (t - 1);
    return a + (b - a) * fade(t);
  };
}
