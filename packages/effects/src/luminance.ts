/**
 * Luminance of gamma-encoded RGB, as image editors compute it for black and
 * white conversions and gradient maps (weights on the encoded channels, not
 * on linear light).
 */

export interface LumaWeights {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Named weight sets: ITU-R BT.709 (HD video, sRGB primaries), BT.601 (SD video), plain average. */
export const LUMA_WEIGHTS = {
  rec709: { r: 0.2126, g: 0.7152, b: 0.0722 },
  rec601: { r: 0.299, g: 0.587, b: 0.114 },
  average: { r: 1 / 3, g: 1 / 3, b: 1 / 3 },
} as const satisfies Readonly<Record<string, LumaWeights>>;

export type LumaPreset = keyof typeof LUMA_WEIGHTS;

/** Scales weights to sum 1; all zero (or invalid) falls back to Rec. 709. */
export function normalizeWeights(w: LumaWeights): LumaWeights {
  const r = Math.max(0, Number.isFinite(w.r) ? w.r : 0);
  const g = Math.max(0, Number.isFinite(w.g) ? w.g : 0);
  const b = Math.max(0, Number.isFinite(w.b) ? w.b : 0);
  const sum = r + g + b;
  return sum > 0 ? { r: r / sum, g: g / sum, b: b / sum } : LUMA_WEIGHTS.rec709;
}

/** Luminance 0 to 255 of one pixel; weights must sum to 1. */
export function luma(r: number, g: number, b: number, w: LumaWeights): number {
  return r * w.r + g * w.g + b * w.b;
}
