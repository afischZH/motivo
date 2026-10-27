/**
 * Dominant colours of an image (docs/TOOLS.md F4): weighted k-means++ in
 * OKLab on an RGBA pixel buffer. Pure and deterministic: all randomness
 * comes from the injected `Rng`, so the same pixels, count and seed always
 * give the same palette (worker, tests and server agree).
 *
 * To stay fast on any input, pixels are first binned to 5 bits per channel
 * (at most 32 768 weighted points, usually a few thousand), then clustered.
 * Binning moves a colour by at most half a bin, far below what k-means
 * resolves anyway.
 */
import { hexToRgb, oklabToOklch, oklchToHex, rgbToOklab } from "../color";
import type { Rng } from "../rng";

/** Structural subset of `ImageData`; RGBA, 4 bytes per pixel, row-major. */
export interface RgbaPixels {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

export interface ExtractedColor {
  /** Lowercase `#rrggbb`. */
  color: string;
  /** Fraction of the counted pixels in this cluster, 0 to 1. */
  share: number;
}

export interface ExtractPaletteOptions {
  /** Number of clusters; fewer colours come back when the image has fewer distinct ones. */
  count: number;
  rng: Rng;
  /** Lloyd iterations at most. Default 24. */
  maxIterations?: number;
  /** Pixels with a lower alpha (0 to 255) are ignored. Default 128. */
  alphaThreshold?: number;
}

/** Bits per channel kept when binning pixels. */
const BIN_BITS = 5;
const BIN_SHIFT = 8 - BIN_BITS;
const BIN_COUNT = 1 << (3 * BIN_BITS);
const DEFAULT_ITERATIONS = 24;
/** Squared OKLab distance below which a centre counts as settled. */
const CONVERGED = 1e-10;

/** Weighted points in OKLab, one per non-empty colour bin, in bin order. */
interface Points {
  l: Float64Array;
  a: Float64Array;
  b: Float64Array;
  w: Float64Array;
  n: number;
  total: number;
}

function binPixels(pixels: RgbaPixels, alphaThreshold: number): Points {
  const { data } = pixels;
  const length = Math.min(data.length, pixels.width * pixels.height * 4);
  const count = new Float64Array(BIN_COUNT);
  const sum = new Float64Array(BIN_COUNT * 3);
  for (let i = 0; i + 3 < length; i += 4) {
    if ((data[i + 3] as number) < alphaThreshold) continue;
    const r = data[i] as number;
    const g = data[i + 1] as number;
    const b = data[i + 2] as number;
    const key =
      ((r >> BIN_SHIFT) << (2 * BIN_BITS)) | ((g >> BIN_SHIFT) << BIN_BITS) | (b >> BIN_SHIFT);
    count[key] = (count[key] as number) + 1;
    sum[key * 3] = (sum[key * 3] as number) + r;
    sum[key * 3 + 1] = (sum[key * 3 + 1] as number) + g;
    sum[key * 3 + 2] = (sum[key * 3 + 2] as number) + b;
  }
  let n = 0;
  for (let k = 0; k < BIN_COUNT; k++) if ((count[k] as number) > 0) n++;
  const points: Points = {
    l: new Float64Array(n),
    a: new Float64Array(n),
    b: new Float64Array(n),
    w: new Float64Array(n),
    n,
    total: 0,
  };
  let j = 0;
  for (let k = 0; k < BIN_COUNT; k++) {
    const c = count[k] as number;
    if (c === 0) continue;
    const lab = rgbToOklab({
      r: (sum[k * 3] as number) / c / 255,
      g: (sum[k * 3 + 1] as number) / c / 255,
      b: (sum[k * 3 + 2] as number) / c / 255,
    });
    points.l[j] = lab.l;
    points.a[j] = lab.a;
    points.b[j] = lab.b;
    points.w[j] = c;
    points.total += c;
    j++;
  }
  return points;
}

const dist2 = (p: Points, i: number, c: Float64Array, k: number): number => {
  const dl = (p.l[i] as number) - (c[k * 3] as number);
  const da = (p.a[i] as number) - (c[k * 3 + 1] as number);
  const db = (p.b[i] as number) - (c[k * 3 + 2] as number);
  return dl * dl + da * da + db * db;
};

function setCentre(centres: Float64Array, k: number, p: Points, i: number): void {
  centres[k * 3] = p.l[i] as number;
  centres[k * 3 + 1] = p.a[i] as number;
  centres[k * 3 + 2] = p.b[i] as number;
}

/** Index of the point where the running sum of `weights` passes `target`. */
function pickWeighted(weights: Float64Array, n: number, target: number): number {
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += weights[i] as number;
    if (acc > target) return i;
  }
  // Rounding left `target` at the very end: take the last point with weight.
  for (let i = n - 1; i >= 0; i--) if ((weights[i] as number) > 0) return i;
  return 0;
}

/** k-means++ seeding: each new centre is drawn with probability ∝ weight × D². */
function seedCentres(p: Points, k: number, rng: Rng): Float64Array {
  const centres = new Float64Array(k * 3);
  setCentre(centres, 0, p, pickWeighted(p.w, p.n, rng.next() * p.total));
  const d2 = new Float64Array(p.n).fill(Infinity);
  const score = new Float64Array(p.n);
  for (let c = 1; c < k; c++) {
    let sum = 0;
    for (let i = 0; i < p.n; i++) {
      const d = Math.min(d2[i] as number, dist2(p, i, centres, c - 1));
      d2[i] = d;
      const s = d * (p.w[i] as number);
      score[i] = s;
      sum += s;
    }
    // Every point already is a centre: duplicate the first one (dropped later).
    const index = sum > 0 ? pickWeighted(score, p.n, rng.next() * sum) : 0;
    setCentre(centres, c, p, index);
  }
  return centres;
}

