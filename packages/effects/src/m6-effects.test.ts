/**
 * M6-AP01: god rays, fractal glass, pixelate/posterize and the filters they
 * share (docs/TOOLS.md E5 to E7).
 */
import { describe, expect, it } from "vitest";
import { createPixelBuffer, pixelDigest, type PixelBuffer } from "./buffer";
import { boxBlur, sampleBilinear1, sampleBilinearRgba } from "./filters";
import {
  FRACTAL_GLASS_PROFILES,
  applyFractalGlass,
  glassLight,
  glassProfile,
  type FractalGlassOptions,
} from "./fractal-glass";
import {
  GOD_RAYS_GRID_EDGE,
  applyGodRays,
  godRaysField,
  godRaysGridSize,
  godRaysMask,
  type GodRaysOptions,
} from "./god-rays";
import { LUMA_WEIGHTS } from "./luminance";
import {
  applyPosterize,
  nearestColor,
  pixelateShapeEstimate,
  pixelateSvg,
  posterizeLut,
  type PosterizeOptions,
} from "./pixelate";

/** A buffer from a per-pixel colour function. */
function buffer(
  width: number,
  height: number,
  color: (x: number, y: number) => readonly number[],
): PixelBuffer {
  const b = createPixelBuffer(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) b.data.set(color(x, y).slice(0, 4), (y * width + x) * 4);
  }
  return b;
}

const gradient = (w: number, h: number): PixelBuffer =>
  buffer(w, h, (x, y) => [
    Math.round((255 * x) / (w - 1)),
    Math.round((255 * y) / (h - 1)),
    128,
    255,
  ]);

const mean = (b: PixelBuffer, channel = 0): number => {
  let s = 0;
  for (let i = channel; i < b.data.length; i += 4) s += b.data[i] ?? 0;
  return s / (b.width * b.height);
};

describe("filters", () => {
  it("samples a grid bilinearly with clamped edges", () => {
    const grid = Float32Array.from([0, 10, 20, 30]); // 2 × 2
    expect(sampleBilinear1(grid, 2, 2, 0.5, 0.5)).toBe(0);
    expect(sampleBilinear1(grid, 2, 2, 1.5, 0.5)).toBe(10);
    expect(sampleBilinear1(grid, 2, 2, 1, 1)).toBe(15);
    expect(sampleBilinear1(grid, 2, 2, -5, -5)).toBe(0);
    expect(sampleBilinear1(grid, 2, 2, 9, 9)).toBe(30);
  });

  it("samples RGBA bilinearly", () => {
    const b = buffer(2, 1, (x) => (x === 0 ? [0, 0, 0, 255] : [200, 100, 50, 255]));
    const out = new Float32Array(4);
    sampleBilinearRgba(b, 1, 0.5, out);
    expect([...out]).toEqual([100, 50, 25, 255]);
    sampleBilinearRgba(b, 7, 3, out);
    expect([...out]).toEqual([200, 100, 50, 255]);
  });

  it("blurs without changing flat areas and spreads a point", () => {
    const flat = buffer(20, 10, () => [90, 120, 150, 255]);
    expect(pixelDigest(boxBlur(flat, 5))).toBe(pixelDigest(flat));
    const dot = buffer(21, 21, (x, y) =>
      x === 10 && y === 10 ? [255, 255, 255, 255] : [0, 0, 0, 255],
    );
    expect(pixelDigest(boxBlur(dot, 0.4))).toBe(pixelDigest(dot));
    const blurred = boxBlur(dot, 4);
    const at = (x: number, y: number) => blurred.data[(y * 21 + x) * 4] ?? 0;
    expect(at(10, 10)).toBeLessThan(255);
    expect(at(12, 10)).toBeGreaterThan(0);
    expect(at(10, 10)).toBeGreaterThanOrEqual(at(12, 10));
    expect(at(0, 0)).toBe(0);
  });
});

const RAYS: GodRaysOptions = {
  x: 0.5,
  y: 0.5,
  intensity: 1,
  decay: 0.5,
  length: 1,
  samples: 32,
  threshold: 0.5,
  color: "#ffffff",
  blend: "add",
  darken: 0,
  weights: LUMA_WEIGHTS.rec709,
};

