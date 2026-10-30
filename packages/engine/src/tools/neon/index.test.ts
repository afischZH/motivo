import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  NEON_COUNT_MAX,
  NEON_GLOW_LAYERS,
  NEON_SHAPES,
  type NeonOptions,
  neonGlowLayers,
  neonItems,
  neonPath,
  neonSvg,
} from "./index";

const opts = (o: Partial<NeonOptions> = {}): NeonOptions => ({
  width: 800,
  height: 600,
  background: "#0b0614",
  colors: ["#ff2bd6", "#00f0ff"],
  kind: "mixed",
  count: 6,
  size: 0.25,
  variance: 0.5,
  stroke: 0.008,
  glow: 0.8,
  core: true,
  haze: 0.4,
  rng: createRng(1),
  ...o,
});

describe("neonItems", () => {
  it("clamps the count and keeps shapes when the count changes", () => {
    expect(neonItems(opts({ count: 99 }))).toHaveLength(NEON_COUNT_MAX);
    const few = neonItems(opts({ count: 3 }));
    expect(neonItems(opts({ count: 10 })).slice(0, 3)).toEqual(few);
  });

  it("only uses the shapes of the chosen kind", () => {
    const shapes = neonItems(opts({ kind: "polygons", count: 30 })).map((i) => i.shape);
    expect(new Set(shapes)).toEqual(new Set(["triangle", "square", "hexagon"]));
  });

  it("keeps every shape inside the canvas centre area", () => {
    for (const item of neonItems(opts({ count: 30 }))) {
      expect(item.x).toBeGreaterThanOrEqual(0.08 * 800);
      expect(item.x).toBeLessThanOrEqual(0.92 * 800);
    }
  });
});

describe("neonPath", () => {
  it.each(NEON_SHAPES)("draws a %s path", (shape) => {
    expect(neonPath(shape, 50)).toMatch(/^M-?\d/);
  });
});

describe("neonGlowLayers", () => {
  it("has no layers without glow and widens outward", () => {
    expect(neonGlowLayers(0)).toEqual([]);
    const layers = neonGlowLayers(1);
    expect(layers).toHaveLength(NEON_GLOW_LAYERS);
    layers.slice(1).forEach((layer, i) => {
      const outer = layers[i] as { width: number; opacity: number };
      expect(layer.width).toBeLessThan(outer.width);
      expect(layer.opacity).toBeGreaterThan(outer.opacity);
    });
  });
});

describe("neonSvg", () => {
  it("glows with stacked strokes, not a filter", () => {
    const svg = neonSvg(opts({ haze: 0 }));
    expect(svg).not.toContain("<filter");
    // Glow strokes, tube and core per shape.
    expect(svg.match(/<path /g)).toHaveLength(6 * (NEON_GLOW_LAYERS + 2));
  });

  it("leaves out the core and the haze when switched off", () => {
    const svg = neonSvg(opts({ core: false, haze: 0, glow: 0 }));
    expect(svg).not.toContain('stroke="#fff"');
    expect(svg).not.toContain("<ellipse");
    expect(svg.match(/<path /g)).toHaveLength(6);
  });
});
