/**
 * M4b-AP02: Low-Poly/Voronoi and Terrazzo. Render budget at the default
 * size, SVG size at the caps, animation over time, brand palette, variants
 * and the seamless tile of Terrazzo.
 */
import { createRng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { applyBrandPalette } from "../brand-palette";
import { DEFAULT_CANVAS_SIZE } from "../common";
import { createRenderContext } from "../render";
import { lowPolyTool, terrazzoTool, type LowPolyParams, type TerrazzoParams } from "./index";

// Wall-clock timing for performance budgets in tests only; product code stays deterministic.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;
/**
 * Locally every preset renders in 1 to 11 ms (docs/TOOLS.md K3, K5); test
 * runs share the CPU with other packages, so the budget only catches
 * blow-ups (an accidental O(n²) step), not the 50 ms main-thread target.
 */
const BUDGET_MS = 200;

/** Fastest of five runs in ms (ignores JIT warm-up and CI noise). */
function fastest(fn: () => unknown): number {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const start = clock.now();
    fn();
    best = Math.min(best, clock.now() - start);
  }
  return best;
}

const renderLowPoly = (p: LowPolyParams, seed = 1, size = DEFAULT_CANVAS_SIZE, t?: number) => {
  if (lowPolyTool.render.kind !== "svg") throw new Error("svg tool expected");
  return lowPolyTool.render.render(p, createRenderContext(seed, size, t));
};
const renderTerrazzo = (p: TerrazzoParams, seed = 1, size = DEFAULT_CANVAS_SIZE) => {
  if (terrazzoTool.render.kind !== "svg") throw new Error("svg tool expected");
  return terrazzoTool.render.render(p, createRenderContext(seed, size));
};

describe("low-poly", () => {
  const all = [lowPolyTool.defaults, ...lowPolyTool.presets.map((p) => p.params)];

  it("renders every preset at the default size within the budget", () => {
    for (const p of all) expect(fastest(() => renderLowPoly(p))).toBeLessThan(BUDGET_MS);
  });

  it("stays under 1.5 MB at the point cap", () => {
    for (const mode of ["delaunay", "voronoi"] as const) {
      const svg = renderLowPoly(
        { ...lowPolyTool.defaults, mode, spacing: 1, gap: 2, rounding: 6, strokeWidth: 1 },
        1,
        { width: 8192, height: 8192 },
      );
      expect(svg.length).toBeLessThan(1_500_000);
    }
  });

  it("moves over time and returns to the design at t = 0", () => {
    const still = renderLowPoly(lowPolyTool.defaults);
    expect(renderLowPoly(lowPolyTool.defaults, 1, DEFAULT_CANVAS_SIZE, 0)).toBe(still);
    expect(renderLowPoly(lowPolyTool.defaults, 1, DEFAULT_CANVAS_SIZE, 0.5)).not.toBe(still);
  });

  it("keeps mode, lines and gaps in a new variant", () => {
    const current: LowPolyParams = {
      ...lowPolyTool.defaults,
      mode: "voronoi",
      strokeWidth: 3,
      gap: 4,
    };
    const next = lowPolyTool.randomize(createRng(5), current, new Set());
    expect(next).toMatchObject({ mode: "voronoi", strokeWidth: 3, gap: 4 });
    expect(next.palette).not.toEqual(current.palette);
  });

  it("takes a brand palette and keeps the background", () => {
    const result = applyBrandPalette(lowPolyTool, lowPolyTool.defaults, [
      "#112233",
      "#445566",
      "#778899",
    ]);
    expect(result?.params.palette).toEqual(["#112233", "#445566", "#778899"]);
    expect(result?.params.background).toBe(lowPolyTool.defaults.background);
  });
});

describe("terrazzo", () => {
  const all = [terrazzoTool.defaults, ...terrazzoTool.presets.map((p) => p.params)];
  const tile = (p: TerrazzoParams, size = DEFAULT_CANVAS_SIZE) => {
    if (!terrazzoTool.tile) throw new Error("tile expected");
    return terrazzoTool.tile.render(p, createRenderContext(1, size));
  };

  it("renders every preset at the default size within the budget", () => {
    for (const p of all) expect(fastest(() => renderTerrazzo(p))).toBeLessThan(BUDGET_MS);
  });

  it("repeats a seamless tile of the chosen size", () => {
    const t = tile(terrazzoTool.defaults);
    expect(t).toMatchObject({ width: 480, height: 480 });
    expect(t.svg).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="480" height="480"/,
    );
    const full = renderTerrazzo(terrazzoTool.defaults);
    expect(full).toContain('<pattern id="tz');
    expect(full).toContain('width="480" height="480" patternUnits="userSpaceOnUse"');
    // The tile is the same set of chips as the pattern (one render path).
    const chips = (svg: string) =>
      [...svg.matchAll(/<path fill="[^"]+" d="([^"]+)"/g)].map((m) => m[1]);
    expect(chips(full)).toEqual(chips(t.svg));
  });

  it("fills the whole canvas without seamless", () => {
    const p: TerrazzoParams = { ...terrazzoTool.defaults, seamless: false };
    const size = { width: 900, height: 500 };
    expect(renderTerrazzo(p, 1, size)).not.toContain('<pattern id="tz');
    expect(tile(p, size)).toMatchObject({ width: 900, height: 500 });
  });

  it("stays under 1.5 MB at the caps", () => {
    const p: TerrazzoParams = {
      ...terrazzoTool.defaults,
      seamless: false,
      chipSize: 4,
      density: 70,
      speckles: 100,
      grain: 0,
    };
    expect(renderTerrazzo(p, 1, { width: 8192, height: 8192 }).length).toBeLessThan(1_500_000);
    expect(tile({ ...p, seamless: true, tileSize: 1600 }).svg.length).toBeLessThan(1_500_000);
  });

  it("keeps the tile, gap and grain in a new variant", () => {
    const current: TerrazzoParams = { ...terrazzoTool.defaults, tileSize: 640, gap: 7, grain: 30 };
    const next = terrazzoTool.randomize(createRng(9), current, new Set());
    expect(next).toMatchObject({ seamless: true, tileSize: 640, gap: 7, grain: 30 });
    expect(next.palette).not.toEqual(current.palette);
  });

  it("takes a brand palette for the chips and keeps the base colour", () => {
    const result = applyBrandPalette(terrazzoTool, terrazzoTool.defaults, ["#aa0000", "#00aa00"]);
    expect(result?.params.palette).toEqual(["#aa0000", "#00aa00"]);
    expect(result?.params.background).toBe(terrazzoTool.defaults.background);
  });
});
