import { describe, expect, it } from "vitest";
import { chordDistance, polylinePath, sampleCurve } from "./sampling";
import type { Vec2 } from "./vec";

describe("chordDistance", () => {
  it("measures the distance to the line through both points", () => {
    expect(chordDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(chordDistance({ x: 20, y: -4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(4);
  });

  it("falls back to the distance from the first point when the chord is empty", () => {
    expect(chordDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe("sampleCurve", () => {
  const circle =
    (r: number) =>
    (t: number): Vec2 => ({
      x: r * Math.cos(2 * Math.PI * t),
      y: r * Math.sin(2 * Math.PI * t),
    });

  it("keeps the even grid for a straight line", () => {
    const pts = sampleCurve((t) => ({ x: t * 10, y: t * 5 }), 0, 1, { steps: 4, tolerance: 0.1 });
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 2.5, y: 1.25 },
      { x: 5, y: 2.5 },
      { x: 7.5, y: 3.75 },
      { x: 10, y: 5 },
    ]);
  });

  it("refines curved steps until the sagitta is within the tolerance", () => {
    const r = 100;
    const tol = 0.25;
    const pts = sampleCurve(circle(r), 0, 1, { steps: 8, tolerance: tol, maxDepth: 8 });
    expect(pts.length).toBeGreaterThan(9);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as Vec2;
      const b = pts[i] as Vec2;
      // Sagitta of a chord of length c on a circle of radius r.
      const c = Math.hypot(b.x - a.x, b.y - a.y);
      const sagitta = r - Math.sqrt(r * r - (c / 2) ** 2);
      expect(sagitta).toBeLessThanOrEqual(tol + 1e-9);
    }
  });

  it("uses fewer points with a looser tolerance", () => {
    const fine = sampleCurve(circle(100), 0, 1, { steps: 8, tolerance: 0.1 });
    const coarse = sampleCurve(circle(100), 0, 1, { steps: 8, tolerance: 2 });
    expect(coarse.length).toBeLessThan(fine.length);
  });

  it("includes both ends and respects maxDepth 0", () => {
    const pts = sampleCurve(circle(100), 0.25, 0.75, { steps: 3, tolerance: 0.01, maxDepth: 0 });
    expect(pts).toHaveLength(4);
    expect(pts[0]?.x).toBeCloseTo(0);
    expect(pts[3]?.x).toBeCloseTo(0);
    expect(pts[3]?.y).toBeCloseTo(-100);
  });

  it("is deterministic", () => {
    const run = () => sampleCurve(circle(50), 0, 1, { steps: 5, tolerance: 0.3 });
    expect(run()).toEqual(run());
  });
});

describe("polylinePath", () => {
  it("writes an absolute move and compact relative steps on a 0.1 px grid", () => {
    const d = polylinePath([
      { x: 10, y: 20 },
      { x: 11.5, y: 19.7 },
      { x: 11.53, y: 22 },
      { x: 0.04, y: 22 },
    ]);
    expect(d).toBe("M10 20l1.5-.3 0 2.3-11.5 0");
  });

  it("skips steps that round to nothing", () => {
    expect(
      polylinePath([
        { x: 0, y: 0 },
        { x: 0.01, y: 0.02 },
        { x: 1, y: 0 },
      ]),
    ).toBe("M0 0l1 0");
  });

  it("closes loops and drops a repeated first point", () => {
    expect(
      polylinePath(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 0 },
        ],
        true,
      ),
    ).toBe("M0 0l10 0 0 10z");
  });

  it("does not drift: deltas add up to the rounded end point", () => {
    const pts: Vec2[] = Array.from({ length: 500 }, (_, i) => ({
      x: i * 0.333,
      y: Math.sin(i / 7) * 13.37,
    }));
    const d = polylinePath(pts);
    const nums = (d.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number);
    let x = 0;
    let y = 0;
    for (let i = 0; i < nums.length; i += 2) {
      x += nums[i] as number;
      y += nums[i + 1] as number;
    }
    const last = pts[pts.length - 1] as Vec2;
    expect(x).toBeCloseTo(Math.round(last.x * 10) / 10, 6);
    expect(y).toBeCloseTo(Math.round(last.y * 10) / 10, 6);
  });

  it("returns an empty string without a visible step", () => {
    expect(polylinePath([])).toBe("");
    expect(polylinePath([{ x: 1, y: 1 }])).toBe("");
    expect(
      polylinePath([
        { x: 1, y: 1 },
        { x: 1.01, y: 1 },
      ]),
    ).toBe("");
  });
});
