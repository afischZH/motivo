import { describe, expect, it } from "vitest";
import { marchingSquares } from "./contours";
import { pointCount, polylineLength } from "./polyline";

/** Samples f on an n × n grid. */
function grid(n: number, f: (x: number, y: number) => number): Float64Array {
  const out = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out[j * n + i] = f(i, j);
  return out;
}

describe("marchingSquares", () => {
  it("traces a circle as one closed loop with the right radius", () => {
    const n = 41;
    const values = grid(n, (x, y) => -Math.hypot(x - 20, y - 20));
    const contours = marchingSquares(values, n, n, -10);
    expect(contours).toHaveLength(1);
    const [c] = contours;
    expect(c?.closed).toBe(true);
    const pts = c?.points ?? [];
    for (let i = 0; i < pointCount(pts); i++) {
      const r = Math.hypot((pts[2 * i] ?? 0) - 20, (pts[2 * i + 1] ?? 0) - 20);
      expect(r).toBeCloseTo(10, 0);
    }
    expect(polylineLength(pts, true)).toBeCloseTo(2 * Math.PI * 10, -1);
  });

  it("returns open lines that end on the grid border", () => {
    const n = 10;
    const values = grid(n, (x) => x);
    const contours = marchingSquares(values, n, n, 4.5);
    expect(contours).toHaveLength(1);
    const [c] = contours;
    expect(c?.closed).toBe(false);
    expect(pointCount(c?.points ?? [])).toBe(n);
    for (let i = 0; i < n; i++) expect(c?.points[2 * i]).toBeCloseTo(4.5, 12);
  });

  it("closes every line when the grid is padded with a low value", () => {
    const n = 12;
    const values = grid(n, (x, y) =>
      x === 0 || y === 0 || x === n - 1 || y === n - 1 ? -1e9 : Math.sin(x) + Math.cos(y),
    );
    const contours = marchingSquares(values, n, n, 0.2);
    expect(contours.length).toBeGreaterThan(0);
    expect(contours.every((c) => c.closed)).toBe(true);
  });

  it("resolves saddles by the cell mean", () => {
    // Inside corners top-left and bottom-right.
    const low = marchingSquares([1, 0, 0, 1], 2, 2, 0.6);
    const high = marchingSquares([1, 0, 0, 1], 2, 2, 0.4);
    expect(low).toHaveLength(2);
    expect(high).toHaveLength(2);
    // Mean 0.5 is below 0.6: the inside corners are cut off separately.
    const corners = (cs: typeof low) =>
      cs.map((c) => [c.points[0], c.points[1], c.points[2], c.points[3]]);
    expect(corners(low)).not.toEqual(corners(high));
  });

  it("handles empty and degenerate input", () => {
    expect(marchingSquares([], 0, 0, 0)).toEqual([]);
    expect(marchingSquares([1, 2], 2, 1, 1.5)).toEqual([]);
    expect(marchingSquares([0, 0, 0, 0], 2, 2, 1)).toEqual([]);
    expect(marchingSquares([1, 1, 1, 1], 2, 2, 0)).toEqual([]);
    expect(marchingSquares([Number.NaN, 1, 1, 1], 2, 2, 0)).toHaveLength(1);
  });
});
