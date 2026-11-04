/**
 * Caustics and cells (docs/TOOLS.md D10): animated Voronoi cells. The
 * distance to the nearest and second nearest feature point gives cell
 * shading, pool-light caustics (bright thin seams, two layers) or crystal
 * facets. Feature points circle around their rest position once per loop,
 * so every animation is seamless.
 */
import { orbitOffsets } from "../cpu-common";
import { saltSeed } from "../noise";

export const CAUSTICS_STYLES = ["caustics", "cells", "crystal"] as const;
export type CausticsStyle = (typeof CAUSTICS_STYLES)[number];

export interface CausticsOptions {
  style: CausticsStyle;
  /** Cells per shorter edge, 2 to 40. */
  scale: number;
  /** Randomness of the point positions, 0 to 1. */
  jitter: number;
  /** Organic bending of the cells, 0 to 2. */
  warp: number;
  /** Width of seams and edges, 0 to 1. */
  edge: number;
  /** 0.5 to 2. */
  contrast: number;
  /** Degrees. */
  angle: number;
  /** Loop phase in [0, 1). */
  phase: number;
  grain: number;
  vignette: number;
  seed: number;
}

export const CAUSTICS_ORBITS: readonly (readonly [number, number, number])[] = [
  [0.6, 0, 1],
  [0.5, 2.4, -1],
];

const GRAIN_SALT = 99;

export function causticsUniforms(
  o: CausticsOptions,
  t = 0,
): Record<string, number | readonly number[]> {
  const loop = o.phase + t;
  const rad = (o.angle * Math.PI) / 180;
  const k = o.scale;
  const seed = o.seed >>> 0;
  return {
    u_style: CAUSTICS_STYLES.indexOf(o.style),
    u_basis: [Math.cos(rad) * k, Math.sin(rad) * k, -Math.sin(rad) * k, Math.cos(rad) * k],
    u_scale: k,
    u_jitter: o.jitter,
    u_warp: o.warp,
    u_edge: o.edge,
    u_contrast: o.contrast,
    u_theta: 2 * Math.PI * (loop - Math.floor(loop)),
    u_off: orbitOffsets(loop, CAUSTICS_ORBITS),
    u_grain: o.grain,
    u_vignette: o.vignette,
    u_salts: [saltSeed(seed, 1), saltSeed(seed, 2), saltSeed(seed, 3)],
    u_grainSalt: saltSeed(seed, GRAIN_SALT),
  };
}
