import { describe, expect, it } from "vitest";
import type { CubicPath } from "./curves";
import {
  createFloatRgba,
  flattenCubicPath,
  gaussianBlurRgba,
  gaussianKernel,
  paintCoverage,
  polygonCoverage,
  toRgba8,
} from "./raster";
import type { Vec2 } from "./vec";

const square = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const sum = (a: ArrayLike<number>): number => Array.from(a).reduce((s, v) => s + v, 0);

describe("flattenCubicPath", () => {
  const path: CubicPath = {
    start: { x: 0, y: 0 },
    segments: [
      { c1: { x: 10, y: 0 }, c2: { x: 10, y: 10 }, to: { x: 10, y: 10 } },
      { c1: { x: 0, y: 10 }, c2: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
    ],
    closed: true,
  };

  it("hits every segment end and uses a fixed number of steps", () => {
    const pts = flattenCubicPath(path, 4);
    expect(pts).toHaveLength(1 + 2 * 4);
    expect(pts[4]).toEqual({ x: 10, y: 10 });
    expect(pts[8]).toEqual({ x: 0, y: 0 });
  });

  it("follows straight segments exactly", () => {
    const line: CubicPath = {
      start: { x: 0, y: 0 },
      segments: [{ c1: { x: 2, y: 4 }, c2: { x: 4, y: 8 }, to: { x: 6, y: 12 } }],
      closed: false,
    };
    for (const p of flattenCubicPath(line)) expect(p.y).toBeCloseTo(2 * p.x, 9);
  });
});

describe("polygonCoverage", () => {
  it("covers inner pixels fully and edge pixels by their area", () => {
    const cov = polygonCoverage(square(2.5, 2, 7.5, 6), 10, 8);
    expect(sum(cov)).toBeCloseTo(5 * 4, 5);
    expect(cov[3 * 10 + 4]).toBeCloseTo(1, 6);
    expect(cov[3 * 10 + 2]).toBeCloseTo(0.5, 6);
    expect(cov[3 * 10 + 7]).toBeCloseTo(0.5, 6);
    expect(cov[1 * 10 + 4]).toBe(0);
  });

  it("clips to the buffer and handles both orientations", () => {
    const cw = polygonCoverage(square(-5, -5, 3, 3), 4, 4);
    const ccw = polygonCoverage(square(-5, -5, 3, 3).reverse(), 4, 4);
    expect(sum(cw)).toBeCloseTo(9, 5);
    expect(Array.from(ccw)).toEqual(Array.from(cw));
  });

  it("uses the nonzero rule (an overlapping loop stays filled once)", () => {
    // Two same-direction loops over the same square: winding 2, coverage still 1.
    const loop = square(1, 1, 3, 3);
    const cov = polygonCoverage([...loop, ...loop], 4, 4);
    expect(sum(cov)).toBeCloseTo(4, 5);
    expect(Math.max(...cov)).toBeLessThanOrEqual(1);
  });

  it("ignores degenerate polygons", () => {
    expect(
      sum(
        polygonCoverage(
          [
            { x: 0, y: 0 },
            { x: 3, y: 3 },
          ],
          4,
          4,
        ),
      ),
    ).toBe(0);
  });
});

describe("paintCoverage", () => {
  it("composites source-over in premultiplied space", () => {
    const t = createFloatRgba(2, 1);
    paintCoverage(t, Float32Array.from([1, 0.5]), 1, 0, 0);
    paintCoverage(t, Float32Array.from([0.5, 0]), 0, 0, 1);
    expect(Array.from(t.data)).toEqual([0.5, 0, 0.5, 1, 0.5, 0, 0, 0.5]);
  });
});

describe("gaussianKernel", () => {
  it("is normalised, symmetric and 3 sigma wide", () => {
    const k = gaussianKernel(2.5);
    expect(k).toHaveLength(2 * 8 + 1);
    expect(sum(k)).toBeCloseTo(1, 6);
    expect(k[0]).toBeCloseTo(k[16] as number, 9);
    expect(Math.max(...k)).toBe(k[8]);
  });
});

describe("gaussianBlurRgba", () => {
  it("keeps the total away from the edges and a constant interior", () => {
    const img = createFloatRgba(60, 60);
    paintCoverage(img, polygonCoverage(square(10, 10, 50, 50), 60, 60), 1, 0.5, 0);
    const out = gaussianBlurRgba(img, 3);
    const alpha = (b: typeof img) => Array.from(b.data).filter((_, i) => i % 4 === 3);
    expect(sum(alpha(out))).toBeCloseTo(sum(alpha(img)), 2);
    // Premultiplied channels keep their ratio, so the colour does not shift.
    const c = (30 * 60 + 30) * 4;
    expect(out.data[c + 3]).toBeCloseTo(1, 5);
    expect((out.data[c + 1] as number) / (out.data[c] as number)).toBeCloseTo(0.5, 5);
    // A straight edge at x = 10 blurs symmetrically: pixels 9 and 10 add up to 1.
    const a = (x: number) => out.data[(30 * 60 + x) * 4 + 3] as number;
    expect(a(9) + a(10)).toBeCloseTo(1, 5);
    expect(a(9)).toBeGreaterThan(0.3);
  });

  it("returns a copy for sigma 0", () => {
    const img = createFloatRgba(2, 2);
    img.data[3] = 1;
    const out = gaussianBlurRgba(img, 0);
    expect(out.data).not.toBe(img.data);
    expect(Array.from(out.data)).toEqual(Array.from(img.data));
  });
});

describe("toRgba8", () => {
  it("crops and un-premultiplies", () => {
    const img = createFloatRgba(3, 1);
    img.data.set([0, 0, 0, 0, 0.25, 0.5, 0, 0.5, 1, 1, 1, 1]);
    const out = toRgba8(img, 1, 0, 3, 1);
    expect(out.width).toBe(3);
    expect(Array.from(out.data)).toEqual([128, 255, 0, 128, 255, 255, 255, 255, 0, 0, 0, 0]);
  });
});
