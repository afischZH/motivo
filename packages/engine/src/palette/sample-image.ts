/**
 * A built-in sample picture for "Palette from image" (docs/TOOLS.md F4): a
 * small sunset landscape drawn procedurally, so the tool has something to
 * show before the user picks an image and no binary asset (or licence) is
 * needed. Uses only arithmetic and `Math.sqrt` (exactly rounded in every
 * JavaScript engine), so every browser and Node produce identical pixels.
 */
import type { RgbaPixels } from "./extract";

export const SAMPLE_IMAGE_WIDTH = 160;
export const SAMPLE_IMAGE_HEIGHT = 120;

type Rgb3 = readonly [number, number, number];

const SKY: readonly (readonly [number, Rgb3])[] = [
  [0, [29, 43, 83]],
  [0.5, [126, 90, 162]],
  [0.8, [232, 128, 128]],
  [1, [255, 186, 138]],
];
const SUN: Rgb3 = [255, 226, 140];
const GLOW: Rgb3 = [255, 206, 120];
const RIDGE: Rgb3 = [92, 74, 136];
const HILLS: Rgb3 = [64, 118, 86];
const HILLS_DARK: Rgb3 = [30, 66, 54];
const LAKE_TOP: Rgb3 = [44, 92, 122];
const LAKE_BOTTOM: Rgb3 = [18, 44, 68];
const REFLECTION: Rgb3 = [242, 178, 122];

const SUN_X = 0.68;
const SUN_Y = 0.44;
const SUN_R = 0.07;
const GLOW_R = 0.17;
const LAKE_Y = 0.78;

const mix = (a: Rgb3, b: Rgb3, t: number): Rgb3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Triangle wave in [0, 1] with period 1. */
const tri = (u: number): number => Math.abs(2 * (u - Math.floor(u)) - 1);

function sky(y: number): Rgb3 {
  for (let i = 1; i < SKY.length; i++) {
    const [stop, color] = SKY[i] as readonly [number, Rgb3];
    const [prevStop, prevColor] = SKY[i - 1] as readonly [number, Rgb3];
    if (y <= stop) return mix(prevColor, color, (y - prevStop) / (stop - prevStop));
  }
  return (SKY[SKY.length - 1] as readonly [number, Rgb3])[1];
}

function pixel(x: number, y: number): Rgb3 {
  if (y >= LAKE_Y) {
    const depth = (y - LAKE_Y) / (1 - LAKE_Y);
    const water = mix(LAKE_TOP, LAKE_BOTTOM, depth);
    // Broken sun reflection: alternating bands that narrow towards the shore.
    const band = Math.floor(depth * 24) % 2 === 0;
    const halfWidth = 0.06 * (1 - depth * 0.6);
    if (band && Math.abs(x - SUN_X) < halfWidth) return mix(water, REFLECTION, 0.85);
    return water;
  }
  const hills = 0.56 + 0.08 * tri(x * 1.3 + 0.35) + 0.025 * tri(x * 5.7 + 0.1);
  if (y >= hills) return mix(HILLS, HILLS_DARK, (y - hills) / (LAKE_Y - hills + 1e-9));
  const ridge = 0.42 + 0.1 * tri(x * 2.2 + 0.15) + 0.03 * tri(x * 8.3);
  if (y >= ridge) return mix(RIDGE, sky(0.9), ((y - ridge) / (hills - ridge + 1e-9)) * 0.35);
  const dx = x - SUN_X;
  const dy = (y - SUN_Y) * (SAMPLE_IMAGE_HEIGHT / SAMPLE_IMAGE_WIDTH);
  const d = Math.sqrt(dx * dx + dy * dy);
  const base = sky(y / ridge);
  if (d <= SUN_R) return SUN;
  if (d <= GLOW_R) {
    const t = 1 - (d - SUN_R) / (GLOW_R - SUN_R);
    return mix(base, GLOW, t * t * 0.8);
  }
  return base;
}

/** Small deterministic grain (integer hash), so the picture clusters like a photo. */
function grain(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h & 15) - 7.5) * 0.8;
}

const toByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** RGBA pixels of the sample picture, fully opaque. */
export function sampleImagePixels(): RgbaPixels & { data: Uint8ClampedArray } {
  const width = SAMPLE_IMAGE_WIDTH;
  const height = SAMPLE_IMAGE_HEIGHT;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let iy = 0; iy < height; iy++) {
    for (let ix = 0; ix < width; ix++) {
      const [r, g, b] = pixel((ix + 0.5) / width, (iy + 0.5) / height);
      const n = grain(ix, iy);
      const o = (iy * width + ix) * 4;
      data[o] = toByte(r + n);
      data[o + 1] = toByte(g + n);
      data[o + 2] = toByte(b + n);
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}
