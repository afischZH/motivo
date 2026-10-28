import { CSS_PATTERN_IDS, GRAIN_TILE_EDGE, MAX_DOT_SITES, createRng, crc32 } from "@motivo/engine";
import { describe, expect, it } from "vitest";
import { registry } from "../registry";
import { createRenderContext } from "../render";
import { parseToolParams } from "../randomize";
import { renderStatic, describePresetSnapshots, describeToolContract } from "../testing";
import type { AnyToolDefinition, CssOutput } from "../types";
import {
  blobTool,
  blurryGradientTool,
  builtInTools,
  confettiTool,
  cssGradientTool,
  cssPatternShowcase,
  cssPatternsTool,
  dieterDotsTool,
  gridPatternsTool,
  meshGradientTool,
  noiseGrainTool,
  polkaDotsTool,
  starrySkyTool,
  stripedGradientTool,
  svgWavesTool,
} from "./index";
import type { CssPatternLayer, CssPatternsParams } from "./css-patterns";
import { GRADIENT_GRAIN_EDGE, grainTileCacheSize } from "./grain";
import { noiseGrainTileCacheSize } from "./noise-grain";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing value");
  return value;
}

const defaultLayer = (): CssPatternLayer => required(cssPatternsTool.defaults.layers[0]);

function extra(tool: AnyToolDefinition, id: string) {
  const e = tool.extraExports?.find((x) => x.id === id);
  if (!e) throw new Error(`missing extra export ${id}`);
  return e;
}

// Wall-clock timing for performance budgets in tests only; product code stays deterministic.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;
/**
 * Budget for one render on a crafted, extreme share link. Locally these take
 * 5 to 25 ms; shared CI runners are several times slower and noisy, so the
 * budget is generous and only catches blow-ups (unguarded renders took
 * seconds). The element and size caps next to each check are the exact guard.
 */