describe("god rays", () => {
  it("computes rays on a grid of at most GOD_RAYS_GRID_EDGE", () => {
    expect(godRaysGridSize(300, 200)).toEqual({ width: 300, height: 200 });
    const big = godRaysGridSize(4000, 3000);
    expect(big.width).toBe(GOD_RAYS_GRID_EDGE);
    expect(big.height).toBe(480);
  });

  it("masks only areas above the threshold", () => {
    const img = buffer(4, 1, (x) => [x * 80, x * 80, x * 80, 255]); // 0, 80, 160, 240
    const mask = godRaysMask(img, 4, 1, 0.5, LUMA_WEIGHTS.rec709);
    expect(mask[0]).toBe(0);
    expect(mask[1]).toBe(0);
    expect(mask[3] ?? 0).toBeGreaterThan(mask[2] ?? 0);
    expect(mask[3] ?? 0).toBeLessThanOrEqual(1);
    // Averaged per cell when the grid is smaller than the picture.
    const half = godRaysMask(img, 2, 1, 0.5, LUMA_WEIGHTS.rec709);
    expect(half[1]).toBeCloseTo(((mask[2] ?? 0) + (mask[3] ?? 0)) / 2, 6);
  });

  it("gathers light along the way to the source", () => {
    // A bright disc at the light; a dark wall between the light and the left side.
    const w = 64;
    const h = 32;
    const mask = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) mask[y * w + x] = Math.hypot(x - 32, y - 16) < 6 ? 1 : 0;
    }
    const field = godRaysField(mask, w, h, { ...RAYS, samples: 48 });
    const at = (x: number, y: number) => field[y * w + x] ?? 0;
    expect(at(32, 16)).toBeGreaterThan(0.5);
    expect(at(50, 16)).toBeGreaterThan(0.05);
    // Farther away the share of the bright part falls.
    expect(at(60, 16)).toBeLessThan(at(45, 16));
    // Uniform masks give uniform rays (the normalised mean).
    const ones = godRaysField(new Float32Array(w * h).fill(1), w, h, RAYS);
    expect(Math.min(...ones)).toBeCloseTo(1, 5);
  });

  it("leaves the picture alone without strength and darkening", () => {
    const img = gradient(40, 30);
    const out = applyGodRays(img, { ...RAYS, intensity: 0 });
    expect(pixelDigest(out)).toBe(pixelDigest(img));
  });

  it("brightens around a light, keeps alpha and is deterministic", () => {
    const img = buffer(60, 40, (x, y) =>
      Math.hypot(x - 30, y - 20) < 5 ? [255, 255, 255, 200] : [20, 20, 20, 200],
    );
    const add = applyGodRays(img, RAYS);
    const screen = applyGodRays(img, { ...RAYS, blend: "screen" });
    expect(mean(add)).toBeGreaterThan(mean(img));
    expect(mean(screen)).toBeGreaterThan(mean(img));
    expect(add.data[3]).toBe(200);
    expect(pixelDigest(applyGodRays(img, RAYS))).toBe(pixelDigest(add));
    // Tinted rays: red light adds no blue.
    const red = applyGodRays(img, { ...RAYS, color: "#ff0000" });
    expect(mean(red, 2)).toBe(mean(img, 2));
    expect(mean(red, 0)).toBeGreaterThan(mean(img, 0));
    // Darkening scales the picture under the rays.
    const dark = applyGodRays(img, { ...RAYS, intensity: 0, darken: 0.5 });
    expect(dark.data[0]).toBe(10);
  });
});

const GLASS: FractalGlassOptions = {
  stripWidth: 10,
  angle: 0,
  distortion: 0,
  profile: "flat",
  mirror: false,
  jitter: 0,
  blur: 0,
  highlight: 0,
  tint: "#ffffff",
  tintAmount: 0,
  seed: 1,
};

