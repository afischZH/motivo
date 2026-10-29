/**
 * M4-AP06: tool-level tests of Glass and Border Effects and Bento Grid
 * beyond the generic contract and preset snapshots in tools.test.ts.
 */
import { createRng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { createRenderContext } from "../render";
import { renderStatic } from "../testing";
import type { CssOutput } from "../types";
import type { BentoGridParams } from "./bento-grid";
import type { GlassEffectsParams } from "./glass-effects";
import { bentoGridTool, glassEffectsTool } from "./index";

const size = { width: 1200, height: 800 };
const ctx = (seed = 1) => createRenderContext(seed, size);

function css(p: GlassEffectsParams, seed = 1): CssOutput {
  const out = renderStatic(glassEffectsTool, p, seed, size);
  if (typeof out !== "object" || out === null) throw new Error("expected CSS output");
  return out;
}

function extra(id: string, p: GlassEffectsParams): string {
  const e = glassEffectsTool.extraExports?.find((x) => x.id === id);
  if (!e) throw new Error(`missing extra ${id}`);
  return e.render(p, ctx());
}

describe("glass-effects", () => {
  const glass = glassEffectsTool.defaults;
  const border: GlassEffectsParams = { ...glass, effect: "gradient-border", animated: true };
  const glow: GlassEffectsParams = { ...glass, effect: "glow" };

  it("renders a real card element on the stage", () => {
    const out = css(glass);
    expect(out.css).toMatch(/^background-color: #1e1b4b;\nbackground-image: radial-gradient/);
    expect(out.element).toMatchObject({ x: 300, y: 220, width: 600, height: 360 });
    expect(out.element?.css).toContain("-webkit-backdrop-filter: blur(16px) saturate(160%);");
    expect(out.element?.css).toContain("backdrop-filter: blur(16px) saturate(160%);");
    expect(out.element?.css).toContain("color: #ffffff;");
    expect(out.element?.content?.length).toBe(4);
    expect(out.element?.motionCss).toBeUndefined();
    expect(out.rules).toBeUndefined();
  });

  it("keeps the rules constant and the motion separate for the rotating border", () => {
    const a = css(border);
    const b = css({ ...border, borderPalette: ["#000000", "#ffffff"], speed: 2 }, 7);
    expect(a.rules).toBeDefined();
    expect(a.rules).toBe(b.rules);
    expect(a.element?.motionCss).toBe("animation: musterli-border-spin 6s linear infinite;");
    expect(a.element?.css).not.toContain("animation");
  });

  it("offers images only for border and glow", () => {
    expect(glassEffectsTool.exportsFor?.(glass)).toEqual([]);
    expect(glassEffectsTool.exportsFor?.(border)).toEqual(["png", "webp"]);
    expect(glassEffectsTool.exportsFor?.(glow)).toEqual(["png", "webp"]);
  });

  it("writes CSS, Tailwind and HTML for every effect", () => {
    for (const p of [glass, border, glow]) {
      const cssCode = extra("css", p);
      expect(cssCode).toMatch(/^(?:@property|\.)/);
      expect(extra("tailwind", p)).toMatch(/<div class="/);
      expect(extra("html", p)).toContain('<div class="stage">');
    }
    expect(extra("css", border)).toContain("@media (prefers-reduced-motion: reduce)");
    expect(extra("css", glass)).not.toContain("prefers-reduced-motion");
  });

  it("embeds grain from its own rng stream and caches it", () => {
    const grainy = { ...glass, noise: 40 };
    const a = css(grainy);
    expect(a.element?.css).toMatch(/background-image: url\("data:image\/png;base64,/);
    // Same seed, same tile; another seed, another tile.
    expect(css(grainy).element?.css).toBe(a.element?.css);
    expect(css(grainy, 2).element?.css).not.toBe(a.element?.css);
    // The stage does not move when grain is switched on.
    expect(a.css).toBe(css(glass).css);
  });

  it("warns when text on glass misses AA and stays quiet when it passes", () => {
    const low = glassEffectsTool.advisories?.(
      { ...glass, textColor: "#ffffff", tint: "#ffffff", tintOpacity: 80 },
      ctx(),
    );
    expect(low).toEqual([
      {
        id: "text-contrast",
        messageKey: "tools.glass-effects.advisories.textContrast",
        values: { ratio: expect.stringMatching(/^1\.\d$/) as unknown, required: "4.5" },
      },
    ]);
    const ok = glassEffectsTool.advisories?.(
      { ...glass, textColor: "#ffffff", tint: "#000000", tintOpacity: 85 },
      ctx(),
    );
    expect(ok).toEqual([]);
    // Border and glow check the text against the card surface.
    expect(glassEffectsTool.advisories?.({ ...glow, textColor: "#0f172a" }, ctx())).toHaveLength(1);
    expect(glassEffectsTool.advisories?.({ ...glow, textColor: "#ffffff" }, ctx())).toEqual([]);
  });

  it("keeps the effect when randomising and picks readable text", () => {
    for (let s = 0; s < 30; s++) {
      const next = glassEffectsTool.randomize(createRng(s), glow, new Set());
      expect(next.effect).toBe("glow");
      expect(glassEffectsTool.advisories?.(next, ctx(s))).toEqual([]);
    }
  });

  it("shows the own text in preview and HTML, and keeps it on Space", () => {
    const own: GlassEffectsParams = {
      ...glass,
      title: "Grüezi",
      body: "Mehr Text",
      textAlign: "center",
    };
    expect(glassEffectsTool.schema.safeParse(own).success).toBe(true);
    const content = css(own).element?.content ?? [];
    expect(content.map((b) => b.text)).toEqual(["Grüezi", "Mehr Text"]);
    expect(extra("html", own)).toContain("<h2>Grüezi</h2>");
    const next = glassEffectsTool.randomize(createRng(3), own, new Set());
    expect([next.title, next.body, next.textAlign]).toEqual(["Grüezi", "Mehr Text", "center"]);
    expect(glassEffectsTool.schema.safeParse({ ...own, title: "x".repeat(81) }).success).toBe(
      false,
    );
  });
});

describe("bento-grid", () => {
  const p = bentoGridTool.defaults;
  const svg = (params: BentoGridParams, seed = 1) => {
    const out = renderStatic(bentoGridTool, params, seed, size);
    if (typeof out !== "string") throw new Error("expected SVG");
    return out;
  };
  const tileRects = (s: string) =>
    [
      ...s.matchAll(
        /<rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" rx="[^"]+" fill="#[0-9a-f]{6}"\/>/g,
      ),
    ].map((m) => m[0].replace(/ fill="[^"]+"/, ""));

  it("keeps the layout for a locked layout seed while Space changes colours", () => {
    const locked = bentoGridTool.randomize(createRng(4), p, new Set(["layoutSeed"]));
    expect(locked.layoutSeed).toBe(p.layoutSeed);
    expect(locked.palette).not.toEqual(p.palette);
    expect(tileRects(svg(locked))).toEqual(tileRects(svg(p)));
  });

  it("rolls a new layout without lock", () => {
    const next = bentoGridTool.randomize(createRng(4), p, new Set());
    expect(next.layoutSeed).not.toBe(p.layoutSeed);
    expect(next.columns).toBe(p.columns);
  });

  it("draws the target number of tiles", () => {
    expect(tileRects(svg(p))).toHaveLength(p.tiles);
  });

  it("writes matching CSS grid and Tailwind code", () => {
    const html = bentoGridTool.extraExports?.find((e) => e.id === "css-grid")?.render(p, ctx());
    const tw = bentoGridTool.extraExports?.find((e) => e.id === "tailwind")?.render(p, ctx());
    expect(html?.match(/--col: /g)).toHaveLength(p.tiles);
    expect(tw?.match(/md:col-\[/g)).toHaveLength(p.tiles);
    expect(html).toContain("aspect-ratio: 1200 / 800;");
  });

  it("tolerates maxSpan below minSpan from old links", () => {
    const out = svg({ ...p, minSpan: 3, maxSpan: 1 });
    expect(out).not.toMatch(/NaN|undefined/);
  });
});
