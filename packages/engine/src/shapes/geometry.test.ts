import { describe, expect, it } from "vitest";
import {
  annulus,
  band,
  circleSlice,
  clipHalfPlane,
  disc,
  ellipse,
  lens,
  mirrorPts,
  movePts,
  poly,
  polar,
  radialPts,
  radialSmooth,
  rect,
  regular,
  rotatePts,
  roundedPoly,
  rrect,
  sector,
  shrinkPts,
  signedArea,
  smooth,
  squarePts,
  star,
  strokeOutline,
  type Pt,
} from "./geometry";
import { flattenPath, pathBounds, windingNumber } from "./path-data";

/** Signed area of the flattened first subpath: positive = clockwise on screen. */
const area = (d: string) => signedArea(flattenPath(d, 32)[0] ?? []);
const inside = (d: string, x: number, y: number) => windingNumber(flattenPath(d, 32), x, y) !== 0;

describe("point helpers", () => {
  it("polar, rotate, move, mirror and shrink", () => {
    const [x, y] = polar(10, 90);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(10);
    const [r] = rotatePts([[10, 0]], 90);
    expect(r?.[0]).toBeCloseTo(0);
    expect(r?.[1]).toBeCloseTo(10);
    expect(movePts([[1, 2]], 3, 4)).toEqual([[4, 6]]);
    const tri: Pt[] = [
      [0, 0],
      [10, 0],
      [0, 10],
    ];
    expect(signedArea(mirrorPts(tri))).toBeCloseTo(signedArea(tri));
    expect(shrinkPts(squarePts(10), 0.5)).toEqual(squarePts(5));
    expect(radialPts(4, 10)).toHaveLength(4);
    expect(radialPts(5, 10, 4)).toHaveLength(10);
  });

  it("clips polygons to half planes", () => {
    const half = clipHalfPlane(squarePts(10), 1, 0, 0);
    expect(Math.abs(signedArea(half))).toBeCloseTo(200);
    expect(clipHalfPlane(squarePts(10), 1, 0, -20)).toEqual([]);
  });
});

describe("solid helpers run clockwise, holes counter-clockwise", () => {
  const solids: [string, string, string][] = [
    ["poly", poly(squarePts(10)), poly(squarePts(10), true)],
    ["regular", regular(6, 20), regular(6, 20, -90, true)],
    ["star", star(5, 20, 8), star(5, 20, 8, -90, true)],
    ["disc", disc(0, 0, 20), disc(0, 0, 20, true)],
    ["ellipse", ellipse(0, 0, 20, 10, 30), ellipse(0, 0, 20, 10, 30, true)],
    ["rect", rect(-5, -5, 10, 10), rect(-5, -5, 10, 10, true)],
    ["rrect", rrect(-10, -10, 20, 20, 4), rrect(-10, -10, 20, 20, 4, true)],
    ["smooth", smooth(radialPts(6, 20)), smooth(radialPts(6, 20), 0.5, true)],
    ["roundedPoly", roundedPoly(radialPts(3, 20), 4), roundedPoly(radialPts(3, 20), 4, true)],
    ["lens", lens([0, -20], [0, 20], 8), lens([0, -20], [0, 20], 8, true)],
  ];
  it.each(solids)("%s", (_, solid, hole) => {
    expect(area(solid)).toBeGreaterThan(0);
    expect(area(hole)).toBeLessThan(0);
  });

  it("sector, band, slice and stroke outlines are clockwise", () => {
    for (const d of [
      sector(0, 0, 20, 0, 90),
      band(0, 0, 10, 20, 180, 360),
      circleSlice(20, -10, 5),
      strokeOutline(
        [
          [-20, 0],
          [0, 10],
          [20, 0],
        ],
        6,
      ),
      radialSmooth(8, () => 20),
    ]) {
      expect(area(d)).toBeGreaterThan(0);
    }
  });

  it("annulus leaves its centre empty", () => {
    const d = annulus(0, 0, 10, 20);
    expect(inside(d, 0, 0)).toBe(false);
    expect(inside(d, 15, 0)).toBe(true);
  });

  it("lens bulges by the given amount", () => {
    const b = pathBounds(lens([0, -20], [0, 20], 8));
    expect(b.maxX).toBeCloseTo(8, 1);
    expect(b.minX).toBeCloseTo(-8, 1);
  });

  it("sector and band cover the expected quarter", () => {
    expect(inside(sector(0, 0, 20, 0, 90), 5, 5)).toBe(true);
    expect(inside(sector(0, 0, 20, 0, 90), -5, 5)).toBe(false);
    expect(inside(band(0, 0, 10, 20, 180, 360), 0, -15)).toBe(true);
    expect(inside(band(0, 0, 10, 20, 180, 360), 0, -5)).toBe(false);
  });
});
