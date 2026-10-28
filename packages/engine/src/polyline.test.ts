import { describe, expect, it } from "vitest";
import {
  pointCount,
  polylineLength,
  polylinePathData,
  simplifyPolyline,
  slicePolyline,
  smoothPathData,
  numberFormatter,
  subdividePolyline,
} from "./polyline";

describe("subdividePolyline", () => {
  it("splits long segments evenly and keeps short ones", () => {
    expect(subdividePolyline([0, 0, 10, 0, 11, 0], 4)).toEqual([
      0,
      0,
      10 / 3,
      0,
      20 / 3,
      0,
      10,
      0,
      11,
      0,
    ]);
  });

  it("includes the closing segment of loops", () => {
    const out = subdividePolyline([0, 0, 4, 0, 4, 4], 2, true);
    expect(pointCount(out)).toBe(2 + 2 + 3);
    expect(polylineLength(out, true)).toBeCloseTo(8 + Math.hypot(4, 4), 9);
  });

  it("returns short input unchanged", () => {
    expect(subdividePolyline([1, 1], 1)).toEqual([1, 1]);
    expect(subdividePolyline([0, 0, 9, 0], 0)).toEqual([0, 0, 9, 0]);
  });
});

describe("polylineLength", () => {
  it("sums segments and the closing edge", () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 10];
    expect(polylineLength(square)).toBe(30);
    expect(polylineLength(square, true)).toBe(40);
    expect(polylineLength([])).toBe(0);
    expect(pointCount(square)).toBe(4);
  });
});

describe("simplifyPolyline", () => {
  it("drops collinear and near-collinear points", () => {
    const line = [0, 0, 1, 0.01, 2, -0.01, 3, 0, 4, 0];
    expect(simplifyPolyline(line, 0.1)).toEqual([0, 0, 4, 0]);
    expect(simplifyPolyline(line, 0.001)).toEqual(line);
  });

  it("keeps corners above the tolerance", () => {
    const corner = [0, 0, 5, 0, 10, 0, 10, 5, 10, 10];
    expect(simplifyPolyline(corner, 0.5)).toEqual([0, 0, 10, 0, 10, 10]);
  });

  it("simplifies a closed loop to its corners", () => {
    const loop: number[] = [];
    for (let i = 0; i < 10; i++) loop.push(i, 0);
    for (let i = 0; i < 10; i++) loop.push(10, i);
    for (let i = 10; i > 0; i--) loop.push(i, 10);
    for (let i = 10; i > 0; i--) loop.push(0, i);
    const out = simplifyPolyline(loop, 0.1, true);
    expect(pointCount(out)).toBe(4);
    expect(polylineLength(out, true)).toBeCloseTo(40, 9);
  });

  it("stays within the tolerance of the original", () => {
    const wave: number[] = [];
    for (let i = 0; i <= 200; i++) wave.push(i / 10, Math.sin(i / 10));
    const out = simplifyPolyline(wave, 0.05);
    expect(pointCount(out)).toBeLessThan(60);
    for (let i = 0; i <= 200; i++) {
      const x = i / 10;
      // Find the kept segment around x and compare heights.
      let k = 0;
      while ((out[2 * k + 2] ?? Infinity) < x) k++;
      const x0 = out[2 * k] ?? 0;
      const x1 = out[2 * k + 2] ?? x0;
      const t = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
      const y = (out[2 * k + 1] ?? 0) + t * ((out[2 * k + 3] ?? 0) - (out[2 * k + 1] ?? 0));
      expect(Math.abs(y - Math.sin(x))).toBeLessThan(0.06);
    }
  });

  it("returns short lines and tolerance 0 unchanged", () => {
    expect(simplifyPolyline([1, 2, 3, 4], 5)).toEqual([1, 2, 3, 4]);
    expect(simplifyPolyline([0, 0, 1, 1, 2, 0], 0)).toEqual([0, 0, 1, 1, 2, 0]);
  });
});

describe("path data", () => {
  it("writes straight polylines with implicit lineto", () => {
    expect(polylinePathData([0, 0, 1.25, 2, 3, 4.06])).toBe("M0 0 1.3 2 3 4.1");
    expect(polylinePathData([0, 0, 1, 0, 1, 1], true)).toBe("M0 0 1 0 1 1Z");
    expect(polylinePathData([])).toBe("");
  });

  it("writes smooth open curves through the end points", () => {
    expect(smoothPathData([0, 0, 10, 0, 10, 10])).toBe("M0 0L5 0Q10 0 10 5L10 10");
    expect(smoothPathData([0, 0, 10, 0])).toBe("M0 0 10 0");
  });

  it("writes smooth closed loops", () => {
    const d = smoothPathData([0, 0, 10, 0, 10, 10, 0, 10], true);
    expect(d).toBe("M0 5Q0 0 5 0Q10 0 10 5Q10 10 5 10Q0 10 0 5Z");
  });
});

describe("slicePolyline", () => {
  const line = [0, 0, 10, 0, 10, 10];

  it("cuts by arc length, across vertices", () => {
    expect(slicePolyline(line, 4, 14)).toEqual([4, 0, 10, 0, 10, 4]);
    expect(slicePolyline(line, 0, 5)).toEqual([0, 0, 5, 0]);
    expect(slicePolyline(line, 12, 30)).toEqual([10, 2, 10, 10]);
  });

  it("returns nothing outside the line or for empty ranges", () => {
    expect(slicePolyline(line, 25, 30)).toEqual([]);
    expect(slicePolyline(line, -5, 0)).toEqual([]);
    expect(slicePolyline(line, 5, 5)).toEqual([]);
    expect(slicePolyline([1, 1], 0, 1)).toEqual([]);
  });

  it("returns the whole line for a range covering it", () => {
    expect(slicePolyline(line, -1, 100)).toEqual(line);
  });
});

describe("numberFormatter", () => {
  it("writes tenths exactly like String of the rounded value (fast path, M4b-AP05)", () => {
    const f = numberFormatter(1);
    const reference = (v: number): string => {
      const r = Math.round(v * 10) / 10;
      return r === 0 || !Number.isFinite(r) ? "0" : String(r);
    };
    const values = [0, -0, 0.04, -0.04, 0.05, -0.05, 0.15, 1, -1, 9.95, 12.34, -7.65, 19999.94];
    values.push(19999.96, 25000.5, -25000.5, 1e21, Number.NaN, Infinity, -Infinity);
    for (let i = 0; i < 20000; i++) values.push(Math.sin(i) * 9000 + i * 0.0137);
    for (const v of values) expect(f(v), String(v)).toBe(reference(v));
  });

  it("rounds, trims and avoids negative zero", () => {
    const f = numberFormatter(1);
    expect([1.25, 3, -0.04, 0.30000000000000004, 1234.56, -7.75].map(f)).toEqual([
      "1.3",
      "3",
      "0",
      "0.3",
      "1234.6",
      "-7.7",
    ]);
    expect(numberFormatter(0)(2.5)).toBe("3");
    expect(f(Number.NaN)).toBe("0");
  });
});
