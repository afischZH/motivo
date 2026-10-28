/**
 * M5-AP02: halftone, CMYK halftone and dither beyond the generic contract:
 * vector output and its budget, the fixed dither grid, brand palettes and
 * size independence. Small sizes keep the raster work well under a second.
 */
import { pixelDigest, resizeNearest } from "@musterli/effects";
import { describe, expect, it } from "vitest";
import { applyBrandPalette } from "../brand-palette";
import {
  IMAGE_EFFECT_GRID_MAX_PIXELS,
  effectInputSize,
  effectVectorBudget,
  effectVectorInputSize,
  renderImageEffect,
  renderImageEffectSvg,
} from "../photo-source";
import { checkSvg } from "../testing";
import { duotoneTool } from "./duotone";
import {
  CMYK_SVG_MAX_SHAPES,
  HALFTONE_SVG_MAX_SHAPES,
  cmykHalftoneTool,
  cmykOffsets,
  ditherGrid,
  ditherPalette,
  ditherTool,
  halftoneTool,
} from "./index";

const DESIGN = { width: 300, height: 200 };

/** Mean of the red channel, 0 to 255. */
function meanRed(px: { data: Uint8ClampedArray; width: number; height: number }): number {
  let sum = 0;
  for (let i = 0; i < px.data.length; i += 4) sum += px.data[i] ?? 0;
  return sum / (px.width * px.height);
}

describe("halftone and CMYK vector output", () => {
  it("renders well-formed SVG for every preset of both tools", () => {
    for (const tool of [halftoneTool, cmykHalftoneTool]) {
      for (const preset of tool.presets) {
        const svg = renderImageEffectSvg(tool, preset.params, 1, DESIGN);
        expect(checkSvg(svg), `${tool.id}/${preset.id}`).toEqual([]);
        expect(svg).toContain('viewBox="0 0 300 200"');
      }
    }
  });

  it("estimates at least the shapes it draws and fits the default design", () => {
    const svg = renderImageEffectSvg(halftoneTool, halftoneTool.defaults, 1, DESIGN);
    const dots = (svg.match(/h0/g) ?? []).length;
    const budget = effectVectorBudget(halftoneTool, halftoneTool.defaults, DESIGN);
    expect(budget?.max).toBe(HALFTONE_SVG_MAX_SHAPES);
    expect(dots).toBeGreaterThan(100);
    expect(dots).toBeLessThanOrEqual(budget?.shapes ?? 0);
    for (const tool of [halftoneTool, cmykHalftoneTool]) {
      const b = effectVectorBudget(tool, tool.defaults, tool.defaultSize ?? DESIGN);
      expect(b && b.shapes <= b.max, tool.id).toBe(true);
    }
    // A 12 MP photo with the default cells is over the budget; the dialog explains it.
    const big = effectVectorBudget(cmykHalftoneTool, cmykHalftoneTool.defaults, {
      width: 4000,
      height: 3000,
    });
    expect(big?.max).toBe(CMYK_SVG_MAX_SHAPES);
    expect((big?.shapes ?? 0) > (big?.max ?? 0)).toBe(true);
    expect(effectVectorBudget(duotoneTool, duotoneTool.defaults, DESIGN)).toBeNull();
    expect(() => renderImageEffectSvg(duotoneTool, duotoneTool.defaults, 1, DESIGN)).toThrow(
      TypeError,
    );
  });

  it("analyses vector exports at the design size, up to 4096 px", () => {
    expect(effectVectorInputSize(DESIGN)).toEqual(DESIGN);
    expect(effectVectorInputSize({ width: 8192, height: 4096 })).toEqual({
      width: 4096,
      height: 2048,
    });
  });

  it("keeps the tone when the preview is smaller than the design", () => {
    const full = renderImageEffect(halftoneTool, halftoneTool.defaults, 1, DESIGN, DESIGN);
    const half = renderImageEffect(halftoneTool, halftoneTool.defaults, 1, DESIGN, {
      width: 150,
      height: 100,
    });
    expect(Math.abs(meanRed(full) - meanRed(half))).toBeLessThan(8);
  });

  it("shifts cyan, magenta and yellow around a circle, black stays", () => {
    const o = cmykOffsets({ ...cmykHalftoneTool.defaults, offset: 4, offsetAngle: 0 }, 0.5);
    expect(o.c[0]).toBeCloseTo(2, 9);
    expect(o.m[1]).toBeCloseTo(Math.sqrt(3), 9);
    expect(o.k).toEqual([0, 0]);
  });

  it("maps a brand palette: dark ink, light paper", () => {
    const colors = ["#f5f0e6", "#c0392b", "#1a2b3c"];
    const ht = applyBrandPalette(halftoneTool, halftoneTool.defaults, colors);
    expect(ht?.params).toMatchObject({ ink: "#1a2b3c", background: "#f5f0e6" });
    const inverted = applyBrandPalette(
      halftoneTool,
      { ...halftoneTool.defaults, invert: true },
      colors,
    );
    expect(inverted?.params).toMatchObject({ ink: "#f5f0e6", background: "#1a2b3c" });
    const cmyk = applyBrandPalette(cmykHalftoneTool, cmykHalftoneTool.defaults, colors);
    expect(cmyk?.params).toMatchObject({ black: "#1a2b3c", paper: "#f5f0e6", cyan: "#c0392b" });
  });
});

