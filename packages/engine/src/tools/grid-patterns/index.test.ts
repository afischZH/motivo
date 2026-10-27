import { describe, expect, it } from "vitest";
import {
  GRID_STYLES,
  MAX_GRID_POINTS,
  type GridPatternSvgOptions,
  effectiveGridCell,
  gridLattice,
  gridPatternSvg,
  isMajorLine,
} from "./index";

// Wall-clock timing for performance budgets in tests only; product code stays deterministic.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;

const opts: GridPatternSvgOptions = {
  width: 100,
  height: 100,
  background: "#ffffff",
  colors: ["#cccccc", "#333333"],
  style: "lines",
  lineStyle: "solid",
  cell: 20,
  weight: 0.05,
  majorEvery: 0,
  fade: "none",
};

describe("gridLattice", () => {
  it("centres the lines on the canvas and extends past the edges", () => {
    const { cell, xs } = gridLattice(100, 60, 20);
    expect(cell).toBe(20);
    expect(xs).toContainEqual({ pos: 50, index: 0 });
    expect(xs[0]?.pos).toBeLessThan(0);
    expect(xs[xs.length - 1]?.pos).toBeGreaterThan(100);
  });
});

describe("isMajorLine", () => {
  it("marks every n-th line including negative indices", () => {
    expect([-4, -2, 0, 2, 4].every((i) => isMajorLine(i, 2))).toBe(true);
    expect(isMajorLine(-3, 2)).toBe(false);
    expect(isMajorLine(0, 0)).toBe(false);
  });
});

describe("gridPatternSvg", () => {
  it("draws minor lines as one path", () => {
    const svg = gridPatternSvg(opts);
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toContain('stroke="#cccccc" stroke-width="1"');
    expect(svg).toContain("M50 -30V130");
  });

  it("adds a thicker major path in the second colour", () => {
    const svg = gridPatternSvg({ ...opts, majorEvery: 2 });
    expect(svg).toContain('stroke="#333333" stroke-width="2"');
  });

  it("applies dash patterns aligned to the cell", () => {
    expect(gridPatternSvg({ ...opts, lineStyle: "dashed" })).toContain(
      'stroke-dasharray="10 10" stroke-dashoffset="5"',
    );
    expect(gridPatternSvg({ ...opts, lineStyle: "dotted" })).toContain('stroke-dasharray="0 4"');
  });

  it("renders dots, crosses and squares", () => {
    const dots = gridPatternSvg({ ...opts, style: "dots" });
    expect(dots).toContain('<circle cx="50" cy="50" r="1"/>');
    expect(dots.match(/<circle /g)).toHaveLength(25);
    expect(gridPatternSvg({ ...opts, style: "crosses" })).toContain("M46 50H54M50 46V54");
    const squares = gridPatternSvg({ ...opts, style: "squares", majorEvery: 2 });
    expect(squares).toContain('<rect x="50.5" y="50.5" width="19" height="19"/>');
    expect(squares).toContain('<g fill="#333333">');
  });

  it("wraps the grid in a mask for fades and keeps the background outside", () => {
    for (const fade of ["radial", "edges"] as const) {
      const svg = gridPatternSvg({ ...opts, fade });
      expect(svg).toMatch(/<rect width="100" height="100" fill="#ffffff"\/><defs>/);
      expect(svg).toMatch(/<g mask="url\(#gm[0-9a-z]+\)">/);
    }
  });
});

describe("grid size guard", () => {
  it("keeps regular cells and floors tiny ones", () => {
    expect(effectiveGridCell({ width: 1080, height: 1080, cell: 54 })).toBe(54);
    expect(effectiveGridCell({ width: 100, height: 100, cell: 0.5 })).toBe(4);
  });

  for (const style of GRID_STYLES) {
    it(`stays bounded and fast on an extreme canvas (${style})`, () => {
      const start = clock.now();
      const svg = gridPatternSvg({
        ...opts,
        style,
        width: 8192,
        height: 8192,
        cell: 0.1,
        majorEvery: 3,
      });
      expect(clock.now() - start).toBeLessThan(500);
      const elements =
        (svg.match(/<(circle|rect)\b/g) ?? []).length + (svg.match(/H/g) ?? []).length;
      expect(elements).toBeLessThanOrEqual(MAX_GRID_POINTS + 2);
    });
  }
});
