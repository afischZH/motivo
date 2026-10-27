/**
 * Grain tiles shared by the tools with a grain option. Internal to the package.
 *
 * A tile depends only on its seed and shape, so slider changes reuse it
 * instead of recomputing tens of thousands of Gaussian samples and the PNG.
 * Pure memoisation: outputs are identical with or without the cache.
 */
import {
  type GrainBlend,
  type GrainLayer,
  createRng,
  deriveSeed,
  grainTile,
  pngDataUri,
  type Rng,
} from "@motivo/engine";

const TILE_CACHE_MAX = 16;
const tileCache = new Map<string, string>();

/** Returns the cached value for `key`, or builds, caches and returns it (LRU, 16 entries). */
export function cachedTile(key: string, build: () => string): string {
  const hit = tileCache.get(key);
  if (hit !== undefined) {
    // Refresh recency (Map keeps insertion order).
    tileCache.delete(key);
    tileCache.set(key, hit);
    return hit;
  }
  const uri = build();
  tileCache.set(key, uri);
  if (tileCache.size > TILE_CACHE_MAX) {
    const oldest = tileCache.keys().next().value;
    if (oldest !== undefined) tileCache.delete(oldest);
  }
  return uri;
}

/** Number of cached tiles, for tests. */
export function grainTileCacheSize(): number {
  return tileCache.size;
}

/** PNG data URI of a grain tile drawn from `rng` (cached under `key`). */
export function grainTileDataUri(
  key: string,
  rng: Rng,
  size: number,
  mono: boolean,
  blend: GrainBlend,
  edge?: number,
): string {
  return cachedTile(key, () =>
    pngDataUri(
      grainTile(rng, edge === undefined ? { size, mono, blend } : { size, mono, blend, edge }),
      mono ? "gray" : "rgb",
    ),
  );
}

/**
 * Edge of the grain tile of the gradient tools. Smaller than Noise/Grain's
 * 256 px tile: fine grain on a smooth gradient shows no visible repeat at
 * 128 px, and the SVG stays about 65 KB lighter (each export and motif).
 */
export const GRADIENT_GRAIN_EDGE = 128;

/**
 * Fine monochrome overlay grain for the gradient tools, or null at zero
 * amount. The tile comes from its own rng stream derived from the seed, so
 * it never shifts the geometry's random draws, and one tile serves all
 * gradient tools for a seed.
 */
export function gradientGrain(seed: number, amount: number): GrainLayer | null {
  if (!(amount > 0)) return null;
  const href = grainTileDataUri(
    `gradient|${seed}`,
    createRng(deriveSeed(seed, "grain")),
    1,
    true,
    "overlay",
    GRADIENT_GRAIN_EDGE,
  );
  return { href, edge: GRADIENT_GRAIN_EDGE, opacity: amount / 100, blend: "overlay" };
}
