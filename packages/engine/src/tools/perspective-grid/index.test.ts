import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import { MESH_FILTER_SIGMA_MAX, MESH_OUTPUT_EDGE_MAX } from "../mesh-gradient";
import {
  PERSPECTIVE_COLUMNS_MAX,
  PERSPECTIVE_MOUNTAIN_POINTS,
  PERSPECTIVE_ROWS_MAX,
  mountainRidge,
  perspectiveCamera,
  perspectiveFade,
  perspectiveFadeStops,
  perspectiveGlowSigma,
  perspectiveGridSvg,
  perspectiveLines,
  sunBands,
  type PerspectiveGridOptions,
} from "./index";

const options = (patch: Partial<PerspectiveGridOptions> = {}): PerspectiveGridOptions => ({
  width: 960,
  height: 540,
  rng: createRng(1),
  sky: ["#0a0118", "#ff4f9a"],
  ground: "#12002b",
  horizon: 0.55,
  tilt: 0,
  fov: 90,
  cameraHeight: 1.6,
  cellDepth: 1,
  distance: 40,
  lineWidth: 2.5,
  taper: 0.7,
  lineColor: "#ff3ccf",
  fade: 0.6,
  glow: 0.6,
  haze: 0.4,
  ceiling: false,
  sun: true,
  sunSize: 0.24,
  sunRise: 0.45,
  sunStripes: 6,
  sunColors: ["#ffe66d", "#ff2a6d"],
  stars: 0.35,
  starColor: "#ffffff",
  mountains: 0.12,
  mountainColor: "#1d0638",
  ...patch,
});

/** Every number in a path, in order. */
const numbers = (d: string): number[] => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);

/** y values of a path made of `M x y`, `L x y`, `H x` and `V y` commands. */
function pathYs(d: string): number[] {
  const ys: number[] = [];
  for (const m of d.matchAll(/([MLV])(-?[\d.]+)(?: (-?[\d.]+))?/g)) {
    ys.push(Number(m[1] === "V" ? m[2] : m[3]));
  }
  return ys;
}