const RENDER_BUDGET_MS = 1000;

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
      "blob-composition",
      "doodles",
      "svg-charts",
      "polka-dots",
      "noise-grain",
      "grid-patterns",
      "confetti",
      "starry-sky",
      "dieter-dots",
      "mesh-gradient",
      "blurry-gradient",
      "striped-gradient",
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
    expect(registry.listByCategory("gradients").map((t) => t.id)).toEqual([
      "css-gradient",
      "mesh-gradient",
      "blurry-gradient",
      "striped-gradient",
    ]);
    expect(registry.listByCategory("patterns").map((t) => t.id)).toEqual([
      "css-patterns",
      "doodles",
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
  const layerOf = (p: CssPatternsParams, i: number): CssPatternLayer => {
    const l = p.layers[i];
    if (!l) throw new Error(`no layer ${i}`);
    return l;
  };

  it("renders CSS declarations and an SVG twin of the same size", () => {
    const out = renderStatic(cssPatternsTool, cssPatternsTool.defaults, 1, size) as CssOutput;
    expect(out.css).toMatch(/^background-color: #f8f5ee;\nbackground-image: /);
    expect(out.previewSvg).toContain('width="400" height="300"');
  });

  it("ignores the seed (patterns are fully described by their params)", () => {
    const a = renderStatic(cssPatternsTool, cssPatternsTool.defaults, 1, size);
    expect(renderStatic(cssPatternsTool, cssPatternsTool.defaults, 99, size)).toEqual(a);
  });

  it("has a valid showcase (a stack of one) for every library pattern", () => {
    for (const id of CSS_PATTERN_IDS) {
      const params = cssPatternShowcase(id);
      expect(cssPatternsTool.schema.parse(params)).toEqual(params);
      expect(params.layers).toHaveLength(1);
      expect(layerOf(params, 0).pattern).toBe(id);
    }
    expect(() => cssPatternShowcase("nope")).toThrow(RangeError);
  });

  it("has at least six presets with several layers", () => {
    const stacked = cssPatternsTool.presets.filter((p) => p.params.layers.length > 1);
    expect(stacked.length).toBeGreaterThanOrEqual(6);
  });

  it("stacks visible layers top first and skips hidden ones", () => {
    const params = required(cssPatternsTool.presets.find((p) => p.id === "night-dots")).params;
    const all = renderStatic(cssPatternsTool, params, 1, size) as CssOutput;
    const top = renderStatic(
      cssPatternsTool,
      { ...params, layers: [layerOf(params, 0)] },
      1,
      size,
    ) as CssOutput;
    const imageOf = (css: string) => /background-image: (.*);/.exec(css)?.[1] ?? "";
    expect(imageOf(all.css).startsWith(imageOf(top.css))).toBe(true);
    expect(imageOf(all.css).length).toBeGreaterThan(imageOf(top.css).length);

    const hidden = {
      ...params,
      layers: params.layers.map((l, i) => (i === 0 ? l : { ...l, visible: false })),
    };
    expect(renderStatic(cssPatternsTool, hidden, 1, size)).toEqual(top);

    const none = { ...params, layers: params.layers.map((l) => ({ ...l, visible: false })) };
    const empty = renderStatic(cssPatternsTool, none, 1, size) as CssOutput;
    expect(empty.css).toContain("background-image: none;");
    expect(extra(cssPatternsTool, "tailwind").render(none, createRenderContext(1, size))).toBe(
      "bg-[#0f172a] [background-image:none] [background-size:auto] [background-position:0_0]",
    );
  });

  it("allows one to five layers", () => {
    const five = { ...cssPatternsTool.defaults, layers: Array(5).fill(defaultLayer()) };
    expect(cssPatternsTool.schema.safeParse(five).success).toBe(true);
    expect(cssPatternsTool.schema.safeParse({ ...five, layers: [] }).success).toBe(false);
    expect(
      cssPatternsTool.schema.safeParse({ ...five, layers: [...five.layers, defaultLayer()] })
        .success,
    ).toBe(false);
  });

  it("upgrades single-pattern params (AP03 share links) to a stack of one", () => {
    const old = {
      pattern: "gingham",
      background: "#fffaf5",
      color: "#d62839",
      accent: "#e07a5f",
      size: 28,
      angle: 0,
      opacity: 90,
    };
    const parsed = parseToolParams(cssPatternsTool, old);
    expect(parsed.success && parsed.data).toEqual({
      background: "#fffaf5",
      layers: [
        {
          pattern: "gingham",
          color: "#d62839",
          accent: "#e07a5f",
          size: 28,
          angle: 0,
          opacity: 90,
          visible: true,
        },
      ],
    });
    // Current params pass through untouched; junk stays junk.
    expect(cssPatternsTool.migrateParams?.(cssPatternsTool.defaults)).toBe(
      cssPatternsTool.defaults,
    );
    expect(parseToolParams(cssPatternsTool, { foo: 1 }).success).toBe(false);
    expect(parseToolParams(cssPatternsTool, { ...old, pattern: "nope" }).success).toBe(false);
  });

  it("rejects colours and patterns that could inject CSS (crafted share links)", () => {
    const attacks: Record<string, unknown>[] = [
      { color: "red;background:url(https://evil.example/x)" },
      { accent: "#fff) , url(https://evil.example/x" },
      { color: '#fff"/><script>alert(1)</script>' },
      { pattern: "polka;color:red" },
      { pattern: "__proto__" },
      { size: 1e9 },
      { angle: Number.NaN },
      { opacity: -1 },
      { visible: "yes" },
    ];
    for (const attack of attacks) {
      const params = { ...cssPatternsTool.defaults, layers: [{ ...defaultLayer(), ...attack }] };
      expect(cssPatternsTool.schema.safeParse(params).success, JSON.stringify(attack)).toBe(false);
      // The old single-pattern shape is migrated, then validated just the same.
      if ("visible" in attack) continue; // not part of the old shape
      const flat = { ...defaultLayer(), background: "#ffffff", ...attack };
      expect(parseToolParams(cssPatternsTool, flat).success, JSON.stringify(attack)).toBe(false);
    }
    for (const background of ["#000;}body{display:none", "url(x)"]) {
      expect(
        cssPatternsTool.schema.safeParse({ ...cssPatternsTool.defaults, background }).success,
      ).toBe(false);
    }
  });

  it("only shows the angle for rotatable patterns and the accent where it is used", () => {
    const hints = cssPatternsTool.controls?.params?.layers?.list?.item?.params;
    const show = (key: "angle" | "accent", pattern: string) =>
      hints?.[key]?.visibleWhen?.({ ...defaultLayer(), pattern }) ?? true;
    expect(show("angle", "stripes")).toBe(true);
    expect(show("angle", "polka")).toBe(false);
    expect(show("accent", "dots-duo")).toBe(true);
    expect(show("accent", "polka")).toBe(false);
  });

  it("previews every pattern as a small CSS thumbnail in the layer colours", () => {
    const hints = cssPatternsTool.controls?.params?.layers?.list?.item?.params;
    const preview = hints?.pattern?.optionPreview;
    expect(preview).toBeDefined();
    const item = { ...defaultLayer(), color: "#123456" };
    for (const id of CSS_PATTERN_IDS) {
      const out = preview?.(id, item, cssPatternsTool.defaults);
      expect(out && "css" in out ? out.css : "").toMatch(
        /^background-color: #f8f5ee;\nbackground-image: /,
      );
    }
  });

  it("adds a layer with a pattern that is not in use yet", () => {
    const list = cssPatternsTool.controls?.params?.layers?.list;
    const added = list?.newItem?.(cssPatternsTool.defaults.layers);
    expect(added?.pattern).not.toBe("zigzag");
    const params = { ...cssPatternsTool.defaults, layers: [added] };
    expect(cssPatternsTool.schema.safeParse(params).success).toBe(true);
  });

  it("keeps the layer count, visibility and even sizes when randomising", () => {
    const start = required(cssPatternsTool.presets.find((p) => p.id === "highland")).params;
    const hidden = { ...start, layers: start.layers.map((l, i) => ({ ...l, visible: i !== 1 })) };
    for (let s = 0; s < 50; s++) {
      const out = cssPatternsTool.randomize(createRng(s), hidden, new Set());
      expect(out.layers).toHaveLength(3);
      expect(out.layers.map((l) => l.visible)).toEqual([true, false, true]);
      for (const l of out.layers) expect(l.size % 2).toBe(0);
      expect(cssPatternsTool.schema.safeParse(out).success).toBe(true);
    }
  });

  it("keeps locked fields of single layers when randomising", () => {
    const start = required(cssPatternsTool.presets.find((p) => p.id === "highland")).params;
    const locks = new Set(["layers.1.pattern", "layers.1.color", "layers.2.opacity"] as const);
    const outs = Array.from({ length: 20 }, (_, s) =>
      cssPatternsTool.randomize(createRng(s), start, locks),
    );
    for (const out of outs) {
      expect(layerOf(out, 1).pattern).toBe(layerOf(start, 1).pattern);
      expect(layerOf(out, 1).color).toBe(layerOf(start, 1).color);
      expect(layerOf(out, 2).opacity).toBe(layerOf(start, 2).opacity);
    }
    expect(outs.some((o) => layerOf(o, 0).pattern !== layerOf(start, 0).pattern)).toBe(true);
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
      // Unguarded this took seconds; CI measured 210 ms (see RENDER_BUDGET_MS).
      expect(ms).toBeLessThan(RENDER_BUDGET_MS);
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
        expect(ms).toBeLessThan(RENDER_BUDGET_MS);
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
        expect(ms, `${tool.id} ${size.width}x${size.height}`).toBeLessThan(RENDER_BUDGET_MS);
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

describe.each([
  ["mesh-gradient", meshGradientTool],
  ["blurry-gradient", blurryGradientTool],
  ["striped-gradient", stripedGradientTool],
] as const)("%s", (_, tool) => {
  const size = { width: 600, height: 400 };
  const anyTool = tool as unknown as AnyToolDefinition;
  const render = (params: object, seed = 1): string =>
    renderStatic(anyTool, { ...tool.defaults, ...params }, seed, size) as string;
  const tile = (svg: string): string | undefined =>
    /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(svg)?.[1];

  it("adds a grey grain tile only with a grain amount", () => {
    expect(render({ grain: 0 })).not.toContain("<pattern");
    const svg = render({ grain: 30 });
    expect(svg).toContain(`<pattern id="`);
    expect(svg).toContain(`width="${GRADIENT_GRAIN_EDGE}" height="${GRADIENT_GRAIN_EDGE}"`);
    expect(svg).toContain('opacity="0.3" style="mix-blend-mode:overlay"');
    // Greyscale: 128 x 128 one-byte pixels, about 22 KB base64 (RGB would be about 66 KB).
    expect(tile(svg)?.length).toBeLessThan(30_000);
  });

  it("keeps the grain tile for a seed whatever the other params", () => {
    const a = tile(render({ grain: 20 }));
    expect(tile(render({ grain: 60, palette: ["#000000", "#ffffff"] }))).toBe(a);
    expect(tile(render({ grain: 20 }, 2))).not.toBe(a);
    expect(grainTileCacheSize()).toBeLessThanOrEqual(16);
  });

  it("does not move the geometry when only the grain changes", () => {
    const strip = (svg: string) =>
      svg.replace(/<pattern[\s\S]*?<\/pattern>|<rect [^>]*mix-blend[^>]*>/g, "");
    expect(strip(render({ grain: 0 }))).toBe(strip(render({ grain: 40 })));
  });

  it("keeps the grain amount on a new variant", () => {
    const out = anyTool.randomize(createRng(5), { ...tool.defaults, grain: 33 }, new Set());
    expect((out as { grain: number }).grain).toBe(33);
  });

  it("renders a 4K canvas within the budget", () => {
    const { ms, value } = fastest(() =>
      renderStatic(anyTool, tool.defaults, 3, { width: 3840, height: 2160 }),
    );
    expect(typeof value).toBe("string");
    expect(ms).toBeLessThan(RENDER_BUDGET_MS);
  });

  it("rejects out-of-range params", () => {
    for (const p of [{ grain: 101 }, { grain: -1 }, { palette: ["#fff"] }]) {
      expect(tool.schema.safeParse({ ...tool.defaults, ...p }).success).toBe(false);
    }
  });
});

describe("mesh-gradient", () => {
  it("uses one Gaussian blur and no turbulence", () => {
    const svg = renderStatic(meshGradientTool, meshGradientTool.defaults, 1, {
      width: 600,
      height: 400,
    }) as string;
    expect(svg.match(/<feGaussianBlur /g)).toHaveLength(1);
    expect(svg).not.toContain("feTurbulence");
    expect(svg.match(/<path /g)).toHaveLength(meshGradientTool.defaults.points);
  });

  it("keeps a transparent background on a new variant", () => {
    const out = meshGradientTool.randomize(
      createRng(2),
      { ...meshGradientTool.defaults, background: "transparent" },
      new Set(),
    );
    expect(out.background).toBe("transparent");
  });

  it("rejects too few or too many points", () => {
    for (const points of [2, 9, 4.5]) {
      expect(
        meshGradientTool.schema.safeParse({ ...meshGradientTool.defaults, points }).success,
      ).toBe(false);
    }
  });
});

describe("blurry-gradient", () => {
  it("draws one radial gradient per circle and no filter", () => {
    const svg = renderStatic(blurryGradientTool, blurryGradientTool.defaults, 1, {
      width: 600,
      height: 400,
    }) as string;
    expect(svg.match(/<radialGradient /g)).toHaveLength(blurryGradientTool.defaults.circles);
    expect(svg).not.toContain("<filter");
  });

  it("rejects unknown layouts and circle counts", () => {
    for (const p of [{ layout: "grid" }, { circles: 6 }, { circles: 1 }]) {
      expect(
        blurryGradientTool.schema.safeParse({ ...blurryGradientTool.defaults, ...p }).success,
      ).toBe(false);
    }
  });
});

describe("striped-gradient", () => {
  it("draws one gradient rect per stripe", () => {
    const svg = renderStatic(
      stripedGradientTool,
      { ...stripedGradientTool.defaults, shading: 0 },
      1,
      { width: 600, height: 400 },
    ) as string;
    expect(svg.match(/<rect /g)).toHaveLength(stripedGradientTool.defaults.stripes);
  });

  it("caps the stripe count so params cannot inflate the SVG", () => {
    expect(
      stripedGradientTool.schema.safeParse({ ...stripedGradientTool.defaults, stripes: 41 })
        .success,
    ).toBe(false);
  });
});
