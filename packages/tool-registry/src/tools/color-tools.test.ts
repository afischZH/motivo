import { createRng, hexToOklch } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { createRenderContext } from "../render";
import { renderStatic } from "../testing";
import type { AnyToolDefinition } from "../types";
import { paletteColors, PALETTE_SLOTS, type PaletteGeneratorParams } from "./palette-generator";
import { paletteGeneratorTool, tailwindPaletteTool, tintsShadesTool } from "./index";

const size = { width: 1920, height: 1080 };

function extra(tool: AnyToolDefinition, id: string, params: unknown): string {
  const e = tool.extraExports?.find((x) => x.id === id);
  if (!e) throw new Error(`missing extra export ${id}`);
  return e.render(tool.schema.parse(params), createRenderContext(1, size));
}

const hueDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe("palette-generator", () => {
  const tool = paletteGeneratorTool;

  it("renders one swatch per visible colour", () => {
    for (const count of [2, 5, PALETTE_SLOTS]) {
      const svg = renderStatic(tool, { ...tool.defaults, count }, 1, size) as string;
      expect(svg.match(/<rect /g)).toHaveLength(count);
    }
  });

  it("shows hex values and the contrast of each label", () => {
    const svg = renderStatic(tool, tool.defaults, 1, size) as string;
    expect(svg).toContain(">#e07a5f</text>");
    expect(svg).toMatch(/>\d+\.\d:1( AAA?)?<\/text>/);
  });

  it("adds a contrast matrix on request", () => {
    const svg = renderStatic(tool, { ...tool.defaults, count: 3, matrix: true }, 1, size) as string;
    expect(svg.match(/<rect /g)).toHaveLength(3 + 3);
  });

  it("generates only the visible slots and keeps hidden ones", () => {
    const current = { ...tool.defaults, count: 3 };
    const next = tool.randomize(createRng(9), current, new Set());
    expect(paletteColors(next)).not.toEqual(paletteColors(current));
    expect(next.color4).toBe(current.color4);
    expect(next.color8).toBe(current.color8);
  });

  it("keeps locked colours and builds the harmony around the first one", () => {
    const current: PaletteGeneratorParams = {
      ...tool.defaults,
      harmony: "complementary",
      count: 4,
      color2: "#1e90ff",
    };
    const locks = new Set(["color2"] as const);
    for (let seed = 0; seed < 10; seed++) {
      const next = tool.randomize(createRng(seed), current, locks);
      expect(next.color2).toBe("#1e90ff");
      // Slot 2 sits on the anchor hue: slots 1 and 3 are complementary, slot 4 matches it.
      const anchor = hexToOklch("#1e90ff").h;
      expect(hueDistance(hexToOklch(next.color1).h, anchor)).toBeGreaterThan(150);
      expect(hueDistance(hexToOklch(next.color3).h, anchor)).toBeGreaterThan(150);
      expect(hueDistance(hexToOklch(next.color4).h, anchor)).toBeLessThan(30);
    }
  });

  it("varies the harmony in auto mode but keeps the user's choice", () => {
    const auto = tool.randomize(createRng(1), tool.defaults, new Set());
    expect(auto.harmony).toBe("auto");
    const fixed = tool.randomize(createRng(1), { ...tool.defaults, harmony: "triadic" }, new Set());
    expect(fixed.harmony).toBe("triadic");
  });

  it("exports CSS variables and a hex list", () => {
    const p = { ...tool.defaults, count: 2 };
    expect(extra(tool, "css-variables", p)).toBe(
      ":root {\n  --palette-1: #f4f1de;\n  --palette-2: #e07a5f;\n}\n",
    );
    expect(extra(tool, "hex-list", p)).toBe("#f4f1de\n#e07a5f\n");
  });
});

describe("tints-shades", () => {
  const tool = tintsShadesTool;

  it("renders tints, the marked base and shades", () => {
    const svg = renderStatic(tool, { ...tool.defaults, tints: 2, shades: 3 }, 1, size) as string;
    expect(svg.match(/<rect /g)).toHaveLength(6);
    expect(svg.match(/<circle /g)).toHaveLength(1);
    expect(svg).toContain(">#2a9d8f</text>");
  });

  it("only changes the base colour when shuffling", () => {
    const next = tool.randomize(createRng(4), tool.defaults, new Set());
    expect(next.base).not.toBe(tool.defaults.base);
    expect({ ...next, base: tool.defaults.base }).toEqual(tool.defaults);
  });

  it("exports CSS variables with tint/shade names and value lists", () => {
    const p = { ...tool.defaults, tints: 1, shades: 1, name: "Primär Farbe" };
    const css = extra(tool, "css-variables", p);
    expect(css).toMatch(
      /^:root \{\n {2}--primar-farbe-tint-1: #[0-9a-f]{6};\n {2}--primar-farbe: #2a9d8f;\n {2}--primar-farbe-shade-1: #[0-9a-f]{6};\n\}\n$/,
    );
    expect(extra(tool, "hex-list", p).split("\n")).toHaveLength(4);
    expect(extra(tool, "rgb-list", p)).toContain("rgb(42, 157, 143)");
    expect(extra(tool, "hsl-list", p)).toContain("hsl(173, 57.8%, 39%)");
  });

  it("falls back to a valid variable name for empty input", () => {
    expect(extra(tool, "css-variables", { ...tool.defaults, name: "" })).toContain("--color:");
  });
});

describe("tailwind-palette", () => {
  const tool = tailwindPaletteTool;

  it("renders 11 titled steps with the base marked at 500", () => {
    const svg = renderStatic(tool, tool.defaults, 1, size) as string;
    expect(svg.match(/<rect /g)).toHaveLength(11);
    for (const step of ["50", "500", "950"]) expect(svg).toContain(`>${step}</text>`);
    expect(svg).toContain(">#3b82f6</text>");
    expect(svg.match(/<circle /g)).toHaveLength(1);
  });

  it("exports a tailwind.config.js with all steps", () => {
    const js = extra(tool, "tailwind-config", tool.defaults);
    expect(js).toContain("module.exports = {");
    expect(js).toContain("        brand: {\n          50: '#");
    expect(js).toContain("          500: '#3b82f6',");
    expect(js.match(/^ {10}\d+: '#[0-9a-f]{6}',$/gm)).toHaveLength(11);
    // Valid JS object literal (evaluated without a module system).
    const config = new Function("module", `${js}; return module.exports;`)({}) as {
      theme: { extend: { colors: Record<string, Record<string, string>> } };
    };
    expect(Object.keys(config.theme.extend.colors.brand ?? {})).toHaveLength(11);
  });

  it("exports a Tailwind v4 @theme block in OKLCH", () => {
    const css = extra(tool, "tailwind-theme", { ...tool.defaults, name: "Ocean Blue" });
    expect(css.startsWith("@theme {\n")).toBe(true);
    expect(css).toContain("  --color-ocean-blue-500: oklch(62.3% 0.188 259.8);");
    expect(
      css.match(/^ {2}--color-ocean-blue-\d+: oklch\([\d.]+% [\d.]+ [\d.]+\);$/gm),
    ).toHaveLength(11);
  });

  it("exports OKLCH and HEX variables and a hex list", () => {
    expect(extra(tool, "css-variables-oklch", tool.defaults)).toContain("--brand-500: oklch(");
    expect(extra(tool, "css-variables", tool.defaults)).toContain("--brand-500: #3b82f6;");
    expect(extra(tool, "hex-list", tool.defaults).trim().split("\n")).toHaveLength(11);
  });
});
