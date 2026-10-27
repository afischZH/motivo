import { createRng } from "@motivo/engine";
import { describe, expect, it } from "vitest";
import { registry } from "../registry";
import { renderStatic, describePresetSnapshots, describeToolContract } from "../testing";
import type { CssOutput } from "../types";
import { blobTool, builtInTools, cssGradientTool, polkaDotsTool, svgWavesTool } from "./index";

for (const tool of builtInTools) {
  describeToolContract(tool);
  describePresetSnapshots(tool);
}

describe("built-in tool registration", () => {
  it("registers every built-in tool in the default registry", () => {
    expect(registry.list().map((t) => t.id)).toEqual([
      "css-gradient",
      "blob",
      "svg-waves",
      "polka-dots",
    ]);
    expect(registry.listByCategory("gradients").map((t) => t.id)).toEqual(["css-gradient"]);
    expect(registry.listByCategory("patterns").map((t) => t.id)).toEqual(["polka-dots"]);
  });

  it.each(builtInTools.map((t) => [t.id, t] as const))("%s is fully free in M1", (_, tool) => {
    expect(tool.gating).toEqual({});
  });
});

describe("css-gradient", () => {
  const size = { width: 400, height: 200 };

  it("renders CSS with an OKLCH declaration and a matching preview", () => {
    const out = renderStatic(cssGradientTool, cssGradientTool.defaults, 1, size) as CssOutput;
    expect(out.css).toContain("linear-gradient(135deg in oklch,");
    expect(out.previewSvg).toContain('width="400" height="200"');
  });

  it("ignores the seed (gradients are fully described by their params)", () => {
    const a = renderStatic(cssGradientTool, cssGradientTool.defaults, 1, size);
    expect(renderStatic(cssGradientTool, cssGradientTool.defaults, 99, size)).toEqual(a);
  });

  it("keeps the user's stop density when randomising", () => {
    const out = cssGradientTool.randomize(
      createRng(1),
      { ...cssGradientTool.defaults, steps: 3 },
      new Set(),
    );
    expect(out.steps).toBe(3);
  });

  it("rejects invalid params", () => {
    expect(
      cssGradientTool.schema.safeParse({ ...cssGradientTool.defaults, palette: ["#fff"] }).success,
    ).toBe(false);
    expect(
      cssGradientTool.schema.safeParse({ ...cssGradientTool.defaults, type: "diamond" }).success,
    ).toBe(false);
  });
});

describe("blob", () => {
  it("changes shape with the seed but not with the background", () => {
    const size = { width: 300, height: 300 };
    const a = renderStatic(blobTool, blobTool.defaults, 1, size) as string;
    const b = renderStatic(blobTool, blobTool.defaults, 2, size) as string;
    const d = (svg: string): string | undefined => /<path d="([^"]+)"/.exec(svg)?.[1];
    expect(d(a)).not.toBe(d(b));
    const c = renderStatic(
      blobTool,
      { ...blobTool.defaults, background: "#000000" },
      1,
      size,
    ) as string;
    expect(d(c)).toBe(d(a));
  });
});

describe("svg-waves", () => {
  it("renders one path per layer", () => {
    for (const layers of [1, 5]) {
      const svg = renderStatic(svgWavesTool, { ...svgWavesTool.defaults, layers }, 1, {
        width: 800,
        height: 400,
      }) as string;
      expect(svg.match(/<path /g)).toHaveLength(layers);
    }
  });
});

describe("polka-dots", () => {
  it("scales spacing with the canvas so the dot count is size independent", () => {
    const count = (w: number, h: number): number =>
      (
        (
          renderStatic(polkaDotsTool, polkaDotsTool.defaults, 1, { width: w, height: h }) as string
        ).match(/<circle /g) ?? []
      ).length;
    expect(count(500, 500)).toBe(count(2000, 2000));
  });

  it("keeps the SVG compact at the densest setting", () => {
    const svg = renderStatic(polkaDotsTool, { ...polkaDotsTool.defaults, spacing: 2 }, 1, {
      width: 1080,
      height: 1080,
    }) as string;
    expect(svg.length).toBeLessThan(150_000);
  });
});
