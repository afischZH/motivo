/**
 * God rays (docs/TOOLS.md E5): light shafts from a point light, the
 * classic post-process for volumetric light scattering. The bright parts
 * of the picture (above a threshold) form a mask; each pixel marches from
 * itself toward the light, averaging the mask with a decaying weight, and
 * the result is added (or screened) onto the picture in the ray colour.
 * Pure and deterministic.
 *
 * Rays are smooth, so they are computed on a grid of at most
 * `GOD_RAYS_GRID_EDGE` px (the output itself when smaller) and enlarged
 * bilinearly: a 12 MP export costs about as much as the preview, and the
 * same output size always gives the same pixels.
 */
import { hexToRgb255 } from "@musterli/engine";
import { createPixelBuffer, type PixelBuffer } from "./buffer";
import { hash2 } from "./grain";
import { normalizeWeights, type LumaWeights } from "./luminance";

export const GOD_RAYS_BLENDS = ["add", "screen"] as const;
export type GodRaysBlend = (typeof GOD_RAYS_BLENDS)[number];

/** Most samples per ray (the schema caps the param here, cost is pixels × samples). */
export const GOD_RAYS_SAMPLES_MAX = 128;
/** Longest edge of the ray grid. */
export const GOD_RAYS_GRID_EDGE = 640;
/** Weight at the far end of a ray at `decay = 1` is `exp(-GOD_RAYS_DECAY_RANGE)`. */
export const GOD_RAYS_DECAY_RANGE = 6;

export interface GodRaysOptions {
  /** Light position as a fraction of the picture (0 to 1, may lie outside). */
  readonly x: number;
  readonly y: number;
  /** 0 to 2: strength of the rays. */
  readonly intensity: number;
  /** 0 to 1: how fast a ray fades on its way from the light (0 = no fading). */
  readonly decay: number;
  /** 0 to 1: share of the way to the light each pixel samples (ray length). */
  readonly length: number;
  /** Samples per ray, 4 to `GOD_RAYS_SAMPLES_MAX`. */
  readonly samples: number;
  /** 0 to 1: brightness from which a pixel shines. */
  readonly threshold: number;
  /** Ray colour (hex). */
  readonly color: string;
  readonly blend: GodRaysBlend;
  /** 0 to 1: darkens the picture under the rays. */
  readonly darken: number;
  readonly weights: LumaWeights;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Size of the ray grid for an output of `width` × `height`. */
export function godRaysGridSize(width: number, height: number): { width: number; height: number } {
  const k = Math.min(1, GOD_RAYS_GRID_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
  };
}

/**
 * Light mask on the ray grid: brightness above the threshold (soft knee),
 * times the brightness, averaged per grid cell. Values 0 to 1.
 */
export function godRaysMask(
  input: PixelBuffer,
  gw: number,
  gh: number,
  threshold: number,
  weights: LumaWeights,
): Float32Array {
  const { width, height, data } = input;
  const w = normalizeWeights(weights);
  const t = clamp01(threshold);
  const knee = Math.max(0.02, (1 - t) * 0.5);
  // Mask value per byte luminance (rounded), a lookup instead of a smoothstep per pixel.
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const l = i / 255;
    const s = clamp01((l - t) / knee);
    lut[i] = s * s * (3 - 2 * s) * l;
  }
  const sum = new Float32Array(gw * gh);
  const count = new Float32Array(gw * gh);
  const xs = new Int32Array(width);
  for (let x = 0; x < width; x++) xs[x] = Math.min(gw - 1, Math.floor((x * gw) / width));
  for (let y = 0; y < height; y++) {
    const row = Math.min(gh - 1, Math.floor((y * gh) / height)) * gw;
    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      const l = (data[i] ?? 0) * w.r + (data[i + 1] ?? 0) * w.g + (data[i + 2] ?? 0) * w.b;
      const a = (data[i + 3] ?? 0) / 255;
      const cell = row + (xs[x] ?? 0);
      sum[cell] = (sum[cell] ?? 0) + (lut[Math.round(l)] ?? 0) * a;
      count[cell] = (count[cell] ?? 0) + 1;
    }
  }
  for (let k = 0; k < sum.length; k++) {
    const n = count[k] ?? 0;
    sum[k] = n > 0 ? (sum[k] ?? 0) / n : 0;
  }
  return sum;
}

/**
 * Ray strength 0 to 1 per grid cell: the decaying mean of the mask along
 * the way from the cell toward the light. A hashed offset per cell (fixed,
 * not from a seed) turns banding from few samples into fine noise.
 */
