import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import { GRAIN_SIGMA, GRAIN_TILE_EDGE, grainTile, grainTone } from "./tile";

/** Mean and standard deviation of channel `c` over the tile. */
function stats(data: Uint8ClampedArray, c: number): { mean: number; sd: number } {
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let i = c; i < data.length; i += 4) {
    const v = data[i] as number;
    sum += v;
    sq += v * v;
    n++;
  }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(sq / n - mean * mean) };
}

/** Mean absolute difference between neighbouring pixels across the tile wrap vs. inside. */
function seamRatio(data: Uint8ClampedArray, edge: number): number {
  const at = (x: number, y: number): number => data[(y * edge + x) * 4] as number;
  let wrap = 0;
  let inner = 0;
  for (let y = 0; y < edge; y++) {
    wrap += Math.abs(at(edge - 1, y) - at(0, y));
    inner += Math.abs(at(edge / 2 - 1, y) - at(edge / 2, y));
  }
  return wrap / inner;
}

describe("grainTone", () => {
  it("is neutral at z = 0 for every blend mode", () => {
    expect(grainTone(0, "overlay")).toBe(128);
    expect(grainTone(0, "soft-light")).toBe(128);
    expect(grainTone(0, "multiply")).toBe(255);
  });

  it("scales by GRAIN_SIGMA and clamps to bytes", () => {
    expect(grainTone(1, "overlay")).toBe(128 + GRAIN_SIGMA);
    expect(grainTone(-1, "multiply")).toBe(255 - GRAIN_SIGMA);
    expect(grainTone(10, "overlay")).toBe(255);
    expect(grainTone(-10, "overlay")).toBe(0);
    expect(grainTone(10, "multiply")).toBe(0);
  });
});

describe("grainTile", () => {
  it("is deterministic for a seed and changes with it", () => {
    const a = grainTile(createRng(1), { size: 1, mono: true, blend: "overlay" });
    const b = grainTile(createRng(1), { size: 1, mono: true, blend: "overlay" });
    const c = grainTile(createRng(2), { size: 1, mono: true, blend: "overlay" });
    expect(a.data).toEqual(b.data);
    expect(a.data).not.toEqual(c.data);
    expect([a.width, a.height]).toEqual([GRAIN_TILE_EDGE, GRAIN_TILE_EDGE]);
  });

  it("produces opaque grey pixels in mono mode", () => {
    const { data } = grainTile(createRng(3), { size: 1, mono: true, blend: "overlay", edge: 32 });
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i + 1]).toBe(data[i]);
      expect(data[i + 2]).toBe(data[i]);
      expect(data[i + 3]).toBe(255);
    }
  });

  it("uses independent channels in colour mode", () => {
    const { data } = grainTile(createRng(3), { size: 1, mono: false, blend: "overlay", edge: 64 });
    let differ = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] !== data[i + 1]) differ++;
    expect(differ / (64 * 64)).toBeGreaterThan(0.9);
  });

  it.each([1, 1.5, 3, 8])("keeps a Gaussian spread around the neutral value at size %s", (size) => {
    const { data } = grainTile(createRng(5), { size, mono: false, blend: "overlay" });
    for (const c of [0, 1, 2]) {
      const { mean, sd } = stats(data, c);
      expect(Math.abs(mean - 128)).toBeLessThan(size > 4 ? 8 : 3);
      // Clamping at 0/255 trims the tails a little.
      expect(sd).toBeGreaterThan(GRAIN_SIGMA * (size > 4 ? 0.8 : 0.9));
      expect(sd).toBeLessThan(GRAIN_SIGMA * 1.1);
    }
  });

  it("only darkens for multiply", () => {
    const { data } = grainTile(createRng(5), { size: 1, mono: true, blend: "multiply" });
    const { mean } = stats(data, 0);
    // E|z| = sqrt(2 / pi), about 0.8.
    expect(mean).toBeCloseTo(255 - GRAIN_SIGMA * Math.sqrt(2 / Math.PI), -1);
  });

  it("makes coarser grain smoother, and wraps seamlessly", () => {
    const fine = grainTile(createRng(9), { size: 1, mono: true, blend: "overlay" });
    const coarse = grainTile(createRng(9), { size: 4, mono: true, blend: "overlay" });
    const roughness = (d: Uint8ClampedArray): number => {
      let s = 0;
      for (let i = 4; i < d.length; i += 4) s += Math.abs((d[i] as number) - (d[i - 4] as number));
      return s;
    };
    expect(roughness(coarse.data)).toBeLessThan(roughness(fine.data) * 0.6);
    expect(seamRatio(coarse.data, GRAIN_TILE_EDGE)).toBeLessThan(1.3);
  });

  it("clamps size and edge so params cannot inflate the work", () => {
    const huge = grainTile(createRng(1), { size: 1e9, mono: true, blend: "overlay", edge: 1e9 });
    expect(huge.width).toBe(GRAIN_TILE_EDGE);
    const tiny = grainTile(createRng(1), { size: -5, mono: true, blend: "overlay", edge: 0 });
    expect(tiny.width).toBe(8);
  });
});
