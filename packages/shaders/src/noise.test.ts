import { describe, expect, it } from "vitest";
import { fbm2, hash32, hash3, saltSeed, simplex2 } from "./noise";

describe("hash32", () => {
  it("returns uint32 values matching the lowbias32 reference", () => {
    // Reference values computed with 64-bit arithmetic modulo 2^32.
    const ref = (x: number) => {
      let v = BigInt(x >>> 0);
      const m = (a: bigint, b: bigint) => (a * b) & 0xffffffffn;
      v ^= v >> 16n;
      v = m(v, 0x7feb352dn);
      v ^= v >> 15n;
      v = m(v, 0x846ca68bn);
      v ^= v >> 16n;
      return Number(v);
    };
    for (const x of [0, 1, 2, 12345, 0x7fffffff, 0x80000000, 0xffffffff, 32768]) {
      expect(hash32(x)).toBe(ref(x));
      expect(hash32(x)).toBeGreaterThanOrEqual(0);
    }
  });

  it("hash3 and saltSeed are deterministic and order sensitive", () => {
    expect(hash3(1, 2, 3)).toBe(hash3(1, 2, 3));
    expect(hash3(1, 2, 3)).not.toBe(hash3(3, 2, 1));
    expect(saltSeed(7, 1)).not.toBe(saltSeed(7, 2));
    expect(saltSeed(7, 1)).not.toBe(saltSeed(8, 1));
  });
});

describe("simplex2", () => {
  it("stays in [-1, 1], is smooth and changes with the seed", () => {
    let min = 0;
    let max = 0;
    for (let i = 0; i < 4000; i++) {
      const x = i * 0.173 - 300;
      const y = i * 0.091 + 40;
      const v = simplex2(x, y, 99);
      min = Math.min(min, v);
      max = Math.max(max, v);
      // Continuity: a tiny step changes the value a little.
      expect(Math.abs(simplex2(x + 1e-4, y, 99) - v)).toBeLessThan(0.01);
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    expect(max - min).toBeGreaterThan(1.2);
    expect(simplex2(0.3, 0.7, 1)).not.toBe(simplex2(0.3, 0.7, 2));
    expect(simplex2(0, 0, 5)).toBe(0);
  });

  it("fbm2 is normalised and uses the octave count", () => {
    for (let i = 0; i < 500; i++) {
      const v = fbm2(i * 0.31, i * 0.17, 3, 6);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
    expect(fbm2(0.4, 0.2, 3, 1)).toBeCloseTo(simplex2(0.4, 0.2, 3), 12);
    expect(fbm2(0.4, 0.2, 3, 2)).not.toBe(fbm2(0.4, 0.2, 3, 1));
  });
});
