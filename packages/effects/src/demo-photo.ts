/**
 * The built-in demo picture of the photo effects: a procedural mountain
 * lake at sunset (sky gradient with thin clouds, sun with glow, three
 * ridges in aerial perspective, a lake with a rippled reflection, fine
 * texture). Generated from code, no stock photo, so it carries no licence
 * and renders at any size. It has a full tonal range (deep shadows to the
 * sun) for duotone and ASCII previews.
 *
 * Coordinates are in units of the picture height, centred horizontally, so
 * other aspect ratios widen or narrow the view instead of distorting it.
 * The scene is evaluated on at most `DEMO_DETAIL_EDGE` pixels and scaled up
 * bilinearly (a soft, photo-like picture); only the fine texture is drawn
 * per output pixel. That keeps 12 MP at about the cost of 0.3 MP.
 */
import { createNoise2D, createRng, fbm2D, type Noise2D } from "@musterli/engine";
import { createPixelBuffer, type PixelBuffer } from "./buffer";
import { hashSigned } from "./grain";

/** Size and aspect ratio the demo picture is composed for (3:2, like most cameras). */
export const DEMO_PHOTO_SIZE = { width: 1500, height: 1000 } as const;

/** Longest edge on which the scene itself is evaluated. */
export const DEMO_DETAIL_EDGE = 720;

const HORIZON = 0.64;
const SUN = { x: 0.22, y: 0.38, r: 0.055 };

type Rgb3 = [number, number, number];

/** Ridges from far to near: base height, amplitude, frequency, colour at the top and the foot. */
const RIDGES: readonly { base: number; amp: number; freq: number; top: Rgb3; foot: Rgb3 }[] = [
  { base: 0.5, amp: 0.16, freq: 2.4, top: [196, 150, 178], foot: [226, 170, 160] },
  { base: 0.57, amp: 0.15, freq: 3.4, top: [104, 74, 120], foot: [146, 100, 126] },
  { base: 0.635, amp: 0.13, freq: 4.6, top: [26, 20, 40], foot: [46, 34, 58] },
];

