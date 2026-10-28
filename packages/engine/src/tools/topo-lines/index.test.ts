import { describe, expect, it } from "vitest";
import { marchingSquares } from "../../contours";
import { pointCount } from "../../polyline";
import { createRng } from "../../rng";
import {
  TOPO_CROSSINGS_MAX,
  TOPO_GRID_CELLS_MAX,
  TOPO_POINTS_MAX,
  topoCrossings,
  topoField,
  topoLevels,
  topoSampler,
  topoSvg,
  type TopoSvgOptions,
} from "./index";

const base: Omit<TopoSvgOptions, "rng"> = {
  width: 480,
  height: 320,
  background: "#ffffff",
  colors: ["#2d6a4f", "#b08968"],
  scale: 0.6,
  octaves: 3,
  roughness: 0.5,
  warp: 0.3,
  levels: 8,
  style: "lines",
  colorMode: "gradient",
  lineWidth: 1.5,
  lineColor: "#111111",
  majorEvery: 4,
};

/** All coordinates of all path data in an SVG. */
function coordinates(svg: string): number[] {
  const out: number[] = [];
  for (const m of svg.matchAll(/ d="([^"]*)"/g)) {
    for (const n of (m[1] ?? "").matchAll(/-?\d+(?:\.\d+)?/g)) out.push(Number(n[0]));
  }
  return out;
}

describe("topoField", () => {
  it("is deterministic and pads the grid with a low ring", () => {
    const a = topoField({ ...base, rng: createRng(3) });
    const b = topoField({ ...base, rng: createRng(3) });
    expect(Array.from(a.values)).toEqual(Array.from(b.values));
    expect(a.values[0]).toBeLessThan(-1e8);
    expect(a.values[a.cols * a.rows - 1]).toBeLessThan(-1e8);
    expect(a.min).toBeGreaterThanOrEqual(-1);
    expect(a.max).toBeLessThanOrEqual(1);
    expect(a.max).toBeGreaterThan(a.min);
    // Real samples reach one cell beyond every edge of the canvas.
    expect(a.originX + a.cell).toBeLessThan(0);
    expect(a.originX + (a.cols - 2) * a.cell).toBeGreaterThan(base.width);
  });

  it("caps the grid for any canvas size", () => {
    for (const [width, height] of [
      [8192, 8192],
      [8192, 16],
      [16, 16],
    ] as const) {
      const f = topoField({ ...base, width, height, rng: createRng(1) });
      expect(f.cols * f.rows).toBeLessThanOrEqual(TOPO_GRID_CELLS_MAX + 4 * (f.cols + f.rows));
    }
  });
});

describe("main-thread budget (M4b-AP05)", () => {
  const extreme = { scale: 0.15, octaves: 6, roughness: 1, warp: 1 };

  it("counts exactly the points Marching Squares makes", () => {
    const f = topoField({ ...base, ...extreme, rng: createRng(2) });
    const levels = topoLevels(f.min, f.max, 12);
    let traced = 0;
    for (const l of levels) {
      for (const c of marchingSquares(f.values, f.cols, f.rows, l.value)) {
        traced += pointCount(c.points);
      }
    }
    expect(topoCrossings(f, levels)).toBe(traced);
    expect(topoCrossings(f, [])).toBe(0);
  });

  it("does not turn every cell of a very elongated canvas into a contour", () => {
    // Before, the feature size followed the 16 px edge: 670 000 crossings, 0.4 s.
    for (const [width, height] of [
      [8192, 16],
      [16, 8192],
    ] as const) {
      const f = topoField({ ...base, width, height, rng: createRng(1) });
      expect(topoCrossings(f, topoLevels(f.min, f.max, 18))).toBeLessThan(TOPO_CROSSINGS_MAX * 2);
    }
  });

  it("samples coarser until extreme params fit the crossings budget", () => {
    const o = { ...base, ...extreme, width: 1920, height: 1080, rng: createRng(1) };
    const sample = topoSampler(o);
    const fine = sample();
    expect(topoCrossings(fine, topoLevels(fine.min, fine.max, 40))).toBeGreaterThan(
      TOPO_CROSSINGS_MAX,
    );
    const coarse = sample(2);
    expect(coarse.cell).toBeCloseTo(fine.cell * 2, 9);
    expect(topoCrossings(coarse, topoLevels(coarse.min, coarse.max, 40))).toBeLessThan(
      topoCrossings(fine, topoLevels(fine.min, fine.max, 40)),
    );
    // The whole render keeps to the output budget (bands and lines share the path data).
    const svg = topoSvg({ ...o, levels: 40, style: "bands-lines" });
    expect(coordinates(svg).length / 2).toBeLessThanOrEqual(4 * TOPO_POINTS_MAX * 1.02);
  });
});

