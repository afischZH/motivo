import { CSS_PATTERN_IDS, GRAIN_TILE_EDGE, MAX_DOT_SITES, createRng, crc32 } from "@motivo/engine";
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
  cssPatternShowcase,
  cssPatternsTool,
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
      "css-patterns",
      "blob",
      "svg-waves",
      "polka-dots",
      "noise-grain",
      "grid-patterns",
      "confetti",
      "starry-sky",
      "dieter-dots",
      "palette-generator",
      "tints-shades",
      "tailwind-palette",
      "palette-from-image",
    ]);
    expect(registry.listByCategory("colors").map((t) => t.id)).toEqual([
      "palette-generator",
      "tints-shades",
      "tailwind-palette",
      "palette-from-image",
    ]);
    expect(registry.listByCategory("gradients").map((t) => t.id)).toEqual(["css-gradient"]);
    expect(registry.listByCategory("patterns").map((t) => t.id)).toEqual([
      "css-patterns",
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

describe("css-patterns", () => {
  const size = { width: 400, height: 300 };

  it("renders CSS declarations and an SVG twin of the same size", () => {
    const out = renderStatic(cssPatternsTool, cssPatternsTool.defaults, 1, size) as CssOutput;
    expect(out.css).toMatch(/^background-color: #f8f5ee;\nbackground-image: /);
    expect(out.previewSvg).toContain('width="400" height="300"');
  });

  it("ignores the seed (patterns are fully described by their params)", () => {
    const a = renderStatic(cssPatternsTool, cssPatternsTool.defaults, 1, size);
    expect(renderStatic(cssPatternsTool, cssPatternsTool.defaults, 99, size)).toEqual(a);
  });

  it("has a valid showcase for every library pattern", () => {
    for (const id of CSS_PATTERN_IDS) {
      const params = cssPatternShowcase(id);
      expect(cssPatternsTool.schema.parse(params)).toEqual(params);
      expect(params.pattern).toBe(id);
    }
    expect(() => cssPatternShowcase("nope")).toThrow(RangeError);
  });

  it("rejects colours and patterns that could inject CSS (crafted share links)", () => {
    const attacks: Record<string, unknown>[] = [
      { color: "red;background:url(https://evil.example/x)" },
      { accent: "#fff) , url(https://evil.example/x" },
      { background: "#000;}body{display:none" },
      { background: "url(x)" },
      { color: '#fff"/><script>alert(1)</script>' },
      { pattern: "polka;color:red" },
      { pattern: "__proto__" },
      { size: 1e9 },
      { angle: Number.NaN },
      { opacity: -1 },
    ];
    for (const attack of attacks) {
      const parsed = cssPatternsTool.schema.safeParse({ ...cssPatternsTool.defaults, ...attack });
      expect(parsed.success, JSON.stringify(attack)).toBe(false);
    }
  });

  it("only shows the angle for rotatable patterns and the accent where it is used", () => {
    const hints = cssPatternsTool.controls?.params;
    const show = (key: "angle" | "accent", pattern: string) =>
      hints?.[key]?.visibleWhen?.({ ...cssPatternsTool.defaults, pattern }) ?? true;
    expect(show("angle", "stripes")).toBe(true);
    expect(show("angle", "polka")).toBe(false);
    expect(show("accent", "dots-duo")).toBe(true);
    expect(show("accent", "polka")).toBe(false);
  });

  it("keeps the size even and in range when randomising", () => {
    for (let s = 0; s < 50; s++) {
      const out = cssPatternsTool.randomize(createRng(s), cssPatternsTool.defaults, new Set());
      expect(out.size % 2).toBe(0);
      expect(cssPatternsTool.schema.safeParse(out).success).toBe(true);
    }
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

  it("css-patterns offers Tailwind classes for the same declarations", () => {
    const out = extra(cssPatternsTool, "tailwind").render(
      cssPatternsTool.defaults,
      createRenderContext(1, size),
    );
    expect(out).toMatch(/^bg-\[#f8f5ee\] \[background-image:linear-gradient\(/);
    expect(out.split(" ").every((c) => /^(?:bg-)?\[[^\s]+\]$/.test(c))).toBe(true);
  });

  it("only css-gradient, css-patterns, blob and the colour tools declare extras so far", () => {
    expect(builtInTools.filter((t) => t.extraExports?.length).map((t) => t.id)).toEqual([
      "css-gradient",
      "css-patterns",
      "blob",
      "palette-generator",
      "tints-shades",
      "tailwind-palette",
      "palette-from-image",
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
