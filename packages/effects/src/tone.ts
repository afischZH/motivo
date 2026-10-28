/**
 * Tone curve shared by the photo effects (duotone, ASCII art, later halftone
 * and dither): brightness, contrast and gamma folded into one lookup table.
 */

export interface ToneOptions {
  /** -100 to 100: shifts every value by up to ±0.5. */
  readonly brightness: number;
  /** -100 to 100: slope around the midpoint, `tan((c / 100 + 1) · π/4)` (0 keeps the slope 1). */
  readonly contrast: number;
  /** 0.25 to 4: `v^(1/γ)`; above 1 brightens the midtones. */
  readonly gamma: number;
}

export const NEUTRAL_TONE: ToneOptions = { brightness: 0, contrast: 0, gamma: 1 };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Applies the tone curve to one value in [0, 1]. */
export function applyTone(v: number, tone: ToneOptions): number {
  const c = Math.max(-99.9, Math.min(99.9, tone.contrast));
  // tan(π/4) is 0.9999999999999999 in floating point: keep 0 exactly neutral.
  const slope = c === 0 ? 1 : Math.tan(((c / 100 + 1) * Math.PI) / 4);
  let out = clamp01(v + tone.brightness / 200);
  out = clamp01((out - 0.5) * slope + 0.5);
  const gamma = Math.max(0.01, tone.gamma);
  return Math.pow(out, 1 / gamma);
}

/** The tone curve for the 256 byte values, as floats in [0, 1]. */
export function toneCurve(tone: ToneOptions): Float32Array {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = applyTone(i / 255, tone);
  return lut;
}