let noise: Noise2D | null = null;
const field = (): Noise2D => (noise ??= createNoise2D(createRng(0x5eed)));

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (e0: number, e1: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Top edge of ridge `k` at horizontal position `X` (picture-height units). */
function ridgeTop(k: number, X: number): number {
  const r = RIDGES[k];
  if (!r) return 1;
  const n = fbm2D(field(), X * r.freq + k * 17.3, k * 9.1, { octaves: 5, gain: 0.5 });
  // Peaks: ridged noise (high where the noise crosses zero) over a smooth swell.
  const ridged = 1 - Math.min(1, Math.abs(n) * 3);
  return r.base - r.amp * (0.6 * ridged + 0.8 * n);
}

const SKY_TOP: Rgb3 = [34, 52, 116];
const SKY_MID: Rgb3 = [150, 112, 172];
const SKY_LOW: Rgb3 = [255, 186, 118];

function sky(X: number, Y: number, out: Rgb3): void {
  const t = Math.min(1, Math.max(0, Y / HORIZON));
  // Deep blue overhead, violet, then a warm band at the horizon.
  const k = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = t < 0.5 ? SKY_TOP : SKY_MID;
  const b = t < 0.5 ? SKY_MID : SKY_LOW;
  out[0] = mix(a[0], b[0], k);
  out[1] = mix(a[1], b[1], k);
  out[2] = mix(a[2], b[2], k);
  const d = Math.hypot(X - SUN.x, Y - SUN.y);
  const glow = Math.exp(-d * 7) * 0.8 + Math.exp(-d * 2.2) * 0.2;
  out[0] = mix(out[0], 255, glow);
  out[1] = mix(out[1], 230, glow);
  out[2] = mix(out[2], 176, glow * 0.8);
  const disc = 1 - smooth(SUN.r - 0.004, SUN.r + 0.004, d);
  out[0] = mix(out[0], 255, disc);
  out[1] = mix(out[1], 250, disc);
  out[2] = mix(out[2], 226, disc);
  // Thin cloud streaks.
  const c = fbm2D(field(), X * 2.5 + 40, Y * 11, { octaves: 3 });
  const cloud = smooth(0.12, 0.5, c) * smooth(0.04, 0.25, Y) * (1 - smooth(0.42, 0.56, Y)) * 0.45;
  out[0] = mix(out[0], 255, cloud);
  out[1] = mix(out[1], 204, cloud);
  out[2] = mix(out[2], 188, cloud);
}

/** Colour above the horizon at (X, Y) in column `x` (ridge tops `tops`). */
function scene(X: number, Y: number, tops: readonly Float64Array[], x: number, out: Rgb3): void {
  for (let k = RIDGES.length - 1; k >= 0; k--) {
    const top = tops[k]?.[x] ?? 1;
    if (Y >= top) {
      const r = RIDGES[k];
      if (!r) break;
      const t = smooth(top, HORIZON, Y);
      // Light and shadow on the flanks.
      const shade = 0.9 + 0.3 * field()(X * r.freq * 7, Y * 16 + k * 5);
      out[0] = mix(r.top[0], r.foot[0], t) * shade;
      out[1] = mix(r.top[1], r.foot[1], t) * shade;
      out[2] = mix(r.top[2], r.foot[2], t) * shade;
      return;
    }
  }
  sky(X, Y, out);
}

/** The scene without texture at `width` × `height` (RGB floats, 3 per pixel). */
function sceneRgb(width: number, height: number): Float32Array {
  const w = width;
  const h = height;
  const out = new Float32Array(w * h * 3);
  const tops = RIDGES.map(() => new Float64Array(w));
  const Xs = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    const X = (x + 0.5 - w / 2) / h;
    Xs[x] = X;
    for (let k = 0; k < RIDGES.length; k++) {
      const row = tops[k];
      if (row) row[x] = ridgeTop(k, X);
    }
  }
  const rgb: Rgb3 = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    const Y = (y + 0.5) / h;
    const depth = Math.max(0, (Y - HORIZON) / (1 - HORIZON));
    // Ripples per row: horizontal bands that shift the reflection sideways.
    const ripple = Math.sin(Y * 420 + 3 * field()(Y * 30, 7.7));
    const shift = Math.round(ripple * (1 + depth * 6) * (w / 1500));
    const shade = 0.8 - depth * 0.3;
    for (let x = 0; x < w; x++) {
      const X = Xs[x] ?? 0;
      if (Y < HORIZON) {
        scene(X, Y, tops, x, rgb);
      } else {
        // Lake: mirrored scene, darker and bluer with depth, glitter under the sun.
        const sx = Math.min(w - 1, Math.max(0, x + shift));
        scene(Xs[sx] ?? X, 2 * HORIZON - Y, tops, sx, rgb);
        const glitter = Math.exp(-Math.abs(X - SUN.x) * 18) * Math.max(0, ripple) * (1 - depth);
        rgb[0] = rgb[0] * shade + 8 * depth + glitter * 120;
        rgb[1] = rgb[1] * shade + 18 * depth + glitter * 96;
        rgb[2] = rgb[2] * shade + 40 * depth + glitter * 60;
      }
      const i = (y * w + x) * 3;
      out[i] = rgb[0];
      out[i + 1] = rgb[1];
      out[i + 2] = rgb[2];
    }
  }
  return out;
}

/**
 * The demo picture at exactly `width` × `height` pixels (opaque RGBA).
 * Pure and deterministic.
 */
export function demoPhoto(width: number, height: number): PixelBuffer {
  const buf = createPixelBuffer(width, height);
  const w = buf.width;
  const h = buf.height;
  const k = Math.min(1, DEMO_DETAIL_EDGE / Math.max(w, h));
  const lw = Math.max(1, Math.round(w * k));
  const lh = Math.max(1, Math.round(h * k));
  const src = sceneRgb(lw, lh);
  const d = buf.data;
  const fx = lw / w;
  const fy = lh / h;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(lh - 1, Math.max(0, (y + 0.5) * fy - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(lh - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(lw - 1, Math.max(0, (x + 0.5) * fx - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(lw - 1, x0 + 1);
      const tx = sx - x0;
      const a = (y0 * lw + x0) * 3;
      const b = (y0 * lw + x1) * 3;
      const c = (y1 * lw + x0) * 3;
      const e = (y1 * lw + x1) * 3;
      const grain = hashSigned(x, y, 0x9e37) * 3;
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = (src[a + ch] ?? 0) + ((src[b + ch] ?? 0) - (src[a + ch] ?? 0)) * tx;
        const bottom = (src[c + ch] ?? 0) + ((src[e + ch] ?? 0) - (src[c + ch] ?? 0)) * tx;
        d[i + ch] = top + (bottom - top) * ty + grain;
      }
      d[i + 3] = 255;
    }
  }
  return buf;
}