describe("perspectiveCamera", () => {
  it("matches the canvas without tilt and grows the frame with it", () => {
    const flat = perspectiveCamera(options());
    expect(flat.frameWidth).toBeCloseTo(960);
    expect(flat.frameHeight).toBeCloseTo(540);
    expect(flat.horizonY).toBeCloseTo(0.55 * 540);
    const tilted = perspectiveCamera(options({ tilt: 20 }));
    expect(tilted.frameWidth).toBeGreaterThan(960);
    expect(tilted.frameHeight).toBeGreaterThan(540);
    expect(tilted.offsetX).toBeLessThan(0);
  });

  it("ends the floor at the row distance or where rows get too dense", () => {
    const cam = perspectiveCamera(options({ distance: 10 }));
    expect(cam.far).toBeCloseTo(cam.nearFloor + 10 * cam.rowSpacing);
    const dense = perspectiveCamera(options({ distance: 120 }));
    expect(dense.far).toBeLessThan(dense.nearFloor + 120 * dense.rowSpacing);
    expect(dense.far).toBeGreaterThan(dense.nearFloor);
  });

  it.each([
    { width: 8192, height: 16 },
    { width: 16, height: 8192 },
    { width: 8192, height: 8192 },
  ])("stays finite at %o", (size) => {
    const cam = perspectiveCamera(options({ ...size, fov: 140, cameraHeight: 8, tilt: -30 }));
    for (const v of Object.values(cam)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("perspectiveFade", () => {
  it("is opaque near, transparent at the far end and never rises", () => {
    const cam = perspectiveCamera(options());
    expect(perspectiveFade(cam, 0.6, cam.nearFloor)).toBe(1);
    expect(perspectiveFade(cam, 0.6, cam.far)).toBe(0);
    let last = 1;
    for (let d = cam.nearFloor; d <= cam.far; d += 0.5) {
      const o = perspectiveFade(cam, 0.6, d);
      expect(o).toBeLessThanOrEqual(last);
      last = o;
    }
    // Even without fade a short ramp hides rows entering at the far end.
    expect(perspectiveFade(cam, 0, cam.far * 0.99)).toBeLessThan(0.5);
  });

  it("gives sorted gradient stops, transparent at the horizon", () => {
    const cam = perspectiveCamera(options({ ceiling: true }));
    const stops = perspectiveFadeStops(cam, 0.6);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]?.[0]).toBeGreaterThanOrEqual(stops[i - 1]?.[0] ?? 0);
    }
    for (const [offset] of stops) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(1);
    }
    const horizon = stops.find(([o]) => Math.abs(o - cam.horizonY / cam.frameHeight) < 1e-9);
    expect(horizon?.[1]).toBe(0);
  });
});

describe("perspectiveLines", () => {
  it("keeps floor lines below and ceiling lines above the horizon", () => {
    const cam = perspectiveCamera(options());
    const floor = perspectiveLines(cam, { lineWidth: 2, taper: 0.5 }, 1);
    const ceiling = perspectiveLines(cam, { lineWidth: 2, taper: 0.5 }, -1);
    expect(floor.rows).toBeGreaterThan(5);
    expect(floor.columns).toBeGreaterThan(5);
    for (const y of pathYs(floor.d)) expect(y).toBeGreaterThan(cam.horizonY);
    for (const y of pathYs(ceiling.d)) expect(y).toBeLessThan(cam.horizonY);
    expect(numbers(floor.d).every(Number.isFinite)).toBe(true);
    expect(floor.d).not.toMatch(/NaN|Infinity/);
  });

  it("loops seamlessly: t = 1 equals t = 0", () => {
    const cam = perspectiveCamera(options());
    const a = perspectiveLines(cam, { lineWidth: 2, taper: 0.7, t: 0 }, 1);
    const b = perspectiveLines(cam, { lineWidth: 2, taper: 0.7, t: 1 }, 1);
    const mid = perspectiveLines(cam, { lineWidth: 2, taper: 0.7, t: 0.5 }, 1);
    expect(b.d).toBe(a.d);
    expect(mid.d).not.toBe(a.d);
  });

  it("caps rows and columns on extreme canvases", () => {
    for (const size of [
      { width: 8192, height: 16 },
      { width: 8192, height: 8192 },
    ]) {
      const cam = perspectiveCamera(
        options({ ...size, fov: 140, cameraHeight: 0.25, cellDepth: 0.25, distance: 120 }),
      );
      const lines = perspectiveLines(cam, { lineWidth: 0.5, taper: 0 }, 1);
      expect(lines.rows).toBeLessThanOrEqual(PERSPECTIVE_ROWS_MAX + 1);
      expect(lines.columns).toBeLessThanOrEqual(PERSPECTIVE_COLUMNS_MAX);
      expect(lines.d).not.toMatch(/NaN|Infinity/);
    }
  });

  it("thins lines with depth when tapered", () => {
    const cam = perspectiveCamera(options());
    const rowHeights = (taper: number): number[] =>
      [
        ...perspectiveLines(cam, { lineWidth: 4, taper }, 1).d.matchAll(
          /M[^ ]+ ([\d.]+)H[^V]+V([\d.]+)/g,
        ),
      ].map((m) => Number(m[2]) - Number(m[1]));
    const flat = rowHeights(0);
    expect(Math.max(...flat) - Math.min(...flat)).toBeLessThan(0.02);
    const tapered = rowHeights(1);
    expect(Math.min(...tapered)).toBeLessThan(Math.max(...tapered) / 3);
  });
});

describe("perspectiveGlowSigma", () => {
  it("keeps the blur within the browser-safe range at the largest export", () => {
    expect(perspectiveGlowSigma(1920, 1080, 6)).toBe(6);
    const small = perspectiveGlowSigma(320, 180, 50);
    expect(small).toBeCloseTo((MESH_FILTER_SIGMA_MAX * 320) / MESH_OUTPUT_EDGE_MAX);
    expect(perspectiveGlowSigma(100, 100, Number.NaN)).toBe(0);
  });
});

describe("sunBands", () => {
  it("cuts growing stripes and stops at the horizon", () => {
    const bands = sunBands(100, 100, 50, 5, 130);
    expect(bands).toHaveLength(6);
    for (const [, y, , h] of bands) expect(y + h).toBeLessThanOrEqual(130 + 1e-9);
    const gaps = bands.slice(1).map(([, y], i) => {
      const prev = bands[i] as readonly [number, number, number, number];
      return y - (prev[1] + prev[3]);
    });
    for (let i = 2; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1] ?? 0);
    expect(sunBands(100, 100, 50, 0, 1000)).toEqual([[50, 50, 100, 100]]);
    expect(sunBands(100, 100, 50, 4, 40)).toEqual([]);
  });
});

