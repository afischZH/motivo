import { describe, expect, it } from "vitest";
import { poissonDisk } from "../poisson";
import { createRng } from "../rng";
import type { Vec2 } from "../vec";
import { delaunay, triangulationNeighbours } from "./delaunay";
import {
  clipPolygonHalfPlane,
  clipPolygonToRect,
  insetConvexPolygon,
  polygonArea,
  polygonCentroid,
  polygonPathData,
  rectPolygon,
  roundedPolygonPathData,
  smoothPolygonPathData,
  starPolygon,
} from "./polygon";
import { scatterDisks, wrapCopies } from "./scatter";
import { voronoiCells } from "./voronoi";

const square: Vec2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

const at = (pts: readonly Vec2[], i: number): Vec2 => {
  const p = pts[i];
  if (p === undefined) throw new Error(`no point ${i}`);
  return p;
};

/** Twice the signed area of a triangle (positive = counter-clockwise in y-up). */
const orient = (a: Vec2, b: Vec2, c: Vec2): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** Convex hull (monotone chain) without collinear points. */
function hull(points: readonly Vec2[]): Vec2[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Vec2[] = [];
  for (const q of p) {
    while (
      lower.length >= 2 &&
      orient(at(lower, lower.length - 2), at(lower, lower.length - 1), q) <= 0
    )
      lower.pop();
    lower.push(q);
  }
  const upper: Vec2[] = [];
  for (const q of [...p].reverse()) {
    while (
      upper.length >= 2 &&
      orient(at(upper, upper.length - 2), at(upper, upper.length - 1), q) <= 0
    )
      upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function randomPoints(seed: number, n: number, w = 500, h = 300): Vec2[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => ({ x: rng.float(0, w), y: rng.float(0, h) }));
}

describe("polygon helpers", () => {
  it("computes area and centroid", () => {
    expect(Math.abs(polygonArea(square))).toBe(100);
    expect(polygonArea([...square].reverse())).toBe(-polygonArea(square));
    expect(polygonCentroid(square)).toEqual({ x: 5, y: 5 });
    expect(
      polygonCentroid([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 4, y: 0 },
      ]),
    ).toEqual({ x: 2, y: 0 });
    expect(polygonCentroid([])).toEqual({ x: 0, y: 0 });
  });

  it("clips by a half-plane and to a rectangle", () => {
    const left = clipPolygonHalfPlane(square, 1, 0, 4);
    expect(Math.abs(polygonArea(left))).toBeCloseTo(40);
    expect(clipPolygonHalfPlane(square, 1, 0, -1)).toEqual([]);
    expect(clipPolygonHalfPlane(square, 1, 0, 20)).toEqual(square);
    const clipped = clipPolygonToRect(square, { x0: 5, y0: -5, x1: 20, y1: 8 });
    expect(Math.abs(polygonArea(clipped))).toBeCloseTo(40);
    expect(rectPolygon({ x0: 1, y0: 2, x1: 3, y1: 4 })).toHaveLength(4);
  });

  it("insets convex polygons in either orientation", () => {
    for (const poly of [square, [...square].reverse()]) {
      const inner = insetConvexPolygon(poly, 2);
      expect(Math.abs(polygonArea(inner))).toBeCloseTo(36);
      for (const p of inner) {
        expect(p.x).toBeGreaterThanOrEqual(2 - 1e-9);
        expect(p.x).toBeLessThanOrEqual(8 + 1e-9);
      }
    }
    expect(insetConvexPolygon(square, 5.1)).toEqual([]);
    expect(insetConvexPolygon(square, 0)).toEqual(square);
    // A thin triangle loses its sharp corner but stays convex and inside.
    const tri = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 10 },
    ];
    const t = insetConvexPolygon(tri, 1);
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(Math.abs(polygonArea(t))).toBeLessThan(Math.abs(polygonArea(tri)));
  });

  it("builds star polygons inside the bounding radius with increasing angles", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = createRng(seed);
      const before = createRng(seed);
      const c = { x: 20, y: -5 };
      const k = 3 + (seed % 6);
      const poly = starPolygon(rng, {
        center: c,
        radius: 10,
        vertices: k,
        irregularity: 1,
        rotation: 1,
      });
      expect(poly).toHaveLength(k);
      // Exactly two draws per vertex.
      for (let i = 0; i < 2 * k; i++) before.next();
      expect(rng.next()).toBe(before.next());
      // Angles relative to the first vertex grow strictly and stay within one turn.
      const first = at(poly, 0);
      const a0 = Math.atan2(first.y - c.y, first.x - c.x);
      let prev = -1e-9;
      for (const p of poly) {
        const r = Math.hypot(p.x - c.x, p.y - c.y);
        expect(r).toBeLessThanOrEqual(10 + 1e-9);
        expect(r).toBeGreaterThanOrEqual(4.5 - 1e-9);
        let a = Math.atan2(p.y - c.y, p.x - c.x) - a0;
        while (a < prev) a += 2 * Math.PI;
        expect(a).toBeLessThan(2 * Math.PI);
        prev = a + 1e-12;
      }
      // Simple polygon: area matches the sum of its fan triangles around the centre.
      let fan = 0;
      for (let i = 0; i < k; i++) fan += orient(c, at(poly, i), at(poly, (i + 1) % k)) / 2;
      expect(Math.abs(polygonArea(poly))).toBeCloseTo(Math.abs(fan));
    }
  });

  it("writes compact path data", () => {
    expect(polygonPathData(square)).toBe("M0 0L10 0L10 10L0 10Z");
    expect(
      polygonPathData([
        { x: 1.26, y: -0.04 },
        { x: 2, y: 2 },
        { x: 0, y: 3 },
      ]),
    ).toBe("M1.3 0L2 2L0 3Z");
    expect(polygonPathData([])).toBe("");
    expect(roundedPolygonPathData(square, 0)).toBe(polygonPathData(square));
    expect(roundedPolygonPathData(square, 2)).toBe(
      "M0 2Q0 0 2 0L8 0Q10 0 10 2L10 8Q10 10 8 10L2 10Q0 10 0 8Z",
    );
    // The cut never passes half an edge.
    expect(roundedPolygonPathData(square, 50)).toBe(
      "M0 5Q0 0 5 0L5 0Q10 0 10 5L10 5Q10 10 5 10L5 10Q0 10 0 5Z",
    );
    expect(smoothPolygonPathData(square)).toBe("M0 5Q0 0 5 0Q10 0 10 5Q10 10 5 10Q0 10 0 5Z");
  });
});