export function godRaysField(
  mask: Float32Array,
  gw: number,
  gh: number,
  o: Pick<GodRaysOptions, "x" | "y" | "decay" | "length" | "samples">,
): Float32Array {
  const out = new Float32Array(gw * gh);
  const n = Math.max(4, Math.min(GOD_RAYS_SAMPLES_MAX, Math.round(o.samples)));
  const lx = o.x * gw;
  const ly = o.y * gh;
  const len = clamp01(o.length);
  const k = clamp01(o.decay) * GOD_RAYS_DECAY_RANGE;
  // Weights depend only on the sample index and the per-cell offset (bucketed).
  const BUCKETS = 16;
  const weights = new Float32Array(BUCKETS * n);
  const norms = new Float32Array(BUCKETS);
  for (let b = 0; b < BUCKETS; b++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const wgt = Math.exp((-k * (i + (b + 0.5) / BUCKETS)) / n);
      weights[b * n + i] = wgt;
      total += wgt;
    }
    norms[b] = 1 / total;
  }
  const maxX = gw - 1;
  const maxY = gh - 1;
  for (let y = 0; y < gh; y++) {
    const py = y + 0.5;
    for (let x = 0; x < gw; x++) {
      const px = x + 0.5;
      const sx = ((lx - px) * len) / n;
      const sy = ((ly - py) * len) / n;
      const b = hash2(x, y, 0x9e3779b9) & (BUCKETS - 1);
      const j = (b + 0.5) / BUCKETS;
      let acc = 0;
      const wb = b * n;
      for (let i = 0; i < n; i++) {
        const s = i + j;
        // Bilinear sample of the mask, edges clamped (inlined: the hot loop).
        let fx = px + sx * s - 0.5;
        let fy = py + sy * s - 0.5;
        if (fx < 0) fx = 0;
        else if (fx > maxX) fx = maxX;
        if (fy < 0) fy = 0;
        else if (fy > maxY) fy = maxY;
        const x0 = fx | 0;
        const y0 = fy | 0;
        const tx = fx - x0;
        const ty = fy - y0;
        const o = y0 * gw + x0;
        const dx = x0 < maxX ? 1 : 0;
        const dy = y0 < maxY ? gw : 0;
        const m00 = mask[o] ?? 0;
        const m10 = mask[o + dx] ?? 0;
        const m01 = mask[o + dy] ?? 0;
        const m11 = mask[o + dy + dx] ?? 0;
        const top = m00 + (m10 - m00) * tx;
        const bottom = m01 + (m11 - m01) * tx;
        acc += (top + (bottom - top) * ty) * (weights[wb + i] ?? 0);
      }
      out[y * gw + x] = acc * (norms[b] ?? 0);
    }
  }
  return out;
}

/** God rays over `input`, at the input's size. Alpha is kept. */
export function applyGodRays(input: PixelBuffer, o: GodRaysOptions): PixelBuffer {
  const { width, height, data } = input;
  const out = createPixelBuffer(width, height);
  const d = out.data;
  const grid = godRaysGridSize(width, height);
  const gw = grid.width;
  const gh = grid.height;
  const mask = godRaysMask(input, gw, gh, o.threshold, o.weights);
  const field = godRaysField(mask, gw, gh, o);
  const [cr, cg, cb] = hexToRgb255(o.color);
  const gain = Math.max(0, o.intensity);
  const keep = 1 - clamp01(o.darken);
  const screen = o.blend === "screen";
  // Grid coordinate of each output column (bilinear, pixel centres aligned).
  const gx0 = new Int32Array(width);
  const gx1 = new Int32Array(width);
  const gtx = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const f = ((x + 0.5) * gw) / width - 0.5;
    const x0 = Math.floor(f);
    gtx[x] = f - x0;
    gx0[x] = Math.max(0, Math.min(gw - 1, x0));
    gx1[x] = Math.max(0, Math.min(gw - 1, x0 + 1));
  }
  for (let y = 0; y < height; y++) {
    const f = ((y + 0.5) * gh) / height - 0.5;
    const y0 = Math.floor(f);
    const ty = f - y0;
    const ra = Math.max(0, Math.min(gh - 1, y0)) * gw;
    const rb = Math.max(0, Math.min(gh - 1, y0 + 1)) * gw;
    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      const a = gx0[x] ?? 0;
      const b = gx1[x] ?? 0;
      const tx = gtx[x] ?? 0;
      const top = (field[ra + a] ?? 0) + ((field[ra + b] ?? 0) - (field[ra + a] ?? 0)) * tx;
      const bot = (field[rb + a] ?? 0) + ((field[rb + b] ?? 0) - (field[rb + a] ?? 0)) * tx;
      const ray = (top + (bot - top) * ty) * gain;
      const r = (data[i] ?? 0) * keep;
      const g = (data[i + 1] ?? 0) * keep;
      const bl = (data[i + 2] ?? 0) * keep;
      if (screen) {
        const s = Math.min(1, ray);
        d[i] = 255 - ((255 - r) * (255 - cr * s)) / 255;
        d[i + 1] = 255 - ((255 - g) * (255 - cg * s)) / 255;
        d[i + 2] = 255 - ((255 - bl) * (255 - cb * s)) / 255;
      } else {
        d[i] = r + cr * ray;
        d[i + 1] = g + cg * ray;
        d[i + 2] = bl + cb * ray;
      }
      d[i + 3] = data[i + 3] ?? 255;
    }
  }
  return out;
}
