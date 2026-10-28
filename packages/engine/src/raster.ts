/**
 * Tiny deterministic software rasteriser for small, smooth fields: fill
 * closed cubic paths with anti-aliasing into a premultiplied float RGBA
 * buffer and blur it with a separable Gaussian. No DOM or canvas, so it runs
 * the same on the server, in workers and in tests.
 *
 * Meant for low-resolution layers that the browser upscales afterwards
 * (e.g. the blurred blobs of the mesh gradient), not for full-size images.
 */
import type { CubicPath } from "./curves";
import type { RgbaBuffer } from "./png";
import type { Vec2 } from "./vec";

/** Premultiplied RGBA in [0, 1], row-major, 4 floats per pixel. */
export interface FloatRgba {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

export function createFloatRgba(width: number, height: number): FloatRgba {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  return { width: w, height: h, data: new Float32Array(w * h * 4) };
}

/** Line segments per cubic segment in `flattenCubicPath`. */
const CUBIC_STEPS = 16;

/**
 * Polyline through a cubic path, `steps` straight pieces per cubic segment
 * (fixed, so the result does not depend on scale). A closed path ends where it
 * started; the closing edge is implied for filling.
 */
export function flattenCubicPath(path: CubicPath, steps = CUBIC_STEPS): Vec2[] {
  const out: Vec2[] = [path.start];
  let p0 = path.start;
  for (const s of path.segments) {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      out.push({
        x: a * p0.x + b * s.c1.x + c * s.c2.x + d * s.to.x,
        y: a * p0.y + b * s.c1.y + c * s.c2.y + d * s.to.y,
      });
    }
    p0 = s.to;
  }
  return out;
}

/** Vertical samples per pixel row; horizontal coverage is exact. */
const SUBSAMPLES = 4;

/**
 * Per-pixel coverage in [0, 1] of the closed polygon `points` (pixel units,
 * pixel (i, j) spans [i, i + 1) x [j, j + 1)), nonzero fill rule as in SVG.
 * Anti-aliased with `SUBSAMPLES` scanlines per row and exact span ends.
 */
export function polygonCoverage(
  points: readonly Vec2[],
  width: number,
  height: number,
): Float32Array {
  const cov = new Float32Array(width * height);
  const n = points.length;
  if (n < 3) return cov;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const rowFrom = Math.max(0, Math.floor(minY));
  const rowTo = Math.min(height - 1, Math.ceil(maxY));
  const xs: number[] = [];
  const dirs: number[] = [];
  const order: number[] = [];
  const weight = 1 / SUBSAMPLES;
  for (let row = rowFrom; row <= rowTo; row++) {
    const base = row * width;
    for (let s = 0; s < SUBSAMPLES; s++) {
      const y = row + (s + 0.5) / SUBSAMPLES;
      xs.length = 0;
      dirs.length = 0;
      for (let i = 0; i < n; i++) {
        const a = points[i] as Vec2;
        const b = points[(i + 1) % n] as Vec2;
        // Half-open rule: an edge covers y in [min, max), so vertices count once.
        if (a.y <= y && b.y > y) {
          xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
          dirs.push(1);
        } else if (b.y <= y && a.y > y) {
          xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
          dirs.push(-1);
        }
      }
      order.length = 0;
      for (let i = 0; i < xs.length; i++) order.push(i);
      order.sort((i, j) => (xs[i] as number) - (xs[j] as number));
      let winding = 0;
      for (let k = 0; k < order.length - 1; k++) {
        const i = order[k] as number;
        winding += dirs[i] as number;
        if (winding === 0) continue;
        const x0 = Math.max(0, xs[i] as number);
        const x1 = Math.min(width, xs[order[k + 1] as number] as number);
        if (x1 <= x0) continue;
        const c0 = Math.floor(x0);
        const c1 = Math.floor(x1);
        if (c0 === c1) {
          cov[base + c0] = (cov[base + c0] as number) + (x1 - x0) * weight;
          continue;
        }
        cov[base + c0] = (cov[base + c0] as number) + (c0 + 1 - x0) * weight;
        for (let c = c0 + 1; c < c1; c++) cov[base + c] = (cov[base + c] as number) + weight;
        if (c1 < width) cov[base + c1] = (cov[base + c1] as number) + (x1 - c1) * weight;
      }
    }
  }
  for (let i = 0; i < cov.length; i++) if ((cov[i] as number) > 1) cov[i] = 1;
  return cov;
}

