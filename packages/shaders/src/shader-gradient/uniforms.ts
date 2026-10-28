/**
 * Shader gradient (docs/TOOLS.md C4): options to uniforms. The same
 * uniform record feeds the GPU (`SHADER_GRADIENT_FRAGMENT`) and the CPU
 * reference (`renderShaderGradientCpu`), so both always see equal inputs.
 */
import { bayerMatrix } from "@musterli/effects";
import { saltSeed } from "../noise";

export const SHADER_GRADIENT_STYLES = [
  "liquid",
  "silk",
  "streaked",
  "grainy",
  "marble",
  "ripple",
  "aurora",
] as const;
export type ShaderGradientStyle = (typeof SHADER_GRADIENT_STYLES)[number];

export const SHADER_DITHERS = ["off", "bayer2", "bayer4", "bayer8"] as const;
export type ShaderDither = (typeof SHADER_DITHERS)[number];

export interface ShaderGradientOptions {
  style: ShaderGradientStyle;
  /** Waves per shorter edge, 0.2 to 6. */
  frequency: number;
  /** Spread of the field over the ramp, 0 to 2. */
  amplitude: number;
  /** Domain warping strength, 0 to 3. */
  warp: number;
  /** fbm octaves, 1 to 6. */
  detail: number;
  /** Degrees. */
  angle: number;
  /** 0.25 to 4. */
  zoom: number;
  /** Loop phase in [0, 1): the still frame. */
  phase: number;
  dither: ShaderDither;
  /** Ramp steps with dithering, 2 to 16. */
  levels: number;
  /** Dither cell in design px, 1 to 8. */
  ditherScale: number;
  /** 0 to 1. */
  grain: number;
  /** 0 to 1. */
  vignette: number;
  /** uint32 design seed. */
  seed: number;
}

/**
 * Field gain per style: fbm sums rarely leave [-0.5, 0.5], sine styles
 * already span [-1, 1]. With amplitude 1 every style uses most of the ramp.
 */
export const STYLE_GAIN: Readonly<Record<ShaderGradientStyle, number>> = {
  liquid: 1.7,
  silk: 1,
  streaked: 1.6,
  grainy: 1.2,
  marble: 1,
  ripple: 1,
  aurora: 1.6,
};

/**
 * Circles the warp stages move on (radius in noise units, phase, turns per
 * loop): integer turns make every animation a seamless loop.
 */
export const TIME_ORBITS: readonly (readonly [radius: number, phase: number, turns: number])[] = [
  [0.6, 0, 1],
  [0.5, 1.7, -1],
  [0.4, 3.9, 1],
  [0.55, 5.1, -1],
];

/** Noise streams (salts) of the field, plus one for the grain. */
export const NOISE_STREAMS = 5;
const GRAIN_SALT = 99;

/** Length of the Bayer uniform array (8 × 8). */
export const BAYER_UNIFORM_LENGTH = 64;

const BAYER_SIZE: Readonly<Record<ShaderDither, 0 | 2 | 4 | 8>> = {
  off: 0,
  bayer2: 2,
  bayer4: 4,
  bayer8: 8,
};

/** Uniform values of the shader gradient at loop time `t` (added to the phase). */
export function shaderGradientUniforms(
  o: ShaderGradientOptions,
  t = 0,
): Record<string, number | readonly number[]> {
  const rad = (o.angle * Math.PI) / 180;
  const k = o.frequency / o.zoom;
  const cos = Math.cos(rad) * k;
  const sin = Math.sin(rad) * k;
  const loop = o.phase + t;
  const theta = 2 * Math.PI * (loop - Math.floor(loop));
  const offsets: number[] = [];
  for (const [radius, phase, turns] of TIME_ORBITS) {
    offsets.push(
      radius * Math.cos(theta * turns + phase),
      radius * Math.sin(theta * turns + phase),
    );
  }
  const n = BAYER_SIZE[o.dither];
  const bayer = new Array<number>(BAYER_UNIFORM_LENGTH).fill(0);
  if (n !== 0) bayerMatrix(n).forEach((v, i) => (bayer[i] = v));
  const seed = o.seed >>> 0;
  return {
    u_style: SHADER_GRADIENT_STYLES.indexOf(o.style),
    u_detail: Math.round(Math.min(6, Math.max(1, o.detail))),
    // Rotation, frequency and zoom in one matrix (row-major a, b, c, d).
    u_basis: [cos, sin, -sin, cos],
    u_off: offsets,
    u_warp: o.warp,
    u_amplitude: o.amplitude * STYLE_GAIN[o.style],
    u_bayer: bayer,
    u_bayerSize: n,
    u_levels: Math.round(Math.min(16, Math.max(2, o.levels))),
    u_ditherScale: Math.max(1, o.ditherScale),
    u_grain: o.grain,
    u_vignette: o.vignette,
    u_salts: Array.from({ length: NOISE_STREAMS }, (_, i) => saltSeed(seed, i + 1)),
    u_grainSalt: saltSeed(seed, GRAIN_SALT),
  };
}
