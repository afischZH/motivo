/**
 * M4b-AP04: Screenshot beautifier (docs/TOOLS.md K6): backdrops from other
 * tools, uploads (raster and sanitised SVG), randomise, brand palette,
 * migration and size presets.
 */
import { createRng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { applyBrandPalette } from "../brand-palette";
import { CANVAS_EDGE_MAX, CANVAS_EDGE_MIN } from "../common";
import { parseToolParams } from "../randomize";
import { checkSvg, renderStatic } from "../testing";
import type { CssOutput } from "../types";
import { clearSvgAssetCache } from "../svg-asset";
import {
  BACKDROPS,
  BACKDROP_TOOLS,
  backdropParams,
  backdropSvg,
  type ScreenshotBeautifierParams,
} from "./screenshot-beautifier";
import { screenshotBeautifierTool as tool } from "./index";

const size = { width: 1600, height: 900 };
const output = (p: ScreenshotBeautifierParams, seed = 1, at = size) =>
  renderStatic(tool, p, seed, at) as CssOutput;
/** The finished picture (exports). */
const render = (p: ScreenshotBeautifierParams, seed = 1) => output(p, seed).previewSvg ?? "";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const raster = { kind: "raster", href: PNG, width: 2560, height: 1600, name: "shot.png" } as const;

describe("backdrops", () => {
  it("offers every preset of every backdrop tool", () => {
    const expected = BACKDROP_TOOLS.flatMap((t) => t.presets.map((p) => `${t.id}/${p.id}`));
    expect(BACKDROPS.map((b) => b.id)).toEqual(expected);
    expect(BACKDROP_TOOLS.every((t) => t.render.kind === "svg" && !t.localParams)).toBe(true);
  });

  it("renders each backdrop with its own colours and with a palette", () => {
    const palette = ["#102030", "#ff8800", "#00aaff", "#aa00ff"];
    for (const b of BACKDROPS) {
      for (const colors of [null, palette]) {
        const svg = backdropSvg(b, colors, 7, 160, 90);
        expect(checkSvg(svg), b.id).toEqual([]);
      }
      const mapped = backdropParams(b, palette);
      expect(parseToolParams(b.tool, mapped).success, b.id).toBe(true);
    }
  });

  it("is the backdrop tool's own picture for this seed and size", () => {
    const b = BACKDROPS.find((x) => x.id === "mesh-gradient/nebula");
    if (!b) throw new Error("missing backdrop");
    const own = renderStatic(b.tool, b.preset.params, 5, size);
    const p = { ...tool.defaults, backdrop: b.id, backdropColors: "preset" as const };
    expect(render(p, 5)).toContain(own as string);
  });

  it("puts the first palette colour into the backdrop's background", () => {
    const b = BACKDROPS.find((x) => x.id === "mesh-gradient/lagoon");
    if (!b) throw new Error("missing backdrop");
    const mapped = backdropParams(b, ["#111111", "#222222", "#333333"]);
    expect(mapped.background).toBe("#111111");
    expect(mapped.palette).toEqual(["#222222", "#333333"]);
  });

  it("falls back to the default backdrop for unknown ids (presets removed upstream)", () => {
    const parsed = parseToolParams(tool, { ...tool.defaults, backdrop: "gone/away" });
    expect(parsed.success && (parsed.data as ScreenshotBeautifierParams).backdrop).toBe(
      tool.defaults.backdrop,
    );
  });

  it("draws solid and gradient backgrounds without other tools", () => {
    const solid = render({ ...tool.defaults, backgroundType: "solid", backgroundColor: "#abcdef" });
    expect(solid).toContain('fill="#abcdef"');
    const gradient = render({ ...tool.defaults, backgroundType: "gradient" });
    expect(gradient).toContain("<linearGradient");
  });
});

describe("uploads", () => {
  it("shows the placeholder until a picture is there", () => {
    expect(render(tool.defaults)).not.toContain("xMidYMid slice");
    const svg = render({ ...tool.defaults, screenshot: raster });
    expect(svg).toContain(`xlink:href="${PNG}"`);
    expect(checkSvg(svg)).toEqual([]);
  });

  it("embeds an SVG screenshot sanitised, as an image only", () => {
    clearSvgAssetCache();
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10"><script>alert(1)</script><rect width="16" height="10" onclick="alert(2)"/></svg>';
    const svg = render({
      ...tool.defaults,
      screenshot: { kind: "svg", svg: hostile, width: 16, height: 10, name: "x.svg" },
    });
    const href = /xlink:href="data:image\/svg\+xml;base64,([^"]+)"/.exec(svg)?.[1];
    expect(href).toBeDefined();
    const inner = (globalThis as unknown as { atob(s: string): string }).atob(href ?? "");
    expect(inner).toContain("<rect");
    expect(inner).not.toMatch(/script|onclick/i);
    expect(svg).not.toMatch(/<script|onclick/);
  });

  it("caps the screenshot schema at 3840 px and keeps it and the address local", () => {
    const shape = tool.schema.shape.screenshot;
    expect(shape.safeParse({ ...raster, width: 3840, height: 2160 }).success).toBe(true);
    expect(shape.safeParse({ ...raster, width: 3841, height: 2160 }).success).toBe(false);
    expect(shape.safeParse({ ...raster, href: "data:text/html;base64,PHA+" }).success).toBe(false);
    expect(tool.localParams).toEqual([
      "screenshot",
      "url",
      "screenshotTablet",
      "screenshotPhone",
      "live",
    ]);
  });
});