/**
 * Paints an opaque colour (sRGB channels in [0, 1]) with per-pixel coverage
 * over `target` (source-over, premultiplied).
 */
export function paintCoverage(
  target: FloatRgba,
  coverage: Float32Array,
  r: number,
  g: number,
  b: number,
): void {
  const d = target.data;
  for (let i = 0, o = 0; i < coverage.length; i++, o += 4) {
    const c = coverage[i] as number;
    if (c <= 0) continue;
    const k = 1 - c;
    d[o] = r * c + (d[o] as number) * k;
    d[o + 1] = g * c + (d[o + 1] as number) * k;
    d[o + 2] = b * c + (d[o + 2] as number) * k;
    d[o + 3] = c + (d[o + 3] as number) * k;
  }
}

/** Normalised Gaussian weights for offsets -radius..radius, radius = ceil(3 sigma). */
export function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const k = new Float32Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] = (k[i] as number) / sum;
  return k;
}

/**
 * Separable Gaussian blur of premultiplied RGBA (as SVG `feGaussianBlur`
 * with `color-interpolation-filters="sRGB"`); pixels outside the buffer
 * count as transparent. Returns a new buffer.
 */
export function gaussianBlurRgba(src: FloatRgba, sigma: number): FloatRgba {
  if (!(sigma > 0)) return { width: src.width, height: src.height, data: src.data.slice() };
  const { width: w, height: h } = src;
  const kernel = gaussianKernel(sigma);
  const r = (kernel.length - 1) / 2;
  const tmp = new Float32Array(src.data.length);
  const out = new Float32Array(src.data.length);
  const s = src.data;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let a0 = 0;
      let a1 = 0;
      let a2 = 0;
      let a3 = 0;
      const from = Math.max(-r, -x);
      const to = Math.min(r, w - 1 - x);
      for (let j = from; j <= to; j++) {
        const wgt = kernel[j + r] as number;
        const i = (row + x + j) * 4;
        a0 += (s[i] as number) * wgt;
        a1 += (s[i + 1] as number) * wgt;
        a2 += (s[i + 2] as number) * wgt;
        a3 += (s[i + 3] as number) * wgt;
      }
      const o = (row + x) * 4;
      tmp[o] = a0;
      tmp[o + 1] = a1;
      tmp[o + 2] = a2;
      tmp[o + 3] = a3;
    }
  }
  for (let y = 0; y < h; y++) {
    const from = Math.max(-r, -y);
    const to = Math.min(r, h - 1 - y);
    for (let x = 0; x < w; x++) {
      let a0 = 0;
      let a1 = 0;
      let a2 = 0;
      let a3 = 0;
      for (let j = from; j <= to; j++) {
        const wgt = kernel[j + r] as number;
        const i = ((y + j) * w + x) * 4;
        a0 += (tmp[i] as number) * wgt;
        a1 += (tmp[i + 1] as number) * wgt;
        a2 += (tmp[i + 2] as number) * wgt;
        a3 += (tmp[i + 3] as number) * wgt;
      }
      const o = (y * w + x) * 4;
      out[o] = a0;
      out[o + 1] = a1;
      out[o + 2] = a2;
      out[o + 3] = a3;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Crops `src` to the `width` x `height` window at (`x`, `y`) and converts it to
 * 8-bit straight (non-premultiplied) RGBA, as PNG stores it.
 */
export function toRgba8(
  src: FloatRgba,
  x: number,
  y: number,
  width: number,
  height: number,
): RgbaBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  const byte = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);
  for (let j = 0; j < height; j++) {
    const sy = y + j;
    for (let i = 0; i < width; i++) {
      const sx = x + i;
      const o = (j * width + i) * 4;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const k = (sy * src.width + sx) * 4;
      const a = src.data[k + 3] as number;
      if (a <= 0) continue;
      data[o] = byte((src.data[k] as number) / a);
      data[o + 1] = byte((src.data[k + 1] as number) / a);
      data[o + 2] = byte((src.data[k + 2] as number) / a);
      data[o + 3] = byte(a);
    }
  }
  return { width, height, data };
}