describe("topoLevels", () => {
  it("spaces levels evenly inside the range", () => {
    expect(topoLevels(0, 1, 3).map((l) => l.value)).toEqual([0.25, 0.5, 0.75]);
    expect(topoLevels(0, 1, 3).map((l) => l.position)).toEqual([1, 2, 3]);
  });

  it("shifts levels for the animation and keeps them inside", () => {
    const shifted = topoLevels(0, 1, 3, 0.5);
    expect(shifted.map((l) => l.value)).toEqual([0.125, 0.375, 0.625, 0.875]);
    expect(shifted.every((l) => l.value > 0 && l.value < 1)).toBe(true);
  });

  it("returns nothing for a flat field", () => {
    expect(topoLevels(0.3, 0.3, 5)).toEqual([]);
  });
});

describe("topoSvg", () => {
  it("is deterministic and draws one stroked path per level", () => {
    const a = topoSvg({ ...base, rng: createRng(1) });
    expect(topoSvg({ ...base, rng: createRng(1) })).toBe(a);
    expect(topoSvg({ ...base, rng: createRng(2) })).not.toBe(a);
    expect(a).toMatch(/^<svg /);
    expect(a).toContain('<g fill="none" stroke-width="1.5"');
    expect(a.match(/<path /g)).toHaveLength(8);
    // Every 4th line is an index line.
    expect(a.match(/stroke-width="3.75"/g)).toHaveLength(2);
  });

  it("fills bands with the even-odd rule and draws lines on top in bands-lines", () => {
    const bands = topoSvg({ ...base, style: "bands", rng: createRng(1) });
    expect(bands).toContain('<g fill-rule="evenodd">');
    expect(bands).not.toContain("stroke=");
    const both = topoSvg({ ...base, style: "bands-lines", rng: createRng(1) });
    expect(both).toContain('stroke="#111111"');
    expect(both.indexOf("evenodd")).toBeLessThan(both.indexOf('stroke="#111111"'));
  });

  it("cycles palette colours level by level", () => {
    const svg = topoSvg({
      ...base,
      colorMode: "cycle",
      colors: ["#ff0000", "#0000ff"],
      rng: createRng(1),
    });
    const strokes = [...svg.matchAll(/stroke="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(strokes.slice(0, 4)).toEqual(["#ff0000", "#0000ff", "#ff0000", "#0000ff"]);
  });

  it("moves the levels with t and loops back at t = 1", () => {
    const at0 = topoSvg({ ...base, rng: createRng(1) });
    expect(topoSvg({ ...base, t: 0, rng: createRng(1) })).toBe(at0);
    expect(topoSvg({ ...base, t: 1, rng: createRng(1) })).toBe(at0);
    expect(topoSvg({ ...base, t: 0.4, rng: createRng(1) })).not.toBe(at0);
  });

  it("stays within the point budget and the SVG size budget on extreme params", () => {
    const svg = topoSvg({
      ...base,
      width: 1920,
      height: 1080,
      levels: 40,
      octaves: 6,
      roughness: 1,
      warp: 1,
      scale: 0.15,
      style: "bands-lines",
      rng: createRng(1),
    });
    // Each point becomes a control point plus a midpoint, in the bands and again in the lines.
    expect(coordinates(svg).length / 2).toBeLessThanOrEqual(4 * TOPO_POINTS_MAX * 1.02); // plus one start point per loop
    expect(svg.length).toBeLessThan(3_000_000);
    const lines = topoSvg({
      ...base,
      width: 1920,
      height: 1080,
      levels: 40,
      octaves: 6,
      roughness: 1,
      warp: 1,
      scale: 0.15,
      rng: createRng(1),
    });
    expect(lines.length).toBeLessThan(1_500_000);
  });

  it("writes no background for transparent", () => {
    const svg = topoSvg({ ...base, background: "transparent", rng: createRng(1) });
    expect(svg).not.toContain("<rect");
  });
});
