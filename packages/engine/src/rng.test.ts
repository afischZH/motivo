import { describe, expect, it } from "vitest";
import { createRng, deriveSeed, toUint32 } from "./rng.js";

const take = (seed: number, n: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe("createRng", () => {
  it("locks the first values for seed 1 (mulberry32 reference)", () => {
    expect(take(1, 5)).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741,
      0.9683778982143849,
    ]);
  });

  it("is deterministic for the same seed", () => {
    expect(take(42, 100)).toEqual(take(42, 100));
  });

  it("differs for different seeds", () => {
    expect(take(1, 10)).not.toEqual(take(2, 10));
  });

  it("coerces seeds to uint32", () => {
    expect(take(1.9, 5)).toEqual(take(1, 5));
    expect(take(-1, 5)).toEqual(take(0xffffffff, 5));
    expect(take(2 ** 32 + 7, 5)).toEqual(take(7, 5));
    expect(take(Number.NaN, 5)).toEqual(take(0, 5));
    expect(toUint32(-1)).toBe(0xffffffff);
  });

  it("next stays in [0, 1) with a plausible mean", () => {
    const rng = createRng(7);
    const n = 20000;
    const values = Array.from({ length: n }, () => rng.next());
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(values.reduce((a, b) => a + b, 0) / n).toBeCloseTo(0.5, 1);
  });

  it("int is inclusive and covers the whole range roughly uniformly", () => {
    const rng = createRng(3);
    const counts = new Map<number, number>();
    const n = 12000;
    for (let i = 0; i < n; i++) {
      const v = rng.int(-2, 3);
      expect(Number.isInteger(v)).toBe(true);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2, 3]);
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan((n / 6) * 0.85);
      expect(c).toBeLessThan((n / 6) * 1.15);
    }
    expect(rng.int(5, 5)).toBe(5);
    expect(() => rng.int(3, 2)).toThrow(RangeError);
  });

  it("float stays within [min, max)", () => {
    const rng = createRng(9);
    for (let i = 0; i < 1000; i++) {
      const v = rng.float(-3, 5);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(5);
    }
  });

  it("pick returns array members and throws on empty input", () => {
    const rng = createRng(11);
    const items = ["a", "b", "c"] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(rng.pick(items));
    expect([...seen].sort()).toEqual(["a", "b", "c"]);
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it("shuffle returns a new permutation without mutating the input", () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const copy = input.slice();
    const out = createRng(5).shuffle(input);
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
    expect(out.slice().sort((a, b) => a - b)).toEqual(input);
    expect(out).not.toEqual(input);
    expect(createRng(5).shuffle(input)).toEqual(out);
  });

  it("bool respects the probability", () => {
    const rng = createRng(13);
    let hits = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) if (rng.bool(0.2)) hits++;
    expect(hits / n).toBeCloseTo(0.2, 1);
    expect(rng.bool(0)).toBe(false);
    expect(rng.bool(1)).toBe(true);
  });

  it("gaussian has the requested mean and standard deviation", () => {
    const rng = createRng(17);
    const n = 20000;
    const values = Array.from({ length: n }, () => rng.gaussian(10, 2));
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    expect(values.every(Number.isFinite)).toBe(true);
    expect(mean).toBeCloseTo(10, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(2, 1);
  });
});

describe("deriveSeed", () => {
  it("is deterministic and returns uint32", () => {
    const a = deriveSeed(1, "colors");
    expect(deriveSeed(1, "colors")).toBe(a);
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
  });

  it("locks known values", () => {
    expect(deriveSeed(1, "a")).toBe(2773470744);
    expect(deriveSeed(1, 1)).toBe(2002331337);
    expect(deriveSeed(1, "1")).toBe(4193740486);
  });

  it("separates seeds, salts and salt types", () => {
    const seeds = new Set<number>();
    for (let s = 0; s < 50; s++) {
      for (const salt of ["a", "b", 0, 1, 2]) seeds.add(deriveSeed(s, salt));
    }
    expect(seeds.size).toBe(250);
    expect(deriveSeed(1, 1)).not.toBe(deriveSeed(1, "1"));
  });

  it("produces streams that differ from the parent stream", () => {
    expect(take(deriveSeed(1, "x"), 5)).not.toEqual(take(1, 5));
  });
});
