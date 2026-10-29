/**
 * Fractal glass (docs/TOOLS.md E6): the picture seen through reeded glass.
 * The plane is cut into parallel strips (width, angle); inside each strip
 * the picture is sampled through a lens profile, so every strip shows a
 * scaled (or mirrored) slice of its surroundings, optionally shifted by a
 * hashed amount per strip. Optional blur (frosted glass), a highlight
 * with shade per strip (rounded reeds) and a glass tint. Pure and deterministic; strips are
 * laid out from the picture centre in input pixels, so a preview and an
 * export of the same design show the same strips.
 */
import { hexToRgb255 } from "@musterli/engine";
import { createPixelBuffer, type PixelBuffer } from "./buffer";
import { boxBlur, sampleBilinearRgba } from "./filters";
import { hashSigned } from "./grain";

/** Lens profile across a strip: flat prism, rounded reed, ridge. */
export const FRACTAL_GLASS_PROFILES = ["flat", "rounded", "ridged"] as const;
export type FractalGlassProfile = (typeof FRACTAL_GLASS_PROFILES)[number];

/** Magnification of a strip at `distortion = 1`. */
export const FRACTAL_GLASS_MAX_ZOOM = 3;

export interface FractalGlassOptions {
  /** Strip width in input pixels (already scaled to the render size). */
  readonly stripWidth: number;
  /** Strip direction in degrees, 0 = vertical strips. */
  readonly angle: number;
  /** 0 to 1: how wide a slice each strip shows (1 = `FRACTAL_GLASS_MAX_ZOOM` strip widths). */
  readonly distortion: number;
  readonly profile: FractalGlassProfile;
  /** Every strip shows its slice mirrored. */
  readonly mirror: boolean;
  /** 0 to 1: random shift per strip, up to one strip width either way. */
  readonly jitter: number;
  /** Blur radius in input pixels (already scaled). */
  readonly blur: number;
  /** 0 to 1: gloss line and shade per strip. */
  readonly highlight: number;
  /** Glass colour (hex), multiplied in by `tintAmount` (0 to 1). */
  readonly tint: string;
  readonly tintAmount: number;
  readonly seed: number;
}

/** Profile `g(t)` for `t` in [-0.5, 0.5] with `g(±0.5) = ±0.5`. */
export function glassProfile(profile: FractalGlassProfile, t: number): number {
  switch (profile) {
    case "rounded":
      return 0.5 * Math.sin(Math.PI * t);
    case "ridged":
      return 2 * t * Math.abs(t);
    default:
      return t;
  }
}

/** Gloss (added white, 0 to 1) and shade (multiplied away, 0 to 1) at `t` across a strip. */
export function glassLight(t: number, highlight: number): { gloss: number; shade: number } {
  if (highlight <= 0) return { gloss: 0, shade: 0 };
  const g = (t + 0.22) / 0.1;
  const s = Math.max(0, Math.min(1, (t - 0.05) / 0.45));
  return { gloss: highlight * 0.55 * Math.exp(-g * g), shade: highlight * 0.4 * s * s };
}

/** Fractal glass over `input`, at the input's size. */
export function applyFractalGlass(input: PixelBuffer, o: FractalGlassOptions): PixelBuffer {
  const { width, height } = input;
  const out = createPixelBuffer(width, height);
  const d = out.data;
  const src = o.blur >= 1 ? boxBlur(input, o.blur) : input;
  const w = Math.max(1, o.stripWidth);
  const rad = (o.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = width / 2;
  const cy = height / 2;
  const zoom =
    (1 + (FRACTAL_GLASS_MAX_ZOOM - 1) * Math.max(0, Math.min(1, o.distortion))) *
    (o.mirror ? -1 : 1);
  const jitter = Math.max(0, Math.min(1, o.jitter));
  const seed = o.seed | 0;
  const highlight = Math.max(0, Math.min(1, o.highlight));
  const tintAmount = Math.max(0, Math.min(1, o.tintAmount));
  const tintRgb = hexToRgb255(o.tint);
  // Per-channel factor of the tinted glass: 1 − amount · (1 − tint).
  const tint = tintRgb.map((v) => 1 - tintAmount * (1 - v / 255));
  const [tr, tg, tb] = [tint[0] ?? 1, tint[1] ?? 1, tint[2] ?? 1];
  const a = new Float32Array(4);
  const b = new Float32Array(4);
  /** Samples strip `k` at local position `t` and along-strip coordinate `v` into `px`. */
  const sampleStrip = (k: number, t: number, v: number, px: Float32Array): void => {
    const tt = t < -0.5 ? -0.5 : t > 0.5 ? 0.5 : t;
    const shift = jitter === 0 ? 0 : hashSigned(k, 0, seed) * jitter;
    const u = (k + 0.5 + shift + zoom * glassProfile(o.profile, tt)) * w;
    sampleBilinearRgba(src, cx + u * cos - v * sin, cy + u * sin + v * cos, px);
    if (highlight > 0) {
      const { gloss, shade } = glassLight(tt, highlight);
      for (let c = 0; c < 3; c++) px[c] = (px[c] ?? 0) * (1 - shade) + 255 * gloss;
    }
  };
  for (let y = 0; y < height; y++) {
    const dy = y + 0.5 - cy;
    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      const dx = x + 0.5 - cx;
      const uu = (dx * cos + dy * sin) / w;
      const v = -dx * sin + dy * cos;
      const k = Math.floor(uu);
      const t = uu - k - 0.5;
      sampleStrip(k, t, v, a);
      // Anti-aliasing: within half a pixel of a strip edge, mix in the neighbour.
      const edge = (0.5 - Math.abs(t)) * w;
      if (edge < 0.5) {
        const nk = t > 0 ? k + 1 : k - 1;
        sampleStrip(nk, t > 0 ? t - 1 : t + 1, v, b);
        const m = 0.5 - edge;
        for (let c = 0; c < 4; c++) a[c] = (a[c] ?? 0) * (1 - m) + (b[c] ?? 0) * m;
      }
      d[i] = (a[0] ?? 0) * tr;
      d[i + 1] = (a[1] ?? 0) * tg;
      d[i + 2] = (a[2] ?? 0) * tb;
      d[i + 3] = a[3] ?? 0;
    }
  }
  return out;
}
