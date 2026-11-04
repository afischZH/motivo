/**
 * Liquid chrome (docs/TOOLS.md C7): a warped noise height field, lit like
 * polished metal. The surface normal comes from finite differences of the
 * height, the reflection picks a colour from the palette ramp (a fake
 * environment with soft horizon bands), plus a specular highlight and an
 * optional oil-slick shimmer. No 3D library, one pass per pixel.
 */
import { hexToRgb, orbitOffsets } from "../cpu-common";
import { saltSeed } from "../noise";

export interface LiquidChromeOptions {
  /** Folds per shorter edge, 0.2 to 6. */
  frequency: number;
  /** Domain warping, 0 to 3. */
  warp: number;
  /** fbm octaves, 1 to 6. */
  detail: number;
  /** Bump strength of the surface, 0.05 to 2. */
  relief: number;
  /** Horizon bands in the reflection, 0.5 to 6. */
  bands: number;
  /** Degrees; direction of the light and of the horizon. */
  light: number;
  /** Specular highlight, 0 to 1. */
  specular: number;
  /** Rainbow shimmer, 0 to 1. */
  iridescence: number;
  /** Degrees; rotation of the field. */
  angle: number;
  /** Loop phase in [0, 1). */
  phase: number;
  /** 0 to 1. */
  grain: number;
  vignette: number;
  /** `#rrggbb` of the highlight. */
  highlight: string;
  seed: number;
}

export const LIQUID_CHROME_ORBITS: readonly (readonly [number, number, number])[] = [
  [0.5, 0, 1],
  [0.4, 1.9, -1],
  [0.35, 4.2, 1],
];

const GRAIN_SALT = 99;

export function liquidChromeUniforms(
  o: LiquidChromeOptions,
  t = 0,
): Record<string, number | readonly number[]> {
  const loop = o.phase + t;
  const rad = (o.angle * Math.PI) / 180;
  const k = o.frequency;
  const light = (o.light * Math.PI) / 180;
  const seed = o.seed >>> 0;
  return {
    u_basis: [Math.cos(rad) * k, Math.sin(rad) * k, -Math.sin(rad) * k, Math.cos(rad) * k],
    u_warp: o.warp,
    u_detail: Math.round(Math.min(6, Math.max(1, o.detail))),
    u_relief: o.relief,
    u_bands: o.bands,
    u_light: [Math.cos(light), Math.sin(light)],
    u_specular: o.specular,
    u_iridescence: o.iridescence,
    u_off: orbitOffsets(loop, LIQUID_CHROME_ORBITS),
    u_grain: o.grain,
    u_vignette: o.vignette,
    u_highlight: hexToRgb(o.highlight),
    u_salts: [saltSeed(seed, 1), saltSeed(seed, 2), saltSeed(seed, 3)],
    u_grainSalt: saltSeed(seed, GRAIN_SALT),
  };
}
