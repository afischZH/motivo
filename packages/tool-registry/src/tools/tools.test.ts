import { GRAIN_TILE_EDGE, MAX_DOT_SITES, createRng, crc32 } from "@motivo/engine";
import { describe, expect, it } from "vitest";
import { registry } from "../registry";
import { createRenderContext } from "../render";
import { renderStatic, describePresetSnapshots, describeToolContract } from "../testing";
import type { AnyToolDefinition, CssOutput } from "../types";
import {
  blobTool,
  builtInTools,
  confettiTool,
  cssGradientTool,
  dieterDotsTool,
  gridPatternsTool,
  noiseGrainTool,
  polkaDotsTool,
  starrySkyTool,
  svgWavesTool,
} from "./index";
import { noiseGrainTileCacheSize } from "./noise-grain";

// Wall-clock timing for performance budgets in tests only; product code stays deterministic.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;
/** Runs `fn` three times and returns the fastest run in ms plus its result (ignores JIT warm-up and CI noise). */
function fastest<T>(fn: () => T): { ms: number; value: T } {
  let best = Infinity;
  let value = fn();
  for (let i = 0; i < 3; i++) {
    const start = clock.now();
    value = fn();
    best = Math.min(best, clock.now() - start);
  }
  return { ms: best, value };
}

const PNG_DATA_URI = /data:image\/png;base64,([A-Za-z0-9+/=]+)/g;

/** Replaces embedded PNG data URIs by length and CRC-32, so snapshots stay small but exact. */
function digestDataUris(svg: string): string {
  return svg.replace(PNG_DATA_URI, (_, b64: string) => {
    const crc = crc32(Uint8Array.from(b64, (c) => c.charCodeAt(0)));
    return `png-base64:${b64.length}:${crc.toString(16).padStart(8, "0")}`;
  });
}

for (const tool of builtInTools) {
  describeToolContract(tool);
  describePresetSnapshots(tool, {
    normalize: (out) => (typeof out === "string" ? digestDataUris(out) : out),
  });
}

