/**
 * M6-AP01: god rays, fractal glass and pixelate beyond the generic
 * contract: the pixelate grid and its SVG budget, brand palettes,
 * randomize and size independence. Small sizes keep the raster work fast.
 */
import { pixelDigest, resizeNearest } from "@musterli/effects";
import { createRng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { applyBrandPalette } from "../brand-palette";
import {
  IMAGE_EFFECT_GRID_MAX_PIXELS,
  effectInputSize,
  effectVectorBudget,
  renderImageEffect,
  renderImageEffectSvg,
} from "../photo-source";
import { checkSvg } from "../testing";
import {
  PIXELATE_SVG_MAX_SHAPES,
  fractalGlassTool,
  godRaysOptions,
  godRaysTool,
  pixelateGrid,
  pixelateTool,
} from "./index";

const DESIGN = { width: 300, height: 200 };

const meanOf = (px: { data: Uint8ClampedArray }, c: number): number => {
  let sum = 0;
  for (let i = c; i < px.data.length; i += 4) sum += px.data[i] ?? 0;
  return sum / (px.data.length / 4);
};

describe("pixelate grid and SVG", () => {
  it("is the design size divided by the block size, capped", () => {
    expect(pixelateGrid({ ...pixelateTool.defaults, blockSize: 16 }, DESIGN)).toEqual({
      width: 19,
      height: 13,
    });
    const capped = pixelateGrid(
      { ...pixelateTool.defaults, blockSize: 1 },
      { width: 8192, height: 8192 },
    );
    expect(capped.width * capped.height).toBeLessThanOrEqual(IMAGE_EFFECT_GRID_MAX_PIXELS);
    expect(
      effectInputSize(pixelateTool, pixelateTool.defaults, DESIGN, { width: 60, height: 40 }),
    ).toEqual({ width: 19, height: 13 });
    // God rays and glass work at the output size.
    for (const tool of [godRaysTool, fractalGlassTool]) {
      expect(effectInputSize(tool, tool.defaults, DESIGN, { width: 60, height: 40 })).toEqual({
        width: 60,
        height: 40,
      });
    }
  });

  it("gives the same blocks at every output size (preview and export)", () => {
    const p = { ...pixelateTool.defaults, blockSize: 10 };
    const grid = pixelateGrid(p, DESIGN);
    const atGrid = renderImageEffect(pixelateTool, p, 1, DESIGN, grid);
    const exported = renderImageEffect(pixelateTool, p, 1, DESIGN, DESIGN);
    expect(pixelDigest(exported)).toBe(pixelDigest(resizeNearest(atGrid, 300, 200)));
    const twice = renderImageEffect(pixelateTool, p, 1, DESIGN, { width: 600, height: 400 });
    expect(pixelDigest(twice)).toBe(pixelDigest(resizeNearest(atGrid, 600, 400)));
  });

  it("exports well-formed SVG with one colour per block, within the budget", () => {
    for (const preset of pixelateTool.presets) {
      if (preset.params.blockSize < 4) continue;
      const svg = renderImageEffectSvg(pixelateTool, preset.params, 1, DESIGN);
      expect(checkSvg(svg), preset.id).toEqual([]);
      expect(svg).toContain('width="300" height="200"');
      expect(svg).not.toMatch(/<image|data:/);
    }
    const svg = renderImageEffectSvg(pixelateTool, pixelateTool.defaults, 1, DESIGN);
    const grid = pixelateGrid(pixelateTool.defaults, DESIGN);
    expect(svg).toContain(`viewBox="0 0 ${grid.width} ${grid.height}"`);
    const runs = (svg.match(/M\d+ \d+h/g) ?? []).length;
    expect(runs).toBeGreaterThan(grid.height);
    const budget = effectVectorBudget(pixelateTool, pixelateTool.defaults, DESIGN);
    expect(budget?.max).toBe(PIXELATE_SVG_MAX_SHAPES);
    expect(runs).toBeLessThanOrEqual(budget?.shapes ?? 0);
    const def = effectVectorBudget(
      pixelateTool,
      pixelateTool.defaults,
      pixelateTool.defaultSize ?? DESIGN,
    );
    expect(def && def.shapes <= def.max).toBe(true);
    // Pixel size 1 on a 12 MP photo is over the budget; the dialog explains it.
    const big = effectVectorBudget(
      pixelateTool,
      { ...pixelateTool.defaults, blockSize: 1 },
      { width: 4000, height: 3000 },
    );
    expect((big?.shapes ?? 0) > (big?.max ?? 0)).toBe(true);
    expect(effectVectorBudget(godRaysTool, godRaysTool.defaults, DESIGN)).toBeNull();
    expect(effectVectorBudget(fractalGlassTool, fractalGlassTool.defaults, DESIGN)).toBeNull();
  });
});

describe("size independence", () => {
  it("keeps the look of god rays and glass in a smaller preview", () => {
    for (const tool of [godRaysTool, fractalGlassTool]) {
      for (const preset of tool.presets) {
        const full = renderImageEffect(tool, preset.params, 1, DESIGN, DESIGN);
        const half = renderImageEffect(tool, preset.params, 1, DESIGN, { width: 150, height: 100 });
        for (const c of [0, 1, 2]) {
          expect(
            Math.abs(meanOf(full, c) - meanOf(half, c)),
            `${tool.id}/${preset.id}`,
          ).toBeLessThan(6);
        }
      }
    }
  });
});

describe("colours and randomize", () => {
  const colors = ["#f5f0e6", "#c0392b", "#1a2b3c"];

  it("maps brand palettes", () => {
    expect(applyBrandPalette(godRaysTool, godRaysTool.defaults, colors)?.params).toMatchObject({
      color: "#f5f0e6",
    });
    expect(
      applyBrandPalette(fractalGlassTool, fractalGlassTool.defaults, colors)?.params,
    ).toMatchObject({ tint: "#c0392b", tintAmount: 30 });
    expect(applyBrandPalette(pixelateTool, pixelateTool.defaults, colors)?.params).toMatchObject({
      colorMode: "palette",
      colors: ["#1a2b3c", "#c0392b", "#f5f0e6"],
    });
  });

  it("rolls light and colour for god rays, keeps the rest", () => {
    const next = godRaysTool.randomize(createRng(5), godRaysTool.defaults, new Set());
    expect(next.lightX).not.toBe(godRaysTool.defaults.lightX);
    expect(next.color).not.toBe(godRaysTool.defaults.color);
    expect(next.samples).toBe(godRaysTool.defaults.samples);
    expect(godRaysOptions(next).x).toBeCloseTo(next.lightX / 100, 9);
  });

  it("rolls the block size only for original colours", () => {
    const original = { ...pixelateTool.defaults, colorMode: "original" as const };
    const sizes = new Set<number>();
    for (let s = 1; s <= 12; s++) {
      sizes.add(pixelateTool.randomize(createRng(s), original, new Set()).blockSize);
    }
    expect(sizes.size).toBeGreaterThan(2);
    const levels = pixelateTool.randomize(createRng(3), pixelateTool.defaults, new Set());
    expect(levels.blockSize).toBe(pixelateTool.defaults.blockSize);
  });

  it("uses the seed for the strip offsets of fractal glass", () => {
    const p = { ...fractalGlassTool.defaults, jitter: 80 };
    const a = renderImageEffect(fractalGlassTool, p, 1, DESIGN, { width: 90, height: 60 });
    const b = renderImageEffect(fractalGlassTool, p, 2, DESIGN, { width: 90, height: 60 });
    expect(pixelDigest(a)).not.toBe(pixelDigest(b));
  });
});
