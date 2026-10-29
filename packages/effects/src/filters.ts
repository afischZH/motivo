/**
 * Small pixel filters shared by the M6 effects (god rays, fractal glass):
 * bilinear sampling with clamped edges and a separable box blur. Pure and
 * deterministic, no DOM.
 */
import { createPixelBuffer, type PixelBuffer } from "./buffer";

const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Bilinear sample of a single-channel `width` × `height` grid at the point
 * (`x`, `y`) in pixel units (pixel centres at `i + 0.5`), edges clamped.
 */
export function sampleBilinear1(
  grid: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = clampInt(x0, 0, width - 1);
  const xb = clampInt(x0 + 1, 0, width - 1);
  const ya = clampInt(y0, 0, height - 1) * width;
  const yb = clampInt(y0 + 1, 0, height - 1) * width;
  const a = grid[ya + xa] ?? 0;
  const b = grid[ya + xb] ?? 0;
  const c = grid[yb + xa] ?? 0;
  const d = grid[yb + xb] ?? 0;
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/**
 * Bilinear RGBA sample of `src` at (`x`, `y`) in pixel units, edges
 * clamped, written to `out[0..3]` as floats 0 to 255.
 */
export function sampleBilinearRgba(
  src: PixelBuffer,
  x: number,
  y: number,
  out: Float32Array,
): void {
  const { width, height, data } = src;
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = clampInt(x0, 0, width - 1) * 4;
  const xb = clampInt(x0 + 1, 0, width - 1) * 4;
  const ya = clampInt(y0, 0, height - 1) * width * 4;
  const yb = clampInt(y0 + 1, 0, height - 1) * width * 4;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  for (let c = 0; c < 4; c++) {
    out[c] =
      (data[ya + xa + c] ?? 0) * w00 +
      (data[ya + xb + c] ?? 0) * w10 +
      (data[yb + xa + c] ?? 0) * w01 +
      (data[yb + xb + c] ?? 0) * w11;
  }
}

/** One box pass of radius `r` along rows (`horizontal`) or columns, edges clamped. */
function boxPass(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
): void {
  const n = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? 4 : w * 4;
  const inv = 1 / (2 * r + 1);
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * w * 4 : line * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[base + clampInt(k, 0, n - 1) * step + c] ?? 0;
      for (let i = 0; i < n; i++) {
        dst[base + i * step + c] = sum * inv;
        const add = clampInt(i + r + 1, 0, n - 1);
        const sub = clampInt(i - r, 0, n - 1);
        sum += (src[base + add * step + c] ?? 0) - (src[base + sub * step + c] ?? 0);
      }
    }
  }
}

/**
 * Blur of `src` with radius `radius` pixels: two separable box passes (a
 * tent filter, close to a Gaussian with σ ≈ 0.8 · radius). Radius rounded;
 * below 1 the picture is copied. Linear time in the radius-independent
 * running-sum form, so large radii cost the same as small ones.
 */
export function boxBlur(src: PixelBuffer, radius: number): PixelBuffer {
  const out = createPixelBuffer(src.width, src.height);
  const r = Math.round(radius);
  if (!(r >= 1)) {
    out.data.set(src.data);
    return out;
  }
  const { width: w, height: h } = src;
  const r1 = Math.max(1, Math.round(r / 2));
  const tmp = new Uint8ClampedArray(src.data.length);
  boxPass(src.data, tmp, w, h, r1, true);
  boxPass(tmp, out.data, w, h, r1, false);
  boxPass(out.data, tmp, w, h, r1, true);
  boxPass(tmp, out.data, w, h, r1, false);
  return out;
}
