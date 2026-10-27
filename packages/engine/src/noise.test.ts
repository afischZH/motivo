import { describe, expect, it } from "vitest";
import { NOISE_PERIOD, createNoise1D } from "./noise";
import { createRng } from "./rng";

describe("createNoise1D", () => {
  it("is deterministic for a seed", () => {
    const a = createNoise1D(createRng(7));
    const b = createNoise1D(createRng(7));
    const c = createNoise1D(createRng(8));
    const xs = [0.1, 1.7, 3.3, 42.42];
    expect(xs.map(a)).toEqual(xs.map(b));
    expect(xs.map(a)).not.toEqual(xs.map(c));
  });

  it("is zero at lattice points and bounded", () => {
    const n = createNoise1D(createRng(1));
    for (let i = -3; i < 10; i++) expect(n(i)).toBeCloseTo(0, 12);
    for (let x = 0; x < 50; x += 0.013) expect(Math.abs(n(x))).toBeLessThanOrEqual(0.5);
  });

  it("is continuous (small steps give small changes)", () => {
    const n = createNoise1D(createRng(3));
    for (let x = 0; x < 20; x += 0.01) {
      expect(Math.abs(n(x + 0.001) - n(x))).toBeLessThan(0.01);
    }
  });

  it("repeats every period and ignores non-finite input", () => {
    const n = createNoise1D(createRng(5));
    expect(n(2.5 + NOISE_PERIOD)).toBeCloseTo(n(2.5), 12);
    expect(n(-0.5)).toBeCloseTo(n(NOISE_PERIOD - 0.5), 12);
    expect(n(Number.NaN)).toBe(0);
  });

  it("is not flat", () => {
    const n = createNoise1D(createRng(9));
    const values = Array.from({ length: 100 }, (_, i) => n(i + 0.5));
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.3);
  });
});
