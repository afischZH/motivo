import { createRng } from "@musterli/engine";
import { createRenderContext, registry } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

import { registerWallpaperStyles, WALLPAPER_ONLY_TOOLS } from ".";

registerWallpaperStyles();

const SIZES = [
  { width: 402, height: 874 }, // iPhone design size
  { width: 3008, height: 1692 }, // 6K design size
  { width: 5120, height: 1440 }, // super ultrawide
];

describe.each(WALLPAPER_ONLY_TOOLS.map((tool) => [tool.id, tool] as const))("%s", (_, tool) => {
  it("is not a Musterli tool id and registers once", () => {
    registerWallpaperStyles();
    expect(registry.get(tool.id)).toBe(tool);
  });

  it("has valid defaults and at least 6 valid presets", () => {
    expect(() => tool.schema.parse(tool.defaults)).not.toThrow();
    expect(tool.presets.length).toBeGreaterThanOrEqual(6);
    for (const preset of tool.presets) expect(() => tool.schema.parse(preset.params)).not.toThrow();
  });

  it("randomizes into valid params", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const next = tool.randomize(createRng(seed), tool.defaults, new Set());
      expect(() => tool.schema.parse(next)).not.toThrow();
    }
  });

  it("renders every preset deterministically and within a size budget", () => {
    if (tool.render.kind !== "svg") throw new Error("expected svg");
    for (const preset of tool.presets) {
      for (const size of SIZES) {
        const svg = tool.render.render(preset.params, createRenderContext(7, size));
        expect(svg).toContain(`viewBox="0 0 ${size.width} ${size.height}"`);
        expect(svg).not.toMatch(/NaN|undefined|Infinity/);
        // Keeps the preview fast and the share of the export memory small.
        expect(svg.length).toBeLessThan(2_500_000);
        expect(tool.render.render(preset.params, createRenderContext(7, size))).toBe(svg);
      }
    }
  });
});
