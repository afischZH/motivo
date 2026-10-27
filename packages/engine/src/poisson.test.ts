import { describe, expect, it } from "vitest";
import { poissonDisk } from "./poisson";
import { createRng } from "./rng";
import { distance } from "./vec";

describe("poissonDisk", () => {
  const options = { width: 100, height: 80, minDistance: 10 };
  const run = (seed: number) => poissonDisk({ ...options, rng: createRng(seed) });

  it("keeps all points inside the rectangle", () => {
    for (const p of run(1)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(options.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(options.height);
    }
  });

  it("respects the minimum distance between every pair", () => {
    for (const seed of [1, 2, 3]) {
      const points = run(seed);
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        for (let j = i + 1; j < points.length; j++) {
          const b = points[j];
          if (a === undefined || b === undefined) throw new Error("unreachable");
          expect(distance(a, b)).toBeGreaterThanOrEqual(options.minDistance);
        }
      }
    }
  });

  it("is deterministic for seed 1 and differs for other seeds", () => {
    const a = run(1);
    expect(run(1)).toEqual(a);
    expect(run(2)).not.toEqual(a);
    expect(a.length).toMatchInlineSnapshot(`57`);
    expect(a[0]).toMatchInlineSnapshot(`
      {
        "x": 62.707394058816135,
        "y": 0.21885769441723824,
      }
    `);
  });

  it("produces a reasonably dense set", () => {
    // Hexagonal packing bounds the count from above; Bridson typically reaches
    // well over half of that.
    const area = options.width * options.height;
    const upper = area / ((Math.sqrt(3) / 2) * options.minDistance ** 2) + 20;
    const count = run(1).length;
    expect(count).toBeGreaterThan(upper * 0.45);
    expect(count).toBeLessThan(upper);
  });

  it("handles degenerate input", () => {
    expect(poissonDisk({ width: 0, height: 10, minDistance: 1, rng: createRng(1) })).toEqual([]);
    expect(() => poissonDisk({ width: 10, height: 10, minDistance: 0, rng: createRng(1) })).toThrow(
      RangeError,
    );
    // A minDistance larger than the rectangle yields exactly one point.
    expect(poissonDisk({ width: 5, height: 5, minDistance: 50, rng: createRng(1) })).toHaveLength(
      1,
    );
  });
});