/** Checks a triangulation: orientation, edge use and Euler's count. */
function checkTriangulation(points: readonly Vec2[], tris: Uint32Array, hullCount: number) {
  const edges = new Map<string, number>();
  let area = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = at(points, tris[t] as number);
    const b = at(points, tris[t + 1] as number);
    const c = at(points, tris[t + 2] as number);
    const o = orient(a, b, c);
    expect(o).toBeGreaterThan(0);
    area += o / 2;
    for (const [u, v] of [
      [tris[t], tris[t + 1]],
      [tris[t + 1], tris[t + 2]],
      [tris[t + 2], tris[t]],
    ] as [number, number][]) {
      // A directed edge is used once; its reverse at most once.
      const key = `${u},${v}`;
      expect(edges.has(key)).toBe(false);
      edges.set(key, 1);
    }
  }
  let boundary = 0;
  for (const key of edges.keys()) {
    const [u, v] = key.split(",");
    if (!edges.has(`${v},${u}`)) boundary++;
  }
  expect(boundary).toBe(hullCount);
  expect(tris.length / 3).toBe(2 * points.length - 2 - hullCount);
  return area;
}

describe("delaunay", () => {
  it("handles tiny and degenerate inputs", () => {
    expect(delaunay([])).toHaveLength(0);
    expect(
      delaunay([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toHaveLength(0);
    expect(
      delaunay([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toHaveLength(0);
    expect(delaunay(square)).toHaveLength(6);
    expect(() =>
      delaunay([
        { x: 0, y: 0 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 0 },
      ]),
    ).toThrow();
  });

  it("skips exact duplicates", () => {
    const tris = delaunay([...square, { x: 10, y: 10 }]);
    expect(tris).toHaveLength(6);
    expect([...tris]).not.toContain(4);
  });

  it.each([1, 2, 3, 4, 5])(
    "is a valid Delaunay triangulation of random points (seed %i)",
    (seed) => {
      const points = randomPoints(seed, 150 + seed * 30);
      const tris = delaunay(points);
      const h = hull(points);
      const area = checkTriangulation(points, tris, h.length);
      expect(area).toBeCloseTo(Math.abs(polygonArea(h)), 6);
      // Empty circumcircles (brute force).
      let violations = 0;
      for (let t = 0; t < tris.length; t += 3) {
        const a = at(points, tris[t] as number);
        const b = at(points, tris[t + 1] as number);
        const c = at(points, tris[t + 2] as number);
        for (let i = 0; i < points.length; i++) {
          if (i === tris[t] || i === tris[t + 1] || i === tris[t + 2]) continue;
          const d = at(points, i);
          const adx = a.x - d.x;
          const ady = a.y - d.y;
          const bdx = b.x - d.x;
          const bdy = b.y - d.y;
          const cdx = c.x - d.x;
          const cdy = c.y - d.y;
          const det =
            (adx * adx + ady * ady) * (bdx * cdy - cdx * bdy) -
            (bdx * bdx + bdy * bdy) * (adx * cdy - cdx * ady) +
            (cdx * cdx + cdy * cdy) * (adx * bdy - bdx * ady);
          if (det > 1e-6) violations++;
        }
      }
      expect(violations).toBe(0);
    },
  );

  it("covers a rectangle exactly when framed by collinear edge points", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const inner = poissonDisk({ width: 400, height: 260, minDistance: 18, rng: createRng(seed) });
      const frame: Vec2[] = [];
      for (let x = -20; x < 420; x += 20) frame.push({ x, y: -20 }, { x: x + 20, y: 280 });
      for (let y = -20; y < 280; y += 20) frame.push({ x: 420, y }, { x: -20, y: y + 20 });
      const points = [...inner.map((p) => ({ x: p.x, y: p.y + 0 })), ...frame];
      const tris = delaunay(points);
      const area = checkTriangulation(points, tris, frame.length);
      expect(area).toBeCloseTo(440 * 300, 4);
    }
  });

  it("triangulates a jittered lattice with many near co-circular points", () => {
    const rng = createRng(7);
    const points: Vec2[] = [];
    for (let y = 0; y < 30; y++)
      for (let x = 0; x < 30; x++)
        points.push({ x: x * 10 + rng.float(-1e-3, 1e-3), y: y * 10 + rng.float(-1e-3, 1e-3) });
    const tris = delaunay(points);
    const h = hull(points);
    expect(tris.length / 3).toBeGreaterThan(1600);
    let area = 0;
    for (let t = 0; t < tris.length; t += 3) {
      area +=
        orient(
          at(points, tris[t] as number),
          at(points, tris[t + 1] as number),
          at(points, tris[t + 2] as number),
        ) / 2;
    }
    expect(area).toBeCloseTo(Math.abs(polygonArea(h)), 2);
  });

  it("is deterministic and lists neighbours", () => {
    const points = randomPoints(9, 80);
    expect(delaunay(points)).toEqual(delaunay(points));
    const nb = triangulationNeighbours(delaunay(square), 4);
    expect(nb.map((n) => n.length).sort()).toEqual([2, 2, 3, 3]);
  });
});

describe("voronoiCells", () => {
  const bounds = { x0: -10, y0: -10, x1: 510, y1: 310 };

  it.each([1, 2, 3])(
    "tiles the rectangle with convex cells around their sites (seed %i)",
    (seed) => {
      const sites = randomPoints(seed, 300);
      const cells = voronoiCells(sites, bounds);
      expect(cells).toHaveLength(sites.length);
      let total = 0;
      cells.forEach((cell, i) => {
        expect(cell.length).toBeGreaterThanOrEqual(3);
        const area = polygonArea(cell);
        total += Math.abs(area);
        // Convex with one orientation.
        for (let k = 0; k < cell.length; k++) {
          const o = orient(
            at(cell, k),
            at(cell, (k + 1) % cell.length),
            at(cell, (k + 2) % cell.length),
          );
          expect(o * Math.sign(area)).toBeGreaterThanOrEqual(-1e-6);
        }
        // The centroid and every vertex are nearest to (or tied with) the own site.
        const own = at(sites, i);
        let closer = 0;
        for (const p of [polygonCentroid(cell), ...cell]) {
          const d = Math.hypot(p.x - own.x, p.y - own.y);
          for (const s of sites) if (Math.hypot(p.x - s.x, p.y - s.y) < d - 1e-6) closer++;
        }
        expect(closer).toBe(0);
      });
      expect(total).toBeCloseTo(520 * 320, 3);
    },
  );

  it("handles one site, duplicates and empty bounds", () => {
    expect(voronoiCells([{ x: 1, y: 1 }], bounds)[0]).toHaveLength(4);
    const dup = voronoiCells(
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
        { x: 50, y: 50 },
      ],
      bounds,
    );
    expect(dup[1]).toEqual([]);
    expect(dup[0]?.length).toBeGreaterThanOrEqual(3);
    expect(voronoiCells([{ x: 1, y: 1 }], { x0: 0, y0: 0, x1: 0, y1: 5 })).toEqual([[]]);
    expect(voronoiCells([], bounds)).toEqual([]);
  });
});

describe("scatterDisks", () => {
  const classes = [
    { radius: 30, variance: 0.3, count: 20 },
    { radius: 12, variance: 0.3, count: 80 },
    { radius: 3, variance: 0.5, count: 400 },
  ];

  it.each([false, true])("never overlaps (wrap %s)", (wrap) => {
    for (const seed of [1, 2, 3]) {
      const w = 320;
      const h = 240;
      const disks = scatterDisks({
        width: w,
        height: h,
        classes,
        gap: 2,
        wrap,
        rng: createRng(seed),
      });
      expect(disks.length).toBeGreaterThan(100);
      let overlaps = 0;
      for (let i = 0; i < disks.length; i++) {
        const a = disks[i];
        if (!a) continue;
        if (wrap) {
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.x).toBeLessThan(w);
        }
        for (let j = i + 1; j < disks.length; j++) {
          const b = disks[j];
          if (!b) continue;
          let dx = Math.abs(a.x - b.x);
          let dy = Math.abs(a.y - b.y);
          if (wrap) {
            dx = Math.min(dx, w - dx);
            dy = Math.min(dy, h - dy);
          }
          if (Math.hypot(dx, dy) < a.r + b.r + 2 - 1e-9) overlaps++;
        }
      }
      expect(overlaps).toBe(0);
      // Classes in order, never more than requested.
      for (const [ci, c] of classes.entries()) {
        expect(disks.filter((d) => d.cls === ci).length).toBeLessThanOrEqual(c.count);
      }
    }
  });

  it("is deterministic and handles empty input", () => {
    const run = () =>
      scatterDisks({ width: 100, height: 100, classes, gap: 0, wrap: true, rng: createRng(4) });
    expect(run()).toEqual(run());
    expect(
      scatterDisks({ width: 0, height: 10, classes, gap: 0, wrap: false, rng: createRng(1) }),
    ).toEqual([]);
    expect(
      scatterDisks({ width: 10, height: 10, classes: [], gap: 0, wrap: false, rng: createRng(1) }),
    ).toEqual([]);
  });

  it("lists wrap copies across crossed edges", () => {
    expect(wrapCopies(50, 50, 10, 100, 100)).toEqual([{ dx: 0, dy: 0 }]);
    expect(wrapCopies(5, 50, 10, 100, 100)).toEqual([
      { dx: 0, dy: 0 },
      { dx: 100, dy: 0 },
    ]);
    expect(wrapCopies(95, 95, 10, 100, 100)).toHaveLength(4);
  });
});
