import { describe, expect, it } from "vitest";
import {
  GRAIN_AMPLITUDE,
  LUMA_WEIGHTS,
  NEUTRAL_TONE,
  applyGradientMap,
  applyTone,
  bayerMatrix,
  coverRect,
  createPixelBuffer,
  demoPhoto,
  grainAt,
  gradientLut,
  hash2,
  isPixelBuffer,
  luma,
  normalizeWeights,
  pixelDigest,
  resizeCover,
  toneCurve,
  type GradientMapOptions,
  type PixelBuffer,
} from "./index";

function solid(width: number, height: number, rgba: [number, number, number, number]): PixelBuffer {
  const buf = createPixelBuffer(width, height);
  for (let i = 0; i < buf.data.length; i += 4) buf.data.set(rgba, i);
  return buf;
}

describe("pixel buffers", () => {
  it("creates transparent buffers with rounded, positive sizes", () => {
    const b = createPixelBuffer(2.4, 0);
    expect([b.width, b.height, b.data.length]).toEqual([2, 1, 8]);
    expect(isPixelBuffer(b)).toBe(true);
    expect(isPixelBuffer({ width: 2, height: 2, data: new Uint8ClampedArray(3) })).toBe(false);
  });

  it("digests size and bytes", () => {
    const a = solid(2, 2, [1, 2, 3, 4]);
    expect(pixelDigest(a)).toBe(pixelDigest(solid(2, 2, [1, 2, 3, 4])));
    expect(pixelDigest(a)).not.toBe(pixelDigest(solid(2, 2, [1, 2, 3, 5])));
    expect(pixelDigest(a)).not.toBe(pixelDigest(solid(4, 1, [1, 2, 3, 4])));
  });

  it("covers a target like object-fit: cover", () => {
    expect(coverRect(400, 200, 100, 100)).toEqual({ x: 100, y: 0, width: 200, height: 200 });
    expect(coverRect(200, 400, 200, 100)).toEqual({ x: 0, y: 150, width: 200, height: 100 });
    expect(coverRect(300, 200, 150, 100)).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });

  it("box-filters when shrinking and keeps flat colours", () => {
    const src = createPixelBuffer(4, 2);
    // Left half black, right half white.
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 4; x++) {
        const v = x < 2 ? 0 : 255;
        src.data.set([v, v, v, 255], (y * 4 + x) * 4);
      }
    }
    const out = resizeCover(src, 2, 1);
    expect(Array.from(out.data)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
    const up = resizeCover(solid(1, 1, [9, 8, 7, 255]), 3, 2);
    expect(Array.from(up.data.slice(0, 4))).toEqual([9, 8, 7, 255]);
  });
});

describe("luminance and tone", () => {
  it("normalises weights and falls back to Rec. 709", () => {
    expect(normalizeWeights({ r: 2, g: 2, b: 0 })).toEqual({ r: 0.5, g: 0.5, b: 0 });
    expect(normalizeWeights({ r: 0, g: 0, b: 0 })).toEqual(LUMA_WEIGHTS.rec709);
    expect(luma(255, 255, 255, LUMA_WEIGHTS.rec709)).toBeCloseTo(255);
    expect(luma(0, 255, 0, LUMA_WEIGHTS.rec709)).toBeCloseTo(0.7152 * 255);
  });

  it("keeps values with the neutral tone and moves them as documented", () => {
    const lut = toneCurve(NEUTRAL_TONE);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(1);
    expect(lut[128]).toBeCloseTo(128 / 255, 5);
    expect(applyTone(0.5, { ...NEUTRAL_TONE, brightness: 100 })).toBe(1);
    expect(applyTone(0.6, { ...NEUTRAL_TONE, contrast: 50 })).toBeGreaterThan(0.6);
    expect(applyTone(0.6, { ...NEUTRAL_TONE, contrast: -50 })).toBeLessThan(0.6);
    expect(applyTone(0.25, { ...NEUTRAL_TONE, gamma: 2 })).toBeCloseTo(0.5);
    expect(applyTone(0.5, { ...NEUTRAL_TONE, contrast: 100 })).toBeCloseTo(0.5);
  });
});

describe("grain", () => {
  it("hashes deterministically and depends on every input", () => {
    expect(hash2(3, 4, 5)).toBe(hash2(3, 4, 5));
    expect(hash2(3, 4, 5)).not.toBe(hash2(4, 3, 5));
    expect(hash2(3, 4, 5)).not.toBe(hash2(3, 4, 6));
  });

  it("stays within [-1, 1] and matches the lattice at integer points", () => {
    let min = 1;
    let max = -1;
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const v = grainAt(i * 0.37, i * 0.53, 9);
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    expect(Math.abs(sum / 2000)).toBeLessThan(0.1);
    expect(grainAt(2, 3, 1)).toBeCloseTo(hash2(2, 3, 1) / 2147483648 - 1);
  });
});

