import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  BAUHAUS_FIGURES,
  type BauhausOptions,
  bauhausCells,
  bauhausFigurePath,
  bauhausGrid,
  bauhausSvg,
} from "./index";

const opts = (o: Partial<BauhausOptions> = {}): BauhausOptions => ({
  width: 1200,
  height: 800,
  background: "#f5f0e6",
  colors: ["#e63946", "#1d3557", "#f4a261", "#2a9d8f"],
  set: "mixed",
  columns: 6,
  gap: 0,
  density: 0.8,
  radius: 0,
  rng: createRng(1),
  ...o,
});

describe("bauhausGrid", () => {
  it("fills the height with square cells", () => {
    expect(bauhausGrid({ width: 1200, height: 800, columns: 6 })).toEqual({
      cols: 6,
      rows: 4,
      cell: 200,
    });
  });
});

describe("bauhausCells", () => {
  it("never paints a figure in its tile colour", () => {
    for (const c of bauhausCells(opts({ density: 1 }))) expect(c.color).not.toBe(c.tile);
  });

  it("leaves tiles blank without density", () => {
    expect(bauhausCells(opts({ density: 0 })).every((c) => c.figure === null)).toBe(true);
  });

  it("only uses curved figures in the curves set", () => {
    const figures = new Set(bauhausCells(opts({ set: "curves", density: 1 })).map((c) => c.figure));
    expect(figures.has("triangle")).toBe(false);
    expect(figures.has("square")).toBe(false);
  });
});

describe("bauhausSvg", () => {
  it("draws every figure as a closed path", () => {
    for (const figure of BAUHAUS_FIGURES) expect(bauhausFigurePath(figure, 100)).toMatch(/Z$/);
  });

  it("is deterministic for a seed", () => {
    expect(bauhausSvg(opts())).toBe(bauhausSvg(opts()));
    expect(bauhausSvg(opts())).not.toBe(bauhausSvg(opts({ rng: createRng(2) })));
  });
});
