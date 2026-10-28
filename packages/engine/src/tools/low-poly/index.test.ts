import { describe, expect, it } from "vitest";
import { hexToRgb, rgbToOklab } from "../../color";
import { clipPolygonToRect, delaunay, polygonArea } from "../../geometry";
import { createRng } from "../../rng";
import {
  LOW_POLY_POINTS_MAX,
  LOW_POLY_SPACING_MIN_PX,
  lowPolyColorField,
  lowPolyFaces,
  lowPolyPoints,
  lowPolySpacing,
  lowPolySvg,
  type LowPolyOptions,
} from "./index";

const base = (patch: Partial<LowPolyOptions> = {}): LowPolyOptions => ({
  width: 600,
  height: 400,
  rng: createRng(1),
  background: "#101010",
  colors: ["#0b3d91", "#00d2ff", "#f5f7fa"],
  mode: "delaunay",
  distribution: "poisson",
  spacing: 50,
  jitter: 0.5,
  gradient: "linear",
  angle: 90,
  variance: 0.2,
  lighting: 0.4,
  lightAngle: 315,
  strokeWidth: 0,
  strokeColor: "#ffffff",
  strokeOpacity: 1,
  gap: 0,
  rounding: 0,
  ...patch,
});

const canvasArea = (o: LowPolyOptions): number => o.width * o.height;
const clippedArea = (faces: { poly: { x: number; y: number }[] }[], o: LowPolyOptions): number =>
  faces.reduce(
    (sum, f) =>
      sum +
      Math.abs(polygonArea(clipPolygonToRect(f.poly, { x0: 0, y0: 0, x1: o.width, y1: o.height }))),
    0,
  );

describe("lowPolySpacing", () => {
  it("keeps the wanted spacing on normal canvases and grows it on huge ones", () => {
    expect(lowPolySpacing(1080, 1080, 60, "poisson")).toBe(60);
    expect(lowPolySpacing(100, 100, 1, "grid")).toBe(LOW_POLY_SPACING_MIN_PX);
    expect(lowPolySpacing(8192, 8192, 6, "grid")).toBeGreaterThan(100);
    expect(() => lowPolySpacing(10, 10, 0, "grid")).toThrow(RangeError);
  });

  it.each(["poisson", "grid"] as const)("never passes the point cap (%s)", (distribution) => {
    for (const [w, h] of [
      [8192, 8192],
      [8192, 200],
      [1920, 1080],
      [64, 64],
    ] as const) {
      const pts = lowPolyPoints({
        width: w,
        height: h,
        spacing: 1,
        distribution,
        jitter: 1,
        rng: createRng(1),
      });
      expect(pts.points.length, `${w}x${h}`).toBeLessThanOrEqual(LOW_POLY_POINTS_MAX);
    }
  });
});

describe("lowPolyPoints", () => {
  it("puts sites around the canvas and a frame one spacing outside", () => {
    for (const distribution of ["poisson", "grid"] as const) {
      const pts = lowPolyPoints({
        width: 300,
        height: 200,
        spacing: 30,
        distribution,
        jitter: 1,
        rng: createRng(2),
      });
      const sites = pts.points.slice(0, pts.sites);
      const frame = pts.points.slice(pts.sites);
      for (const p of sites) {
        expect(p.x).toBeGreaterThanOrEqual(-15 - 14);
        expect(p.x).toBeLessThanOrEqual(315 + 14);
      }
      for (const p of frame) {
        const onEdge = p.x === -30 || p.x === 330 || p.y === -30 || p.y === 230;
        expect(onEdge).toBe(true);
      }
      expect(frame).toContainEqual({ x: -30, y: -30 });
      expect(frame).toContainEqual({ x: 330, y: 230 });
    }
  });

  it("moves sites on closed loops for animation", () => {
    const o = {
      width: 300,
      height: 200,
      spacing: 30,
      distribution: "poisson" as const,
      jitter: 0,
      rng: createRng(3),
    };
    const still = lowPolyPoints({ ...o, rng: createRng(3) });
    expect(lowPolyPoints({ ...o, rng: createRng(3), t: 0 })).toEqual(still);
    const moved = lowPolyPoints({ ...o, rng: createRng(3), t: 0.5 });
    expect(moved.points).not.toEqual(still.points);
    // The frame stays, sites move by at most twice the loop radius.
    expect(moved.points.slice(still.sites)).toEqual(still.points.slice(still.sites));
    still.points.slice(0, still.sites).forEach((p, i) => {
      const q = moved.points[i];
      if (!q) throw new Error("missing point");
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThanOrEqual(2 * 0.25 * 30 + 1e-9);
    });
  });
});

