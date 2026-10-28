/**
 * The colour ramp of a shader as a 1D texture (`u_palette`, RGBA8, 256 × 1)
 * and its CPU lookup. The GLSL `musterliRamp` and `rampColor` compute the
 * same linear interpolation between neighbouring entries.
 */
import { GRADIENT_LUT_SIZE, gradientLut } from "@musterli/effects";

/** Texels of the palette texture. */
export const PALETTE_TEXTURE_SIZE = GRADIENT_LUT_SIZE;

/**
 * RGBA bytes (`4 × 256`) of the ramp through `colors` (hex), evenly spaced
 * and mixed in OKLab; alpha is 255.
 */
export function paletteTextureData(colors: readonly string[]): Uint8Array {
  const rgb = gradientLut(colors);
  const out = new Uint8Array(PALETTE_TEXTURE_SIZE * 4);
  for (let i = 0; i < PALETTE_TEXTURE_SIZE; i++) {
    out[i * 4] = rgb[i * 3] ?? 0;
    out[i * 4 + 1] = rgb[i * 3 + 1] ?? 0;
    out[i * 4 + 2] = rgb[i * 3 + 2] ?? 0;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * Colour at `v` in [0, 1] of a palette texture, channels in [0, 1], written
 * to `out` (r, g, b). Same as the GLSL: index `v · 255`, linear between the
 * two neighbouring texels.
 */
export function rampColor(texture: Uint8Array, v: number, out: Float64Array): void {
  const x = Math.min(1, Math.max(0, v)) * (PALETTE_TEXTURE_SIZE - 1);
  const i0 = Math.min(Math.floor(x), PALETTE_TEXTURE_SIZE - 2);
  const f = x - i0;
  const a = i0 * 4;
  const b = a + 4;
  for (let c = 0; c < 3; c++) {
    const ca = (texture[a + c] ?? 0) / 255;
    const cb = (texture[b + c] ?? 0) / 255;
    out[c] = ca + (cb - ca) * f;
  }
}
