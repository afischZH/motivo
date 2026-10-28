/**
 * Dithering (docs/TOOLS.md E4): ordered thresholds (Bayer matrices, also
 * used by the braille output of ASCII art) and error diffusion (Floyd and
 * Steinberg, Atkinson, Stucki) to a fixed palette. Pure and deterministic.
 */
import { hexToRgb255 } from "@musterli/engine";
import { createPixelBuffer, type PixelBuffer } from "./buffer";
import { normalizeWeights, type LumaWeights } from "./luminance";
import { toneCurve, type ToneOptions } from "./tone";

/** Bayer matrix of size `n` (2, 4 or 8) as thresholds in (0, 1), row-major. */
export function bayerMatrix(n: 2 | 4 | 8): Float32Array {
  let m: number[] = [0];
  let size = 1;
  while (size < n) {
    const s2 = size * 2;
    const next = new Array<number>(s2 * s2).fill(0);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = (m[y * size + x] ?? 0) * 4;
        next[y * s2 + x] = v;
        next[y * s2 + x + size] = v + 2;
        next[(y + size) * s2 + x] = v + 3;
        next[(y + size) * s2 + x + size] = v + 1;
      }
    }
    m = next;
    size = s2;
  }
  const out = new Float32Array(n * n);
  for (let i = 0; i < out.length; i++) out[i] = ((m[i] ?? 0) + 0.5) / (n * n);
  return out;
}

/** Dithering algorithms of the dither effect. */
export const DITHER_ALGORITHMS = [
  "floyd-steinberg",
  "atkinson",
  "stucki",
  "bayer2",
  "bayer4",
  "bayer8",
] as const;
export type DitherAlgorithm = (typeof DITHER_ALGORITHMS)[number];

type DiffusionAlgorithm = "floyd-steinberg" | "atkinson" | "stucki";

/** Error-diffusion kernel: `[dx, dy, weight]` taps and the divisor (Atkinson passes on only 6/8). */
export interface DiffusionKernel {
  readonly taps: readonly (readonly [number, number, number])[];
  readonly divisor: number;
}

/** The classic kernels (Floyd and Steinberg 1976, Atkinson, Stucki 1981). */
export const DIFFUSION_KERNELS: Readonly<Record<DiffusionAlgorithm, DiffusionKernel>> = {
  "floyd-steinberg": {
    taps: [
      [1, 0, 7],
      [-1, 1, 3],
      [0, 1, 5],
      [1, 1, 1],
    ],
    divisor: 16,
  },
  atkinson: {
    taps: [
      [1, 0, 1],
      [2, 0, 1],
      [-1, 1, 1],
      [0, 1, 1],
      [1, 1, 1],
      [0, 2, 1],
    ],
    divisor: 8,
  },
  stucki: {
    taps: [
      [1, 0, 8],
      [2, 0, 4],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 8],
      [1, 1, 4],
      [2, 1, 2],
      [-2, 2, 1],
      [-1, 2, 2],
      [0, 2, 4],
      [1, 2, 2],
      [2, 2, 1],
    ],
    divisor: 42,
  },
};

/** How colours are matched: by brightness along the palette, or by RGB distance. */
export const DITHER_COLOR_MODES = ["tone", "color"] as const;
export type DitherColorMode = (typeof DITHER_COLOR_MODES)[number];

export interface DitherOptions extends ToneOptions {
  readonly algorithm: DitherAlgorithm;
  /** Output colours (hex), at least one. */
  readonly palette: readonly string[];
  /**
   * `tone`: the picture's luminance spread over the palette sorted by
   * luminance (1-bit, greys, four greens); `color`: nearest palette colour
   * per pixel with the error per RGB channel (CGA-like, brand colours).
   */
  readonly mode: DitherColorMode;
  readonly weights: LumaWeights;
  /** Error diffusion runs left to right, then right to left (fewer worm artefacts). */
  readonly serpentine: boolean;
}

/** Weights of the RGB distance in `color` mode (a cheap perceptual approximation). */
export const DITHER_DISTANCE_WEIGHTS = [2, 4, 3] as const;

/** Error carried per channel in `color` mode, so a colour the palette lacks cannot pile up. */
export const DITHER_ERROR_CLAMP = 96;

type Rgb = readonly [number, number, number];

const bayerOf = (a: DitherAlgorithm): { n: number; m: Float32Array } | null =>
  a === "bayer2"
    ? { n: 2, m: bayerMatrix(2) }
    : a === "bayer4"
      ? { n: 4, m: bayerMatrix(4) }
      : a === "bayer8"
        ? { n: 8, m: bayerMatrix(8) }
        : null;

/**
 * Dithers `input` to the palette, pixel for pixel (the caller chooses the
 * grid: one input pixel per output dot). Deterministic: the same input
 * gives the same pixels in every engine (IEEE arithmetic, fixed scan
 * order). Alpha is kept.
 */