describe("lowPolyColorField", () => {
  const colors = ["#000000", "#ffffff"];
  const lab = (hex: string) => rgbToOklab(hexToRgb(hex));

  it("runs linear gradients along the angle", () => {
    const field = lowPolyColorField({
      width: 100,
      height: 50,
      colors,
      gradient: "linear",
      angle: 90,
      rng: createRng(1),
    });
    expect(field({ x: 0, y: 25 }).l).toBeCloseTo(lab("#000000").l);
    expect(field({ x: 100, y: 25 }).l).toBeCloseTo(lab("#ffffff").l);
    expect(field({ x: 50, y: 0 }).l).toBeCloseTo(field({ x: 50, y: 50 }).l);
  });

  it("runs radial gradients from the centre and blends mesh anchors", () => {
    const radial = lowPolyColorField({
      width: 100,
      height: 100,
      colors,
      gradient: "radial",
      angle: 0,
      rng: createRng(1),
    });
    expect(radial({ x: 50, y: 50 }).l).toBeCloseTo(0);
    expect(radial({ x: 0, y: 0 }).l).toBeCloseTo(1);
    const mesh = lowPolyColorField({
      width: 100,
      height: 100,
      colors,
      gradient: "mesh",
      angle: 0,
      rng: createRng(1),
    });
    const l = mesh({ x: 30, y: 70 }).l;
    expect(l).toBeGreaterThan(0);
    expect(l).toBeLessThan(1);
    expect(() =>
      lowPolyColorField({
        width: 1,
        height: 1,
        colors: [],
        gradient: "mesh",
        angle: 0,
        rng: createRng(1),
      }),
    ).toThrow();
  });
});

describe("lowPolyFaces", () => {
  it.each(["poisson", "grid"] as const)(
    "Delaunay triangles cover the canvas without overlap (%s)",
    (distribution) => {
      for (let seed = 1; seed <= 12; seed++) {
        const o = base({
          distribution,
          rng: createRng(seed),
          jitter: seed % 2 === 0 ? 0 : 0.8,
          spacing: 20 + seed * 7,
        });
        const faces = lowPolyFaces(o);
        expect(clippedArea(faces, o)).toBeCloseTo(canvasArea(o), 3);
      }
    },
  );

  it("covers the canvas with Voronoi cells", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const o = base({ mode: "voronoi", rng: createRng(seed), spacing: 20 + seed * 7 });
      expect(clippedArea(lowPolyFaces(o), o)).toBeCloseTo(canvasArea(o), 3);
    }
  });

  it("leaves gaps that shrink the covered area", () => {
    for (const mode of ["delaunay", "voronoi"] as const) {
      const o = base({ mode, gap: 6 });
      const area = clippedArea(lowPolyFaces(o), o);
      expect(area).toBeLessThan(canvasArea(o) * 0.95);
      expect(area).toBeGreaterThan(canvasArea(o) * 0.4);
    }
  });

  it("matches the triangulation of its points", () => {
    const o = base();
    const pts = lowPolyPoints({
      width: o.width,
      height: o.height,
      spacing: o.spacing,
      distribution: o.distribution,
      jitter: o.jitter,
      rng: createRng(1),
    });
    expect(delaunay(pts.points).length / 3).toBeGreaterThanOrEqual(lowPolyFaces(o).length);
  });

  it("keeps face colours when only the lighting changes the shade", () => {
    const flat = lowPolyFaces(base({ lighting: 0, variance: 0 }));
    const lit = lowPolyFaces(base({ lighting: 1, variance: 0 }));
    expect(lit.map((f) => f.poly)).toEqual(flat.map((f) => f.poly));
    expect(lit.map((f) => f.color)).not.toEqual(flat.map((f) => f.color));
  });
});

describe("lowPolySvg", () => {
  it("is deterministic and compact", () => {
    const a = lowPolySvg(base());
    expect(lowPolySvg(base())).toBe(a);
    expect(lowPolySvg(base({ rng: createRng(2) }))).not.toBe(a);
    expect(a).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="600" height="400"/);
    // Seams hidden by a same-colour stroke when there is no outline and no gap.
    expect(a).toContain('<g stroke-width="0.6" stroke-linejoin="round">');
    expect(a).not.toMatch(/\d\.\d\d/);
  });

  it("draws outlines, gaps and rounded corners", () => {
    const outlined = lowPolySvg(base({ strokeWidth: 1.5, strokeOpacity: 0.5 }));
    expect(outlined).toContain(
      '<g stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" stroke-opacity="0.5">',
    );
    const rounded = lowPolySvg(base({ mode: "voronoi", gap: 4, rounding: 8 }));
    expect(rounded).toContain("Q");
    expect(rounded).toContain("<g><path");
    expect(lowPolySvg(base({ background: "transparent" }))).not.toContain("<rect");
  });

  it("stays under 1.5 MB at the caps", () => {
    for (const mode of ["delaunay", "voronoi"] as const) {
      const svg = lowPolySvg(
        base({
          mode,
          width: 8192,
          height: 8192,
          spacing: 1,
          gap: 2,
          rounding: 4,
          strokeWidth: 1,
          strokeOpacity: 0.5,
        }),
      );
      expect(svg.length).toBeLessThan(1_500_000);
    }
  });
});