interface Clusters {
  centres: Float64Array;
  weights: Float64Array;
}

function lloyd(p: Points, centres: Float64Array, k: number, maxIterations: number): Clusters {
  const assign = new Int32Array(p.n);
  const weights = new Float64Array(k);
  const sums = new Float64Array(k * 3);
  for (let iter = 0; iter < maxIterations; iter++) {
    weights.fill(0);
    sums.fill(0);
    for (let i = 0; i < p.n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(p, i, centres, c);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[i] = best;
      const w = p.w[i] as number;
      weights[best] = (weights[best] as number) + w;
      sums[best * 3] = (sums[best * 3] as number) + w * (p.l[i] as number);
      sums[best * 3 + 1] = (sums[best * 3 + 1] as number) + w * (p.a[i] as number);
      sums[best * 3 + 2] = (sums[best * 3 + 2] as number) + w * (p.b[i] as number);
    }
    let moved = 0;
    for (let c = 0; c < k; c++) {
      const w = weights[c] as number;
      if (w === 0) {
        // Empty cluster: restart it on the point that is worst served now.
        let worst = 0;
        let worstScore = -1;
        for (let i = 0; i < p.n; i++) {
          const s = dist2(p, i, centres, assign[i] as number) * (p.w[i] as number);
          if (s > worstScore) {
            worstScore = s;
            worst = i;
          }
        }
        if (worstScore > 0) {
          setCentre(centres, c, p, worst);
          moved = Infinity;
        }
        continue;
      }
      const l = (sums[c * 3] as number) / w;
      const a = (sums[c * 3 + 1] as number) / w;
      const b = (sums[c * 3 + 2] as number) / w;
      const dl = l - (centres[c * 3] as number);
      const da = a - (centres[c * 3 + 1] as number);
      const db = b - (centres[c * 3 + 2] as number);
      moved = Math.max(moved, dl * dl + da * da + db * db);
      centres[c * 3] = l;
      centres[c * 3 + 1] = a;
      centres[c * 3 + 2] = b;
    }
    if (moved < CONVERGED) break;
  }
  // Final weights for the final centres.
  weights.fill(0);
  for (let i = 0; i < p.n; i++) {
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < k; c++) {
      const d = dist2(p, i, centres, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    weights[best] = (weights[best] as number) + (p.w[i] as number);
  }
  return { centres, weights };
}

/**
 * The `count` dominant colours of `pixels`, largest share first. Returns an
 * empty list when no pixel is opaque enough, and fewer colours when the
 * image has fewer distinct ones. Colours that round to the same hex value
 * are merged. Shares sum to 1.
 */
export function extractPalette(
  pixels: RgbaPixels,
  options: ExtractPaletteOptions,
): ExtractedColor[] {
  const points = binPixels(pixels, options.alphaThreshold ?? 128);
  const k = Math.min(Math.max(1, Math.floor(options.count)), points.n);
  if (k === 0 || points.total === 0) return [];
  const centres = seedCentres(points, k, options.rng);
  const { weights } = lloyd(points, centres, k, options.maxIterations ?? DEFAULT_ITERATIONS);

  const byHex = new Map<string, { weight: number; l: number }>();
  for (let c = 0; c < k; c++) {
    const w = weights[c] as number;
    if (w === 0) continue;
    const l = centres[c * 3] as number;
    const color = oklchToHex(
      oklabToOklch({ l, a: centres[c * 3 + 1] as number, b: centres[c * 3 + 2] as number }),
    );
    const prev = byHex.get(color);
    byHex.set(color, { weight: (prev?.weight ?? 0) + w, l });
  }
  return [...byHex.entries()]
    .sort(([ha, a], [hb, b]) => b.weight - a.weight || a.l - b.l || (ha < hb ? -1 : 1))
    .map(([color, { weight }]) => ({ color, share: weight / points.total }));
}

/** Orders for presenting extracted colours. */
export const EXTRACT_SORTS = ["share", "lightness", "hue"] as const;
export type ExtractSort = (typeof EXTRACT_SORTS)[number];

/** Chroma below which a colour counts as grey for hue sorting. */
const GREY_CHROMA = 0.02;

/**
 * Sorts extracted colours for display: by share (largest first), by OKLCH
 * lightness (light to dark) or by hue (greys last, light to dark). Stable
 * and pure; does not mutate the input.
 */
export function sortExtracted<T extends ExtractedColor>(
  colors: readonly T[],
  sort: ExtractSort,
): T[] {
  const keyed = colors.map((c, index) => {
    const lch = oklabToOklch(rgbToOklab(hexToRgb(c.color)));
    return { c, index, lch, grey: !(lch.c >= GREY_CHROMA) || Number.isNaN(lch.h) };
  });
  keyed.sort((x, y) => {
    if (sort === "share") return y.c.share - x.c.share || x.index - y.index;
    if (sort === "lightness") return y.lch.l - x.lch.l || x.index - y.index;
    if (x.grey !== y.grey) return x.grey ? 1 : -1;
    if (x.grey) return y.lch.l - x.lch.l || x.index - y.index;
    return x.lch.h - y.lch.h || x.index - y.index;
  });
  return keyed.map((k) => k.c);
}

/** Share as a whole percentage for labels, e.g. 0.237 -> "24%"; tiny shares show "<1%". */
export function formatShare(share: number): string {
  const percent = Math.round(share * 100);
  return percent < 1 ? "<1%" : `${percent}%`;
}