describe("fractal glass", () => {
  it("has profiles that run from -0.5 to 0.5 symmetrically", () => {
    for (const p of FRACTAL_GLASS_PROFILES) {
      expect(glassProfile(p, 0.5)).toBeCloseTo(0.5, 9);
      expect(glassProfile(p, -0.5)).toBeCloseTo(-0.5, 9);
      expect(glassProfile(p, 0.2)).toBeCloseTo(-glassProfile(p, -0.2), 9);
    }
    expect(glassLight(0, 0)).toEqual({ gloss: 0, shade: 0 });
    expect(glassLight(-0.22, 1).gloss).toBeGreaterThan(glassLight(0.3, 1).gloss);
    expect(glassLight(0.45, 1).shade).toBeGreaterThan(glassLight(-0.3, 1).shade);
  });

  it("is (almost) the identity without distortion", () => {
    const img = gradient(60, 40);
    const out = applyFractalGlass(img, GLASS);
    let worst = 0;
    for (let i = 0; i < img.data.length; i++) {
      worst = Math.max(worst, Math.abs((img.data[i] ?? 0) - (out.data[i] ?? 0)));
    }
    expect(worst).toBeLessThanOrEqual(3);
  });

  it("mirrors the slice inside each strip", () => {
    const img = gradient(60, 10);
    const out = applyFractalGlass(img, { ...GLASS, mirror: true });
    // Strips start at the centre (x = 30): inside the strip 30..40 the red channel falls.
    const red = (x: number) => out.data[(5 * 60 + x) * 4] ?? 0;
    expect(red(31)).toBeGreaterThan(red(38));
    expect(red(31) - red(38)).toBeGreaterThan(20);
  });

  it("magnifies a wider slice with distortion and shifts strips with jitter", () => {
    const img = gradient(80, 10);
    const zoomed = applyFractalGlass(img, { ...GLASS, distortion: 1 });
    const red = (b: PixelBuffer, x: number) => b.data[(5 * 80 + x) * 4] ?? 0;
    // A strip (40..50) now spans three strip widths of the picture.
    expect(red(zoomed, 49) - red(zoomed, 40)).toBeGreaterThan((red(img, 49) - red(img, 40)) * 2);
    const a = applyFractalGlass(img, { ...GLASS, jitter: 1, seed: 1 });
    const b = applyFractalGlass(img, { ...GLASS, jitter: 1, seed: 2 });
    expect(pixelDigest(a)).not.toBe(pixelDigest(b));
    expect(pixelDigest(applyFractalGlass(img, { ...GLASS, jitter: 1, seed: 1 }))).toBe(
      pixelDigest(a),
    );
  });

  it("looks the same at twice the size (lengths scale with the picture)", () => {
    const small = gradient(80, 40);
    const large = gradient(160, 80);
    const o = { ...GLASS, angle: 30, distortion: 0.5, profile: "rounded" as const, highlight: 0.4 };
    const a = applyFractalGlass(small, { ...o, stripWidth: 12, blur: 2 });
    const b = applyFractalGlass(large, { ...o, stripWidth: 24, blur: 4 });
    for (const c of [0, 1, 2]) expect(Math.abs(mean(a, c) - mean(b, c))).toBeLessThan(3);
  });

  it("tints and blurs", () => {
    const white = buffer(20, 20, () => [255, 255, 255, 255]);
    const red = applyFractalGlass(white, { ...GLASS, tint: "#ff0000", tintAmount: 1 });
    expect([...red.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    const half = applyFractalGlass(white, { ...GLASS, tint: "#000000", tintAmount: 0.5 });
    expect(half.data[0]).toBe(128);
    const img = buffer(40, 10, (x) => (x < 20 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const blurred = applyFractalGlass(img, { ...GLASS, blur: 4 });
    expect(blurred.data[(5 * 40 + 19) * 4] ?? 0).toBeGreaterThan(0);
  });
});

const POSTER: PosterizeOptions = {
  mode: "levels",
  levels: 4,
  palette: ["#000000", "#ffffff"],
  brightness: 0,
  contrast: 0,
  gamma: 1,
};

describe("pixelate and posterize", () => {
  it("quantizes to evenly spaced levels", () => {
    expect(new Set(posterizeLut(2))).toEqual(new Set([0, 255]));
    expect(new Set(posterizeLut(4))).toEqual(new Set([0, 85, 170, 255]));
    const lut = posterizeLut(4);
    expect([lut[0], lut[42], lut[43], lut[128], lut[255]]).toEqual([0, 0, 85, 170, 255]);
  });

  it("keeps the original colours, levels or palette colours", () => {
    const img = gradient(32, 16);
    expect(pixelDigest(applyPosterize(img, { ...POSTER, mode: "original" }))).toBe(
      pixelDigest(img),
    );
    const levels = applyPosterize(img, POSTER);
    for (let i = 0; i < levels.data.length; i += 4) {
      for (let c = 0; c < 3; c++) expect([0, 85, 170, 255]).toContain(levels.data[i + c]);
      expect(levels.data[i + 3]).toBe(255);
    }
    const pal = applyPosterize(img, {
      ...POSTER,
      mode: "palette",
      palette: ["#102030", "#f0e0d0"],
    });
    const seen = new Set<string>();
    for (let i = 0; i < pal.data.length; i += 4) seen.add([...pal.data.slice(i, i + 3)].join(","));
    expect(seen).toEqual(new Set(["16,32,48", "240,224,208"]));
    expect(() => applyPosterize(img, { ...POSTER, mode: "palette", palette: [] })).toThrow(
      RangeError,
    );
  });

  it("finds the nearest palette colour", () => {
    const colors = [
      [0, 0, 0],
      [255, 0, 0],
      [255, 255, 255],
    ] as const;
    expect(nearestColor(colors, 10, 10, 10)).toBe(0);
    expect(nearestColor(colors, 200, 30, 20)).toBe(1);
    expect(nearestColor(colors, 240, 240, 230)).toBe(2);
  });

  it("draws blocks as merged runs, one path per colour", () => {
    const grid = buffer(3, 2, (x, y) =>
      y === 0 ? [255, 0, 0, 255] : x === 1 ? [0, 0, 0, 0] : [0, 0, 255, 255],
    );
    const svg = pixelateSvg(grid, { width: 300, height: 200 });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="300" height="200"/);
    expect(svg).toContain('viewBox="0 0 3 2"');
    expect(svg).toContain('<path fill="#ff0000" d="M0 0h3v1h-3z"/>');
    expect(svg).toContain('<path fill="#0000ff" d="M0 1h1v1h-1zM2 1h1v1h-1z"/>');
    expect(svg.match(/<path/g)).toHaveLength(2);
    expect(pixelateShapeEstimate(grid)).toBe(6);
  });
});
