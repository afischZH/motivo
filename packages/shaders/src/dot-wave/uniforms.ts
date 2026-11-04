/**
 * Dot wave grid (docs/TOOLS.md D9): a regular grid of dots, squares,
 * dashes, crosses or rings whose size and colour follow a slow field of
 * noise, waves or ripples. Options to uniforms; the same record feeds the
 * GPU (`DOT_WAVE_FRAGMENT`) and the CPU twin (`renderDotWaveCpu`).
 */
import { hexToRgb, orbitOffsets } from "../cpu-common";
import { saltSeed } from "../noise";

export const DOT_WAVE_FIELDS = ["noise", "waves", "ripple"] as const;
export type DotWaveField = (typeof DOT_WAVE_FIELDS)[number];

export const DOT_WAVE_SHAPES = ["dot", "square", "dash", "cross", "ring"] as const;
export type DotWaveShape = (typeof DOT_WAVE_SHAPES)[number];

export interface DotWaveOptions {
  field: DotWaveField;
  shape: DotWaveShape;
  /** Cell size in design px, 6 to 120. */
  spacing: number;
  /** Smallest and largest dot as a share of the cell, 0 to 1. */
  minSize: number;
  maxSize: number;
  /** Waves or noise blobs per shorter edge, 0.2 to 8. */
  frequency: number;
  /** Degrees; direction of waves and dashes. */
  angle: number;
  /** How much noise bends waves and ripples, 0 to 3. */
  warp: number;
  /** Fade of the dots towards the edges, 0 to 1. */
  fade: number;
  /** Loop phase in [0, 1). */
  phase: number;
  /** `#rrggbb`. */
  background: string;
  /** 0 to 1. */
  grain: number;
  /** 0 to 1. */
  vignette: number;
  seed: number;
}

/** Circles of the noise offsets (radius, phase, turns per loop). */
export const DOT_WAVE_ORBITS: readonly (readonly [number, number, number])[] = [
  [0.7, 0, 1],
  [0.45, 2.1, -1],
];

const GRAIN_SALT = 99;

/** Uniform values at loop time `t` (added to the phase). */
export function dotWaveUniforms(
  o: DotWaveOptions,
  t = 0,
): Record<string, number | readonly number[]> {
  const loop = o.phase + t;
  const rad = (o.angle * Math.PI) / 180;
  const lo = Math.min(o.minSize, o.maxSize);
  const hi = Math.max(o.minSize, o.maxSize);
  const seed = o.seed >>> 0;
  return {
    u_field: DOT_WAVE_FIELDS.indexOf(o.field),
    u_shape: DOT_WAVE_SHAPES.indexOf(o.shape),
    u_spacing: Math.max(2, o.spacing),
    u_size: [lo, hi],
    u_frequency: o.frequency,
    u_dir: [Math.cos(rad), Math.sin(rad)],
    u_warp: o.warp,
    u_fade: o.fade,
    // One full wave travels past per loop: seamless.
    u_wavePhase: 2 * Math.PI * (loop - Math.floor(loop)),
    u_off: orbitOffsets(loop, DOT_WAVE_ORBITS),
    u_background: hexToRgb(o.background),
    u_salts: [saltSeed(seed, 1), saltSeed(seed, 2)],
    u_grain: o.grain,
    u_vignette: o.vignette,
    u_grainSalt: saltSeed(seed, GRAIN_SALT),
  };
}