/** The stage SVG inside the CSS background data URL. */
const stageOf = (css: string) => decodeURIComponent(/charset=utf-8,([^"]*)"/.exec(css)?.[1] ?? "");

describe("layered preview", () => {
  it("shows the whole picture as the stage without an upload", () => {
    const out = output(tool.defaults);
    expect(out.element).toBeUndefined();
    expect(stageOf(out.css)).toContain(out.previewSvg ?? "-");
  });

  it("puts the screenshot on an element over a stage without it", () => {
    const p = { ...tool.defaults, screenshot: raster, frame: "browser" as const, highlight: true };
    const out = output(p);
    const stage = stageOf(out.css);
    expect(stage).not.toContain(PNG);
    expect(out.previewSvg).toContain(PNG);
    const el = out.element;
    expect(el).toBeDefined();
    if (!el) return;
    expect(el.css).toContain(`background-image: url("${PNG}")`);
    expect(el.css).toContain("box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.35)");
    // Same place as the <image> in the SVG: window x, picture below the bar.
    const img = /<image x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(
      out.previewSvg ?? "",
    );
    const bar = Number(/background-position: 0 ([\d.]+)px/.exec(el.css)?.[1]);
    expect(Number(img?.[1])).toBeCloseTo(el.x, 1);
    expect(Number(img?.[2])).toBeCloseTo(el.y + bar, 1);
    expect(Number(img?.[3])).toBeCloseTo(el.width, 1);
    expect(Number(img?.[4])).toBeCloseTo(el.height - bar, 1);
  });

  it("keeps quotes out of the CSS url", () => {
    const odd = { ...raster, href: `${PNG}` };
    const out = output({ ...tool.defaults, screenshot: odd });
    expect(out.element?.css).not.toMatch(/url\("[^"]*"[^;]*"\)/);
  });
});

describe("variants and colours", () => {
  const current: ScreenshotBeautifierParams = {
    ...tool.defaults,
    screenshot: raster,
    url: "example.com",
    frame: "window",
    radius: 30,
  };

  it("rolls a new background only and keeps the picture", () => {
    const next = tool.randomize(createRng(3), current, new Set());
    for (const key of ["screenshot", "url", "frame", "radius", "shadow", "padding"] as const) {
      expect(next[key]).toEqual(current[key]);
    }
    expect(next.palette).not.toEqual(current.palette);
    expect(tool.schema.safeParse(next).success).toBe(true);
  });

  it("applies a brand palette to the background", () => {
    const result = applyBrandPalette(tool, current, ["#112233", "#445566", "#778899"]);
    expect(result).not.toBeNull();
    const p = result?.params as ScreenshotBeautifierParams;
    expect(p.palette).toEqual(["#112233", "#445566", "#778899"]);
    expect(p.backgroundColor).toBe("#112233");
    expect(p.backdropColors).toBe("palette");
    expect(p.screenshot).toEqual(raster);
    expect(render(p)).toContain("#112233");
  });
});

describe("sizes and exports", () => {
  it("suggests valid, unique output sizes including Product Hunt", () => {
    const presets = tool.sizePresets ?? [];
    expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
    for (const p of presets) {
      for (const edge of [p.width, p.height]) {
        expect(edge).toBeGreaterThanOrEqual(CANVAS_EDGE_MIN);
        expect(edge).toBeLessThanOrEqual(CANVAS_EDGE_MAX);
      }
    }
    expect(presets).toContainEqual(expect.objectContaining({ width: 1270, height: 760 }));
    expect(tool.defaultSize).toEqual({ width: 1600, height: 900 });
  });

  it("exports raster images first and SVG with the picture embedded", () => {
    expect(tool.exports).toEqual(["png", "jpg", "webp", "svg"]);
    for (const p of tool.presets) {
      const svg =
        output({ ...p.params, screenshot: raster }, 1, { width: 1270, height: 760 }).previewSvg ??
        "";
      expect(checkSvg(svg), p.id).toEqual([]);
      expect(svg).toContain(PNG);
    }
  });
});