export function applyDither(input: PixelBuffer, o: DitherOptions): PixelBuffer {
  const colors = o.palette.map((hex) => hexToRgb255(hex));
  if (colors.length === 0) throw new RangeError("applyDither: the palette is empty");
  return o.mode === "tone" ? ditherTone(input, o, colors) : ditherColor(input, o, colors);
}

/**
 * Error buffer of a diffusion pass: three rolling rows (the current one and
 * two below, the kernels reach no further), each with 2 cells of padding
 * per side, so taps never need a bounds check (padding is never read).
 * `taps` holds the kernel as offsets into the buffer per row parity.
 */
class ErrorRows {
  readonly buf: Float32Array;
  private readonly stride: number;
  private readonly dx: Int32Array;
  private readonly dy: Int32Array;
  readonly weights: Float64Array;
  readonly count: number;
  /** Buffer offsets of the taps for the current row, scanning right / left. */
  readonly right: Int32Array;
  readonly left: Int32Array;
  /** Offset of the current row's cell 0. */
  row = 0;

  constructor(
    width: number,
    private readonly channels: number,
    kernel: DiffusionKernel,
  ) {
    this.stride = (width + 4) * channels;
    this.buf = new Float32Array(this.stride * 3);
    this.count = kernel.taps.length;
    this.dx = Int32Array.from(kernel.taps, (t) => t[0]);
    this.dy = Int32Array.from(kernel.taps, (t) => t[1]);
    this.weights = Float64Array.from(kernel.taps, (t) => t[2]);
    this.right = new Int32Array(this.count);
    this.left = new Int32Array(this.count);
  }

  /** Prepares row `y` (clears the row two below, which is reused). */
  start(y: number): void {
    const c = this.channels;
    this.row = (y % 3) * this.stride + 2 * c;
    this.buf.fill(0, ((y + 2) % 3) * this.stride, ((y + 2) % 3) * this.stride + this.stride);
    for (let k = 0; k < this.count; k++) {
      const base = ((y + (this.dy[k] ?? 0)) % 3) * this.stride + 2 * c - this.row;
      this.right[k] = base + (this.dx[k] ?? 0) * c;
      this.left[k] = base - (this.dx[k] ?? 0) * c;
    }
  }
}

function ditherTone(input: PixelBuffer, o: DitherOptions, colors: readonly Rgb[]): PixelBuffer {
  const { width, height, data } = input;
  const out = createPixelBuffer(width, height);
  const d = out.data;
  const w = normalizeWeights(o.weights);
  const tone = toneCurve(o);
  // Palette sorted by luminance; the picture's 0..1 maps onto the palette's range.
  const order = colors
    .map((c, i) => ({ c, i, l: (c[0] * w.r + c[1] * w.g + c[2] * w.b) / 255 }))
    .sort((a, b) => a.l - b.l || a.i - b.i);
  const levels = Float32Array.from(order.map((e) => e.l));
  const n = levels.length;
  const lMin = levels[0] ?? 0;
  const span = (levels[n - 1] ?? 0) - lMin;
  const nearest = (v: number): number => {
    let k = 0;
    while (k + 1 < n && Math.abs((levels[k + 1] ?? 0) - v) < Math.abs((levels[k] ?? 0) - v)) k++;
    return k;
  };
  const put = (p: number, k: number) => {
    const c = order[k]?.c ?? [0, 0, 0];
    d[p] = c[0];
    d[p + 1] = c[1];
    d[p + 2] = c[2];
    d[p + 3] = data[p + 3] ?? 255;
  };
  const target = (p: number): number => {
    const l = Math.round(
      (data[p] ?? 0) * w.r + (data[p + 1] ?? 0) * w.g + (data[p + 2] ?? 0) * w.b,
    );
    return lMin + (tone[l > 255 ? 255 : l] ?? 0) * span;
  };
  if (n < 2 || span <= 0) {
    for (let p = 0; p < d.length; p += 4) put(p, 0);
    return out;
  }
  const bayer = bayerOf(o.algorithm);
  if (bayer) {
    for (let y = 0, p = 0; y < height; y++) {
      for (let x = 0; x < width; x++, p += 4) {
        const v = target(p);
        // Between the two levels around v: the threshold decides which one.
        let k = 0;
        while (k + 2 < n && v > (levels[k + 1] ?? 0)) k++;
        const lo = levels[k] ?? 0;
        const hi = levels[k + 1] ?? 1;
        const f = hi > lo ? (v - lo) / (hi - lo) : 0;
        const t = bayer.m[(y % bayer.n) * bayer.n + (x % bayer.n)] ?? 0.5;
        put(p, f > t ? k + 1 : k);
      }
    }
    return out;
  }
  const kernel = DIFFUSION_KERNELS[o.algorithm as DiffusionAlgorithm];
  const err = new ErrorRows(width, 1, kernel);
  const buf = err.buf;
  const weights = err.weights;
  const taps = err.count;
  for (let y = 0; y < height; y++) {
    err.start(y);
    const reverse = o.serpentine && y % 2 === 1;
    const offsets = reverse ? err.left : err.right;
    for (let s = 0; s < width; s++) {
      const x = reverse ? width - 1 - s : s;
      const p = (y * width + x) * 4;
      const at = err.row + x;
      const v = target(p) + (buf[at] ?? 0);
      const k = nearest(v);
      put(p, k);
      const e = (v - (levels[k] ?? 0)) / kernel.divisor;
      for (let t = 0; t < taps; t++) {
        const i = at + (offsets[t] ?? 0);
        buf[i] = (buf[i] ?? 0) + e * (weights[t] ?? 0);
      }
    }
  }
  return out;
}

