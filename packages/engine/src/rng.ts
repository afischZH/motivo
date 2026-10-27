/**
 * Seeded pseudo random number generation.
 *
 * All randomness in the engine must flow through an `Rng` created from a
 * 32-bit seed, so that a design is fully reproducible from (params, seed).
 */

/** Deterministic random source. All methods advance the internal state. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. Bounds are rounded inward. */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  float(min: number, max: number): number;
  /** Uniformly picks one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Returns a new array with the elements in random order (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Returns true with probability `p` (default 0.5). */
  bool(p?: number): boolean;
  /** Normally distributed value (Box-Muller), default mean 0 and standard deviation 1. */
  gaussian(mean?: number, stdDev?: number): number;
}

const UINT32_RANGE = 4294967296; // 2^32

/** Coerces any number to an unsigned 32-bit integer seed. Non-finite values map to 0. */
export function toUint32(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value) >>> 0;
}

/**
 * Creates a mulberry32 generator. The seed is coerced to uint32
 * (truncated, then wrapped modulo 2^32).
 */
export function createRng(seed: number): Rng {
  let state = toUint32(seed);

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };

  const int = (min: number, max: number): number => {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (!(lo <= hi)) {
      throw new RangeError(`rng.int: empty range [${min}, ${max}]`);
    }
    return lo + Math.floor(next() * (hi - lo + 1));
  };

  const float = (min: number, max: number): number => min + next() * (max - min);

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new RangeError("rng.pick: cannot pick from an empty array");
    }
    return items[Math.floor(next() * items.length)] as T;
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  };

  const bool = (p = 0.5): boolean => next() < p;

  const gaussian = (mean = 0, stdDev = 1): number => {
    // 1 - next() lies in (0, 1], so the logarithm is always finite.
    const u = 1 - next();
    const v = next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + z * stdDev;
  };

  return { next, int, float, pick, shuffle, bool, gaussian };
}

/** FNV-1a 32-bit hash over UTF-16 code units. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** MurmurHash3 32-bit finalizer: avalanches all input bits. */
function fmix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Derives an independent uint32 seed for a sub-stream, e.g.
 * `createRng(deriveSeed(seed, "colors"))`. Deterministic; numeric and string
 * salts are hashed in separate domains, so `1` and `"1"` give different seeds.
 */
export function deriveSeed(seed: number, salt: number | string): number {
  const saltHash = typeof salt === "number" ? fnv1a(`n:${salt}`) : fnv1a(`s:${salt}`);
  return fmix32(toUint32(seed) ^ fmix32((saltHash + 0x9e3779b9) >>> 0));
}
