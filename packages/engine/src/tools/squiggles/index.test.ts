import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  SQUIGGLE_COUNT_MAX,
  SQUIGGLE_LAYOUTS,
  SQUIGGLE_STYLES,
  type SquiggleOptions,
  squigglePath,
  squigglesSvg,
  squiggleTileSvg,
} from "./index";

const opts = (o: Partial<SquiggleOptions> = {}): SquiggleOptions => ({
  width: 1200,
  height: 600,
  background: "#ffffff",
  colors: ["#111827", "#ef4444"],
  style: "wave",
  layout: "stack",
  count: 6,
  wavelength: 0.1,
  amplitude: 0.04,
  stroke: 0.01,
  length: 0.2,
  angle: 0,
  rng: createRng(1),
  ...o,
});

describe("squigglePath", () => {
  it("draws every style", () => {
    for (const style of SQUIGGLE_STYLES) {
      expect(squigglePath(style, 0, 3, 40, 10, createRng(1))).toMatch(/^M/);
    }
  });

  it("caps the number of waves", () => {
    const d = squigglePath("zigzag", 0, 1e6, 1, 1);
    expect(d.length).toBeLessThan(20_000);
  });
});

describe("squigglesSvg", () => {
  it("renders every layout and style", () => {
    for (const layout of SQUIGGLE_LAYOUTS) {
      for (const style of SQUIGGLE_STYLES) {
        const svg = squigglesSvg(opts({ layout, style }));
        expect(svg).toContain("stroke-linecap");
      }
    }
  });

  it("shares one path between stacked lines", () => {
    const svg = squigglesSvg(opts({ count: 10 }));
    expect(svg.match(/<use /g)).toHaveLength(10);
  });

  it("keeps scattered squiggles when the count changes", () => {
    const few = squigglesSvg(opts({ layout: "scatter", count: 3 }));
    const many = squigglesSvg(opts({ layout: "scatter", count: SQUIGGLE_COUNT_MAX }));
    const firstPaths = (s: string) => s.match(/<path d="[^"]+" transform="[^"]+"/g)?.slice(0, 3);
    expect(firstPaths(many)).toEqual(firstPaths(few));
  });

  it("loops after one wavelength", () => {
    expect(squigglesSvg(opts({ t: 0 }))).toBe(squigglesSvg(opts()));
    expect(squigglesSvg(opts({ t: 0.25 }))).not.toBe(squigglesSvg(opts()));
  });
});

describe("squiggleTileSvg", () => {
  it("is one wavelength wide and falls back to a wave for scribbles", () => {
    const tile = squiggleTileSvg({
      style: "scribble",
      lambda: 20,
      amp: 6,
      stroke: 2,
      color: "#000",
    });
    expect(tile.width).toBe(20);
    expect(tile.svg).toContain('width="20"');
    expect(tile.svg).toContain("Q");
  });
});
