import { createRng, sampleImagePixels } from "@motivo/engine";
import { describe, expect, it } from "vitest";
import { deriveFromImage, withoutDerivedParams } from "../image-input";
import { createRenderContext } from "../render";
import { renderStatic } from "../testing";
import type { PixelBuffer } from "../types";
import { paletteFromImageTool as tool } from "./index";
import { shownColors, type PaletteFromImageParams } from "./palette-from-image";

const size = { width: 1920, height: 1080 };

function extra(id: string, params: PaletteFromImageParams): string {
  const e = tool.extraExports?.find((x) => x.id === id);
  if (!e) throw new Error(`missing extra export ${id}`);
  return e.render(tool.schema.parse(params), createRenderContext(1, size));
}

/** Horizontal bands of solid colours, `rows` pixel rows each. */
function bands(
  colors: readonly (readonly [number, number, number, number, number])[],
): PixelBuffer {
  const width = 8;
  const height = colors.reduce((s, c) => s + c[4], 0);
  const data = new Uint8ClampedArray(width * height * 4);
  let o = 0;
  for (const [r, g, b, a, rows] of colors) {
    for (let i = 0; i < rows * width; i++, o += 4) data.set([r, g, b, a], o);
  }
  return { width, height, data };
}

const p = (patch: Partial<PaletteFromImageParams> = {}): PaletteFromImageParams => ({
  ...tool.defaults,
  ...patch,
});

describe("palette-from-image", () => {
  it("defaults and presets hold the sample picture's palettes for their seed", () => {
    const sample = sampleImagePixels();
    for (const { params, seed } of [
      { params: tool.defaults, seed: 1 },
      ...tool.presets.map((x) => ({ params: x.params, seed: x.seed ?? 1 })),
    ]) {
      expect(deriveFromImage(tool, sample, params, seed)).toEqual({ colors: params.colors });
    }
  });

  it("derives the colours of a user image, largest share first", () => {
    const pixels = bands([
      [29, 53, 87, 255, 6],
      [230, 57, 70, 255, 3],
      [241, 250, 238, 255, 1],
    ]);
    expect(deriveFromImage(tool, pixels, p({ count: 3 }), 5)).toEqual({
      colors: [
        { color: "#1d3557", share: 0.6 },
        { color: "#e63946", share: 0.3 },
        { color: "#f1faee", share: 0.1 },
      ],
    });
  });

  it("re-runs k-means with another seed (Space) and another count", () => {
    const sample = sampleImagePixels();
    const seeds = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) =>
        JSON.stringify(deriveFromImage(tool, sample, p({ count: 6 }), seed)),
      ),
    );
    expect(seeds.size).toBeGreaterThan(1);
    const eight = deriveFromImage(tool, sample, p({ count: 8 }), 1) as PaletteFromImageParams;
    expect(eight.colors).toHaveLength(8);
  });

  it("reports nothing found for a fully transparent image", () => {
    const pixels = bands([[0, 0, 0, 0, 4]]);
    expect(deriveFromImage(tool, pixels, tool.defaults, 1)).toBeNull();
  });

  it("keeps derived colours out of share links", () => {
    const user = p({ count: 3, colors: [{ color: "#123456", share: 1 }] });
    expect(withoutDerivedParams(tool, user)).toEqual({ ...user, colors: tool.defaults.colors });
  });

  it("renders the shown colours with their share", () => {
    const svg = renderStatic(tool, tool.defaults, 1, size) as string;
    expect(svg.match(/<rect /g)).toHaveLength(5);
    expect(svg).toContain(">26%</text>");
    expect(svg).toContain(">#203b53</text>");
    const plain = renderStatic(tool, p({ shares: false }), 1, size) as string;
    expect(plain).not.toContain("%</text>");
  });

  it("shows at most `count` colours in the chosen order", () => {
    const params = p({ count: 3, sort: "lightness" });
    const shown = shownColors(params).map((c) => c.color);
    expect(shown).toHaveLength(3);
    // The three largest clusters of the five, light to dark.
    expect(shown).toEqual(["#865e92", "#484b7a", "#203b53"]);
  });

  it("keeps everything on Space; the editor re-derives with the new seed", () => {
    const current = p({ count: 7, sort: "hue" });
    expect(tool.randomize(createRng(3), current, new Set())).toEqual(current);
  });

  it("exports the shown colours as CSS variables, HEX list and Tailwind", () => {
    const params = p({ count: 3, sort: "share" });
    expect(extra("hex-list", params)).toBe("#203b53\n#865e92\n#484b7a\n");
    expect(extra("css-variables", params)).toBe(
      ":root {\n  --palette-1: #203b53;\n  --palette-2: #865e92;\n  --palette-3: #484b7a;\n}\n",
    );
    expect(extra("tailwind-config", params)).toContain("palette: {\n          1: '#203b53',");
    expect(extra("tailwind-theme", params)).toContain("--color-palette-1: oklch(");
  });

  it("rejects counts and colour lists outside 3 to 10", () => {
    for (const bad of [{ count: 2 }, { count: 11 }, { colors: [] }]) {
      expect(tool.schema.safeParse(p(bad as Partial<PaletteFromImageParams>)).success).toBe(false);
    }
  });
});