describe("gradient lookup", () => {
  it("runs from the first to the last stop", () => {
    const lut = gradientLut(["#000000", "#ffffff"]);
    expect(Array.from(lut.slice(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(lut.slice(255 * 3))).toEqual([255, 255, 255]);
  });

  it("passes through a middle stop and flattens a single stop", () => {
    const lut = gradientLut(["#000000", "#ff0000", "#ffffff"]);
    // Index 127.5 is the middle stop; 127 and 128 sit next to it.
    expect(lut[128 * 3]).toBeGreaterThan(240);
    expect(Array.from(gradientLut(["#336699"]).slice(200 * 3, 200 * 3 + 3))).toEqual([
      0x33, 0x66, 0x99,
    ]);
    expect(() => gradientLut([])).toThrow(RangeError);
  });
});

describe("applyGradientMap", () => {
  const base: GradientMapOptions = {
    ...NEUTRAL_TONE,
    stops: ["#102030", "#f0e0d0"],
    weights: LUMA_WEIGHTS.rec709,
    grain: 0,
    grainCell: 1,
    seed: 1,
    amount: 1,
  };

  it("maps black and white to the end stops and keeps alpha", () => {
    const img = createPixelBuffer(2, 1);
    img.data.set([0, 0, 0, 255, 255, 255, 255, 128]);
    const out = applyGradientMap(img, base);
    expect(Array.from(out.data)).toEqual([0x10, 0x20, 0x30, 255, 0xf0, 0xe0, 0xd0, 128]);
  });

  it("blends with the original by amount", () => {
    const img = solid(1, 1, [0, 0, 0, 255]);
    const out = applyGradientMap(img, { ...base, amount: 0.5 });
    expect(Array.from(out.data)).toEqual([8, 16, 24, 255]);
    expect(Array.from(applyGradientMap(img, { ...base, amount: 0 }).data)).toEqual([0, 0, 0, 255]);
  });

  it("adds deterministic grain within the gradient", () => {
    const img = solid(16, 16, [128, 128, 128, 255]);
    const a = applyGradientMap(img, { ...base, grain: 1, grainCell: 2 });
    expect(pixelDigest(a)).toBe(
      pixelDigest(applyGradientMap(img, { ...base, grain: 1, grainCell: 2 })),
    );
    expect(pixelDigest(a)).not.toBe(
      pixelDigest(applyGradientMap(img, { ...base, grain: 1, grainCell: 2, seed: 2 })),
    );
    const values = new Set<number>();
    for (let i = 0; i < a.data.length; i += 4) values.add(a.data[i] ?? 0);
    expect(values.size).toBeGreaterThan(4);
    // Tone 0.5 ± GRAIN_AMPLITUDE stays strictly between the end stops.
    expect(Math.min(...values)).toBeGreaterThan(0x10);
    expect(Math.max(...values)).toBeLessThan(0xf0);
    expect(GRAIN_AMPLITUDE).toBe(0.25);
  });

  it("uses the luminance weights", () => {
    const green = solid(1, 1, [0, 255, 0, 255]);
    const bw = { ...base, stops: ["#000000", "#ffffff"] };
    const rec = applyGradientMap(green, bw).data[0] ?? 0;
    const avg = applyGradientMap(green, { ...bw, weights: LUMA_WEIGHTS.average }).data[0] ?? 0;
    expect(rec).toBeGreaterThan(avg);
  });
});

describe("bayerMatrix", () => {
  it("builds the classic 2 x 2 and 4 x 4 orders", () => {
    expect(Array.from(bayerMatrix(2)).map((v) => v * 4 - 0.5)).toEqual([0, 2, 3, 1]);
    const m4 = Array.from(bayerMatrix(4)).map((v) => Math.round(v * 16 - 0.5));
    expect(m4).toEqual([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
    expect(new Set(Array.from(bayerMatrix(8))).size).toBe(64);
  });
});

describe("demoPhoto", () => {
  it("is opaque, deterministic and has a full tonal range", () => {
    const a = demoPhoto(150, 100);
    expect(pixelDigest(a)).toBe(pixelDigest(demoPhoto(150, 100)));
    let min = 255;
    let max = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      expect(a.data[i + 3]).toBe(255);
      const l = luma(a.data[i] ?? 0, a.data[i + 1] ?? 0, a.data[i + 2] ?? 0, LUMA_WEIGHTS.rec709);
      min = Math.min(min, l);
      max = Math.max(max, l);
    }
    expect(min).toBeLessThan(45);
    expect(max).toBeGreaterThan(225);
  });

  it("looks the same at another resolution (procedural, not resampled)", () => {
    const small = resizeCover(demoPhoto(600, 400), 60, 40);
    const direct = demoPhoto(60, 40);
    let diff = 0;
    for (let i = 0; i < small.data.length; i++)
      diff += Math.abs((small.data[i] ?? 0) - (direct.data[i] ?? 0));
    expect(diff / small.data.length).toBeLessThan(20);
  });
});
