import { describe, expect, it } from "vitest";
import { NOISE2D_PERIOD, createNoise2D, fbm2D } from "./noise2d";
import { createRng } from "./rng";

describe("createNoise2D", () => {
  it("is deterministic for a seed", () => {
    const a = createNoise2D(createRng(7));
    const b = createNoise2D(createRng(7));
    const c = createNoise2D(createRng(8));
    const pts: [number, number][] = [
      [0.1, 0.2],
      [1.7, 3.3],
      [42.42, 7.5],
    ];
    expect(pts.map(([x, y]) => a(x, y))).toEqual(pts.map(([x, y]) => b(x, y)));
    expect(pts.map(([x, y]) => a(x, y))).not.toEqual(pts.map(([x, y]) => c(x, y)));
  });

  it("is zero at lattice points and stays within [-1, 1]", () => {
    const n = createNoise2D(createRng(1));
    for (let i = -2; i < 6; i++) expect(n(i, i + 1)).toBeCloseTo(0, 12);
    let min = Infinity;
    let max = -Infinity;
    for (let x = 0; x < 20; x += 0.137) {
      for (let y = 0; y < 20; y += 0.173) {
        const v = n(x, y);
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    // Uses a good part of the range.
    expect(max - min).toBeGreaterThan(1);
  });

  it("is continuous", () => {
    const n = createNoise2D(createRng(3));
    for (let x = 0; x < 8; x += 0.05) {
      for (let y = 0; y < 8; y += 0.31) {
        expect(Math.abs(n(x + 0.001, y) - n(x, y))).toBeLessThan(0.01);
        expect(Math.abs(n(x, y + 0.001) - n(x, y))).toBeLessThan(0.01);
      }
    }
  });

  it("repeats every period and ignores non-finite input", () => {
    const n = createNoise2D(createRng(5));
    expect(n(2.5 + NOISE2D_PERIOD, 1.25)).toBeCloseTo(n(2.5, 1.25), 12);
    expect(n(2.5, 1.25 - NOISE2D_PERIOD)).toBeCloseTo(n(2.5, 1.25), 12);
    expect(n(Number.NaN, 1)).toBe(0);
    expect(n(1, Infinity)).toBe(0);
  });
});

describe("fbm2D", () => {
  const n = createNoise2D(createRng(11));

  it("equals the noise for one octave", () => {
    expect(fbm2D(n, 0.3, 0.7, { octaves: 1 })).toBeCloseTo(n(0.3, 0.7), 12);
  });

  it("stays within [-1, 1] and adds detail with more octaves", () => {
    // Detail = mean absolute second difference over small steps.
    const detail = (octaves: number): number => {
      let sum = 0;
      const h = 0.01;
      for (let x = 0; x < 10; x += 0.05) {
        const a = fbm2D(n, x - h, 2.2, { octaves });
        const b = fbm2D(n, x, 2.2, { octaves });
        const c = fbm2D(n, x + h, 2.2, { octaves });
        expect(Math.abs(b)).toBeLessThanOrEqual(1);
        sum += Math.abs(a - 2 * b + c);
      }
      return sum;
    };
    expect(detail(6)).toBeGreaterThan(detail(1) * 2);
  });

  it("treats fewer than one octave as one", () => {
    expect(fbm2D(n, 1.1, 2.3, { octaves: 0 })).toBe(fbm2D(n, 1.1, 2.3, { octaves: 1 }));
  });
});