describe("mountainRidge", () => {
  it("is deterministic, bounded and lower in the middle", () => {
    const a = mountainRidge(createRng(3), 100);
    expect(a).toEqual(mountainRidge(createRng(3), 100));
    expect(a).toHaveLength(PERSPECTIVE_MOUNTAIN_POINTS);
    for (const h of a) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(100);
    }
    const mid = Math.floor(a.length / 2);
    const centre = Math.max(...a.slice(mid - 8, mid + 8));
    expect(centre).toBeLessThanOrEqual(36);
  });
});

describe("perspectiveGridSvg", () => {
  it("is deterministic and well formed", () => {
    const a = perspectiveGridSvg(options());
    expect(a).toBe(perspectiveGridSvg(options()));
    expect(a.startsWith("<svg")).toBe(true);
    expect(a).toContain("<feGaussianBlur");
    expect(a).toContain("<clipPath");
    expect(a).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("keeps the stars when the mountains change and vice versa", () => {
    const stars = (svg: string): string =>
      svg.match(/<circle cx[^>]*r="[\d.]+"\/>/g)?.join("") ?? "";
    const a = perspectiveGridSvg(options());
    const b = perspectiveGridSvg(options({ mountains: 0 }));
    expect(stars(b)).toBe(stars(a));
  });

  it("drops the optional layers when off", () => {
    const svg = perspectiveGridSvg(
      options({ sun: false, stars: 0, mountains: 0, glow: 0, haze: 0, ground: "transparent" }),
    );
    expect(svg).not.toContain("<circle");
    expect(svg).not.toContain("<filter");
    expect(svg).not.toContain("clipPath");
  });

  it("rotates the scene for a tilted camera", () => {
    expect(perspectiveGridSvg(options({ tilt: 10 }))).toContain('transform="rotate(10 480 270)');
  });

  it("stays small and finite for random params and sizes", () => {
    const rng = createRng(9);
    for (let i = 0; i < 40; i++) {
      const svg = perspectiveGridSvg(
        options({
          rng: createRng(i),
          width: rng.pick([16, 320, 1920, 8192]),
          height: rng.pick([16, 240, 1080, 8192]),
          horizon: rng.float(0.15, 0.85),
          tilt: rng.float(-30, 30),
          fov: rng.float(30, 140),
          cameraHeight: rng.float(0.25, 8),
          cellDepth: rng.float(0.25, 4),
          distance: rng.int(8, 120),
          lineWidth: rng.float(0.5, 12),
          taper: rng.next(),
          ceiling: rng.bool(),
          sunRise: rng.float(-0.5, 1.2),
          sunStripes: rng.int(0, 12),
          stars: rng.next(),
          mountains: rng.float(0, 0.4),
          t: rng.next(),
        }),
      );
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      expect(svg.length).toBeLessThan(400_000);
    }
  });
});