describe("built-in tool registration", () => {
  it("registers every built-in tool in the default registry", () => {
    expect(registry.list().map((t) => t.id)).toEqual([
      "css-gradient",
      "blob",
      "svg-waves",
      "polka-dots",
      "noise-grain",
      "grid-patterns",
      "confetti",
      "starry-sky",
      "dieter-dots",
    ]);
    expect(registry.listByCategory("gradients").map((t) => t.id)).toEqual(["css-gradient"]);
    expect(registry.listByCategory("patterns").map((t) => t.id)).toEqual([
      "polka-dots",
      "grid-patterns",
      "confetti",
      "dieter-dots",
    ]);
    expect(registry.listByCategory("image-effects").map((t) => t.id)).toEqual(["noise-grain"]);
  });

  it.each(builtInTools.map((t) => [t.id, t] as const))("%s is fully free until M4", (_, tool) => {
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

describe("extra exports", () => {
  const size = { width: 300, height: 200 };
  const extra = (tool: AnyToolDefinition, id: string) => {
    const e = tool.extraExports?.find((x) => x.id === id);
    if (!e) throw new Error(`missing extra export ${id}`);
    return e;
  };

  it("css-gradient offers Tailwind classes", () => {
    const out = extra(cssGradientTool, "tailwind").render(
      cssGradientTool.defaults,
      createRenderContext(1, size),
    );
    expect(out).toMatch(/^bg-\[#ff7e5f\] bg-\[linear-gradient\(135deg,_#ff7e5f_0%,_\S+\)\]$/);
  });

  it("blob offers a clip-path matching the rendered shape", () => {
    const css = extra(blobTool, "clip-path").render(
      blobTool.defaults,
      createRenderContext(4, size),
    );
    const svg = renderStatic(blobTool, blobTool.defaults, 4, size) as string;
    const d = /<path d="([^"]+)"/.exec(svg)?.[1];
    expect(css).toContain(`clip-path: path("${d ?? "?"}");`);
    expect(css).toContain("width: 300px;");
  });

  it("only css-gradient and blob declare extras so far", () => {
    expect(builtInTools.filter((t) => t.extraExports?.length).map((t) => t.id)).toEqual([
      "css-gradient",
      "blob",
    ]);
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

  it("stays fast and bounded on an extreme strip canvas (crafted share link)", () => {
    for (const layout of ["grid", "offset", "scatter"] as const) {
      const { ms, value: svg } = fastest(
        () =>
          renderStatic(polkaDotsTool, { ...polkaDotsTool.defaults, layout, spacing: 2 }, 1, {
            width: 8192,
            height: 16,
          }) as string,
      );
      expect(ms).toBeLessThan(200);
      expect((svg.match(/<circle /g) ?? []).length).toBeLessThanOrEqual(MAX_DOT_SITES);
    }
  });
});

describe("noise-grain", () => {
  const size = { width: 600, height: 400 };
  const render = (params: object, seed = 1, sz = size): string =>
    renderStatic(noiseGrainTool, { ...noiseGrainTool.defaults, ...params }, seed, sz) as string;
  const tile = (svg: string): string | undefined =>
    /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(svg)?.[1];

  it("embeds one seamless grain tile and blends it over the base", () => {
    const svg = render({});
    expect(svg.match(PNG_DATA_URI)).toHaveLength(1);
    expect(svg).toContain(`width="${GRAIN_TILE_EDGE}" height="${GRAIN_TILE_EDGE}"`);
    expect(svg).toContain('opacity="0.4" style="mix-blend-mode:overlay"');
  });

  it("changes the grain with the seed, not with colours, angle or amount", () => {
    const a = tile(render({}));
    expect(tile(render({}, 2))).not.toBe(a);
    expect(tile(render({ color: "#000000", amount: 80, angle: 10 }))).toBe(a);
    expect(tile(render({ size: 2 }))).not.toBe(a);
  });

  it("returns identical output from a cold and a warm tile cache", () => {
    const params = { size: 3.5, mono: false, blend: "soft-light" };
    const first = render(params, 77);
    for (let s = 1000; s < 1020; s++) render({}, s); // evict
    expect(render(params, 77)).toBe(first);
    expect(noiseGrainTileCacheSize()).toBeLessThanOrEqual(16);
  });

  it("stores mono grain as greyscale and colour grain as RGB", () => {
    const mono = tile(render({ mono: true })) ?? "";
    const color = tile(render({ mono: false })) ?? "";
    // About 64 KB vs 192 KB of pixels, base64 encoded.
    expect(mono.length).toBeLessThan(100_000);
    expect(color.length).toBeGreaterThan(2.5 * mono.length);
    expect(color.length).toBeLessThan(300_000);
  });

  it("drops the grain layer at amount 0", () => {
    const svg = render({ amount: 0 });
    expect(svg).not.toContain("<pattern");
    expect(svg).not.toContain("data:image");
  });

  it("rejects params outside the caps", () => {
    const bad = [
      { size: 0 },
      { size: 100 },
      { amount: 101 },
      { palette: ["#000", "#111", "#222", "#333"] },
    ];
    for (const p of bad) {
      expect(noiseGrainTool.schema.safeParse({ ...noiseGrainTool.defaults, ...p }).success).toBe(
        false,
      );
    }
  });

  it("stays fast and bounded on the largest and most extreme canvases (crafted share link)", () => {
    for (const sz of [
      { width: 8192, height: 8192 },
      { width: 8192, height: 16 },
    ]) {
      for (const [i, mono] of [true, false].entries()) {
        // A fresh seed per run defeats the tile cache, so the full tile is computed.
        let seed = 5000 + i * 10;
        const { ms, value: svg } = fastest(() =>
          render({ mono, size: 1.5, amount: 100 }, seed++, sz),
        );
        expect(ms).toBeLessThan(150);
        expect(svg.length).toBeLessThan(300_000);
      }
    }
  });
});

describe("M2 SVG generators", () => {
  const countElements = (svg: string): number => (svg.match(/<(circle|rect|path)\b/g) ?? []).length;

  it("scale with the canvas so the element count is size independent", () => {
    for (const tool of [gridPatternsTool, confettiTool, starrySkyTool, dieterDotsTool]) {
      const render = (w: number): string =>
        renderStatic(tool, tool.defaults, 1, { width: w, height: w }) as string;
      const small = countElements(render(500));
      const large = countElements(render(2000));
      // Poisson-disk counts vary slightly between sizes; grids and rings match exactly.
      expect(Math.abs(small - large) / large, tool.id).toBeLessThan(0.05);
    }
  });

  it("stay fast and bounded on extreme canvases with the densest params (crafted share link)", () => {
    const cases: [AnyToolDefinition, Record<string, unknown>][] = [
      [gridPatternsTool, { cellSize: 2, style: "dots" }],
      [gridPatternsTool, { cellSize: 2, style: "squares" }],
      [confettiTool, { spacing: 2 }],
      [starrySkyTool, { density: 1, glow: 1, sparkles: 24 }],
      [dieterDotsTool, { rings: 40, dotsPerRing: 24, ringSpacing: 1 }],
    ];
    for (const [tool, params] of cases) {
      for (const size of [
        { width: 8192, height: 16 },
        { width: 8192, height: 8192 },
      ]) {
        const { ms, value: svg } = fastest(
          () => renderStatic(tool, { ...tool.defaults, ...params }, 1, size) as string,
        );
        expect(ms, `${tool.id} ${size.width}x${size.height}`).toBeLessThan(500);
        // Stars may add a glow per larger star on top of the capped star count.
        const cap = tool === starrySkyTool ? MAX_DOT_SITES * 1.5 : MAX_DOT_SITES + 2;
        expect(countElements(svg), tool.id).toBeLessThanOrEqual(cap);
      }
    }
  });

  it("grid patterns and dieter dots ignore the seed", () => {
    const size = { width: 400, height: 300 };
    for (const tool of [gridPatternsTool, dieterDotsTool]) {
      expect(renderStatic(tool, tool.defaults, 1, size)).toBe(
        renderStatic(tool, tool.defaults, 2, size),
      );
    }
  });

  it("confetti and starry sky change with the seed", () => {
    const size = { width: 400, height: 300 };
    for (const tool of [confettiTool, starrySkyTool]) {
      expect(renderStatic(tool, tool.defaults, 1, size)).not.toBe(
        renderStatic(tool, tool.defaults, 2, size),
      );
    }
  });
});