describe("dither grid", () => {
  it("is the design size divided by the pixel size, capped", () => {
    expect(
      ditherGrid({ ...ditherTool.defaults, pixelSize: 3 }, { width: 1500, height: 1000 }),
    ).toEqual({ width: 500, height: 333 });
    const capped = ditherGrid(
      { ...ditherTool.defaults, pixelSize: 1 },
      { width: 8192, height: 8192 },
    );
    expect(capped.width * capped.height).toBeLessThanOrEqual(IMAGE_EFFECT_GRID_MAX_PIXELS);
    expect(capped.width).toBe(4096);
    expect(
      effectInputSize(ditherTool, ditherTool.defaults, DESIGN, { width: 60, height: 40 }),
    ).toEqual({ width: 150, height: 100 });
    expect(
      effectInputSize(halftoneTool, halftoneTool.defaults, DESIGN, { width: 60, height: 40 }),
    ).toEqual({ width: 60, height: 40 });
  });

  it("gives the same pattern at every output size (preview and export)", () => {
    const p = { ...ditherTool.defaults, pixelSize: 2 };
    const grid = ditherGrid(p, DESIGN);
    const atGrid = renderImageEffect(ditherTool, p, 1, DESIGN, grid);
    const exported = renderImageEffect(ditherTool, p, 1, DESIGN, DESIGN);
    expect(pixelDigest(exported)).toBe(pixelDigest(resizeNearest(atGrid, 300, 200)));
    const twice = renderImageEffect(ditherTool, p, 1, DESIGN, { width: 600, height: 400 });
    expect(pixelDigest(twice)).toBe(pixelDigest(resizeNearest(atGrid, 600, 400)));
    // A small preview shows the mean of the same grid.
    const preview = renderImageEffect(ditherTool, p, 1, DESIGN, { width: 75, height: 50 });
    expect(Math.abs(meanRed(preview) - meanRed(atGrid))).toBeLessThan(3);
  });

  it("uses the chosen palette and the brand palette as custom colours", () => {
    expect(ditherPalette(ditherTool.defaults)).toEqual([
      ditherTool.defaults.ink,
      ditherTool.defaults.paper,
    ]);
    expect(ditherPalette({ ...ditherTool.defaults, palette: "handheld" })).toHaveLength(4);
    const brand = applyBrandPalette(ditherTool, ditherTool.defaults, [
      "#ffffff",
      "#ff0000",
      "#000000",
    ]);
    expect(brand?.params).toMatchObject({
      palette: "custom",
      colors: ["#000000", "#ff0000", "#ffffff"],
    });
  });

  it("rolls an algorithm for fixed palettes and colours otherwise", async () => {
    const { createRng } = await import("@musterli/engine");
    const fixed = { ...ditherTool.defaults, palette: "cga" as const };
    const seen = new Set<string>();
    for (let s = 1; s <= 12; s++)
      seen.add(ditherTool.randomize(createRng(s), fixed, new Set()).algorithm);
    expect(seen.size).toBeGreaterThan(2);
    const mono = ditherTool.randomize(createRng(3), ditherTool.defaults, new Set());
    expect(mono.algorithm).toBe(ditherTool.defaults.algorithm);
    expect(mono.ink).not.toBe(ditherTool.defaults.ink);
  });
});
