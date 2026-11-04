/**
 * Light beams (docs/TOOLS.md D11): soft rays from a light source through
 * haze. The rays are noise sampled on a circle around the source (no seam
 * at any angle), limited to a cone, fading with distance; the haze is a
 * slow fbm. Rays sway and the haze drifts on circles: seamless loops.
 */
import { orbitOffsets } from "../cpu-common";
import { saltSeed } from "../noise";

export interface LightBeamsOptions {
  /** Source position as a share of the canvas, -0.5 to 1.5 (outside is fine). */
  sourceX: number;
  sourceY: number;
  /** Degrees, 90 = down (y grows downwards). */
  direction: number;
  /** Opening angle of the cone in degrees, 10 to 360. */
  spread: number;
  /** Ray density, 1 to 24. */
  density: number;
  /** Ray contrast, 1 to 8. */
  sharpness: number;
  /** Fall-off with distance, 0 to 4. */
  decay: number;
  /** 0 to 2. */
  intensity: number;
  /** 0 to 1. */
  haze: number;
  /** Loop phase in [0, 1). */
  phase: number;
  grain: number;
  vignette: number;
  /** Design size, to place the source in centred units. */
  width: number;
  height: number;
  seed: number;
}

export const LIGHT_BEAMS_ORBITS: readonly (readonly [number, number, number])[] = [
  [0.35, 0, 1],
  [0.3, 2.2, -1],
  [0.5, 4.4, 1],
];

const GRAIN_SALT = 99;

export function lightBeamsUniforms(
  o: LightBeamsOptions,
  t = 0,
): Record<string, number | readonly number[]> {
  const loop = o.phase + t;
  const minEdge = Math.max(1, Math.min(o.width, o.height));
  const dir = (o.direction * Math.PI) / 180;
  const half = (Math.min(360, Math.max(1, o.spread)) * Math.PI) / 360;
  const seed = o.seed >>> 0;
  return {
    u_source: [((o.sourceX - 0.5) * o.width) / minEdge, ((o.sourceY - 0.5) * o.height) / minEdge],
    u_coneDir: [Math.cos(dir), Math.sin(dir)],
    u_coneCos: Math.cos(half),
    u_density: o.density,
    u_sharpness: o.sharpness,
    u_decay: o.decay,
    u_intensity: o.intensity,
    u_haze: o.haze,
    u_off: orbitOffsets(loop, LIGHT_BEAMS_ORBITS),
    u_grain: o.grain,
    u_vignette: o.vignette,
    u_salts: [saltSeed(seed, 1), saltSeed(seed, 2), saltSeed(seed, 3)],
    u_grainSalt: saltSeed(seed, GRAIN_SALT),
  };
}