function ditherColor(input: PixelBuffer, o: DitherOptions, colors: readonly Rgb[]): PixelBuffer {
  const { width, height, data } = input;
  const out = createPixelBuffer(width, height);
  const d = out.data;
  const tone = toneCurve(o);
  const n = colors.length;
  const flat = new Float32Array(n * 3);
  colors.forEach((c, i) => flat.set(c, i * 3));
  const [wr, wg, wb] = DITHER_DISTANCE_WEIGHTS;
  const nearest = (r: number, g: number, b: number): number => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      const dr = r - (flat[j] ?? 0);
      const dg = g - (flat[j + 1] ?? 0);
      const db = b - (flat[j + 2] ?? 0);
      const dist = wr * dr * dr + wg * dg * dg + wb * db * db;
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    }
    return best;
  };
  const put = (p: number, k: number) => {
    d[p] = flat[k * 3] ?? 0;
    d[p + 1] = flat[k * 3 + 1] ?? 0;
    d[p + 2] = flat[k * 3 + 2] ?? 0;
    d[p + 3] = data[p + 3] ?? 255;
  };
  const toned = new Float32Array(256);
  for (let i = 0; i < 256; i++) toned[i] = (tone[i] ?? 0) * 255;
  const bayer = bayerOf(o.algorithm);
  if (bayer) {
    // Ordered dithering in colour: a threshold offset per pixel, then the nearest colour.
    const spread = 255 / Math.cbrt(n);
    for (let y = 0, p = 0; y < height; y++) {
      for (let x = 0; x < width; x++, p += 4) {
        const t = ((bayer.m[(y % bayer.n) * bayer.n + (x % bayer.n)] ?? 0.5) - 0.5) * spread;
        put(
          p,
          nearest(
            (toned[data[p] ?? 0] ?? 0) + t,
            (toned[data[p + 1] ?? 0] ?? 0) + t,
            (toned[data[p + 2] ?? 0] ?? 0) + t,
          ),
        );
      }
    }
    return out;
  }
  const kernel = DIFFUSION_KERNELS[o.algorithm as DiffusionAlgorithm];
  const err = new ErrorRows(width, 3, kernel);
  const buf = err.buf;
  const weights = err.weights;
  const taps = err.count;
  const clamp = (v: number) =>
    v < -DITHER_ERROR_CLAMP ? -DITHER_ERROR_CLAMP : v > DITHER_ERROR_CLAMP ? DITHER_ERROR_CLAMP : v;
  for (let y = 0; y < height; y++) {
    err.start(y);
    const reverse = o.serpentine && y % 2 === 1;
    const offsets = reverse ? err.left : err.right;
    for (let s = 0; s < width; s++) {
      const x = reverse ? width - 1 - s : s;
      const p = (y * width + x) * 4;
      const at = err.row + x * 3;
      const r = (toned[data[p] ?? 0] ?? 0) + clamp(buf[at] ?? 0);
      const g = (toned[data[p + 1] ?? 0] ?? 0) + clamp(buf[at + 1] ?? 0);
      const b = (toned[data[p + 2] ?? 0] ?? 0) + clamp(buf[at + 2] ?? 0);
      const k = nearest(r, g, b);
      put(p, k);
      const er = (r - (flat[k * 3] ?? 0)) / kernel.divisor;
      const eg = (g - (flat[k * 3 + 1] ?? 0)) / kernel.divisor;
      const eb = (b - (flat[k * 3 + 2] ?? 0)) / kernel.divisor;
      for (let t = 0; t < taps; t++) {
        const i = at + (offsets[t] ?? 0);
        const wt = weights[t] ?? 0;
        buf[i] = (buf[i] ?? 0) + er * wt;
        buf[i + 1] = (buf[i + 1] ?? 0) + eg * wt;
        buf[i + 2] = (buf[i + 2] ?? 0) + eb * wt;
      }
    }
  }
  return out;
}
