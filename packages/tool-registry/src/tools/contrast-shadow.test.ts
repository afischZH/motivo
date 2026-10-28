/**
 * M4-AP05: contrast checker suggestions and brand palette, CSS shadow
 * render path (stage + element + SVG twin) and code exports.
 */
import { contrastRatio, sampleTargets } from "@musterli/engine";
import { describe, expect, it } from "vitest";
// Test-only cross-package import; the messages live in the web app.
import de from "../../../../apps/web/messages/de.json";
import en from "../../../../apps/web/messages/en.json";
import { applyBrandPalette } from "../brand-palette";
import { createRenderContext } from "../render";
import type { CssOutput } from "../types";
import {
  CONTRAST_SUGGESTION_IDS,
  contrastCheckerTool,
  contrastSuggestions,
  cssShadowTool,
  type ContrastCheckerParams,
  type CssShadowParams,
} from "./index";

const ctx = createRenderContext(1, { width: 960, height: 640 });

function lookup(messages: unknown, key: string): unknown {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

describe("contrast checker suggestions", () => {
  const p = (patch: Partial<ContrastCheckerParams>): ContrastCheckerParams => ({
    ...contrastCheckerTool.defaults,
    ...patch,
  });

  it("offers AAA for the default (AA passes already)", () => {
    const ids = contrastSuggestions(contrastCheckerTool.defaults).map((s) => s.id);
    // No background reaches 7:1 against #5b6b7f (white gives 5.4:1), so only the text colour.
    expect(ids).toEqual(["foreground-aaa"]);
  });

  it.each([
    ["#7bc8a4", "#ffffff", "body"],
    ["#e4572e", "#ffffff", "body"],
    ["#ffffff", "#ffbe0b", "heading"],
    ["#a3a3a3", "#ffffff", "ui"],
  ] as const)("%s on %s (%s): every patch reaches its target", (fg, bg, sample) => {
    const params = p({ foreground: fg, background: bg, sample });
    const list = contrastSuggestions(params);
    expect(list.length).toBeGreaterThan(0);
    const targets = sampleTargets(sample);
    for (const s of list) {
      const next = contrastCheckerTool.schema.parse({ ...params, ...s.patch });
      const target = s.id.endsWith("aaa") ? targets.aaa : targets.aa;
      expect(target).not.toBeNull();
      expect(contrastRatio(next.foreground, next.background)).toBeGreaterThanOrEqual(
        target as number,
      );
      expect(s.swatch).toBe(s.patch.foreground ?? s.patch.background);
      expect(s.values?.color).toBe(s.swatch);
    }
    // Deterministic.
    expect(contrastSuggestions(params)).toEqual(list);
  });

  it("offers nothing when the pair passes everything or in matrix mode", () => {
    expect(contrastSuggestions(p({ foreground: "#000000", background: "#ffffff" }))).toEqual([]);
    expect(contrastSuggestions(p({ pairs: true, foreground: "#cccccc" }))).toEqual([]);
  });

  it("has a UI component sample without AAA", () => {
    const ids = contrastSuggestions(p({ foreground: "#cfcfcf", sample: "ui" })).map((s) => s.id);
    expect(ids).toEqual(["foreground-aa", "background-aa"]);
  });

  it.each([
    ["de", de],
    ["en", en],
  ] as const)("has %s labels for every suggestion", (_, messages) => {
    for (const id of CONTRAST_SUGGESTION_IDS) {
      const label = lookup(messages, `tools.contrast-checker.suggestions.${id}`);
      expect(typeof label).toBe("string");
      expect(label).toContain("{color}");
      expect(label).toContain("{ratio}");
    }
  });

  it("takes text and background from a brand palette", () => {
    const result = applyBrandPalette(contrastCheckerTool, contrastCheckerTool.defaults, [
      "#112233",
      "#f0e0d0",
      "#ff8800",
    ]);
    expect(result?.params.foreground).toBe("#112233");
    expect(result?.params.background).toBe("#f0e0d0");
    expect(result?.params.palette).toEqual(["#112233", "#f0e0d0", "#ff8800"]);
  });
});

describe("css shadow", () => {
  const render = (patch: Partial<CssShadowParams> = {}): CssOutput => {
    const r = cssShadowTool.render;
    if (r.kind !== "css") throw new Error("expected a css renderer");
    return r.render({ ...cssShadowTool.defaults, ...patch }, ctx);
  };
  const extra = (id: string, patch: Partial<CssShadowParams> = {}): string => {
    const e = cssShadowTool.extraExports?.find((x) => x.id === id);
    if (!e) throw new Error(`missing ${id}`);
    return e.render({ ...cssShadowTool.defaults, ...patch }, ctx);
  };

  it("styles a centred element on the stage with one shadow per layer", () => {
    const out = render();
    const element = out.element;
    if (!element) throw new Error("expected an element");
    expect(element.css).toMatch(/^background-color: #ffffff;\nborder-radius: 16px;\nbox-shadow: /);
    expect(element.css.match(/rgb\(/g)).toHaveLength(cssShadowTool.defaults.layers);
    expect(element.x * 2 + element.width).toBe(ctx.width);
    expect(element.y * 2 + element.height).toBe(ctx.height);
    expect(out.css).toMatch(/background-image: linear-gradient\(/);
    // The stage is preview only: the CSS export is the element's declarations.
    const css = extra("css");
    expect(css).toBe(`${element.css}\n`);
    expect(css).not.toContain("gradient");
    expect(out.previewSvg).toContain("feGaussianBlur");
  });

  it("lives in the CSS effects category and exports code as an extra", () => {
    expect(cssShadowTool.category).toEqual(["css-effects"]);
    expect(cssShadowTool.exports).not.toContain("css");
  });

  it("uses the chosen colour only without auto colour", () => {
    expect(render({ autoColor: false, color: "#ff0000" }).element?.css).toContain("rgb(255 0 0 /");
    expect(render({ autoColor: true, color: "#ff0000" }).element?.css).not.toContain(
      "rgb(255 0 0 /",
    );
  });

  it("exports the same layers as Tailwind, @theme, variable and drop-shadow", () => {
    const tw = extra("tailwind");
    const cls = /class="([^"]+)"/.exec(tw)?.[1] ?? "";
    expect(cls.split(" ")).toHaveLength(3);
    expect(cls).toMatch(/shadow-\[[^\s]+\]/);
    expect(extra("tailwind-theme")).toMatch(/^@theme \{\n {2}--shadow-soft:\n/);
    expect(extra("tailwind-theme", { name: "Card Lift" })).toContain("--shadow-card-lift:");
    expect(extra("css-variable")).toContain("box-shadow: var(--shadow-soft);");
    const drop = extra("drop-shadow");
    expect(drop.match(/drop-shadow\([-\d]/g)).toHaveLength(cssShadowTool.defaults.layers);
    expect(drop).toContain("no spread");
    expect(extra("drop-shadow", { inset: true, spread: 0 })).toContain("no inset");
  });

  it("marks every layer inset for inner shadows", () => {
    const css = render({ inset: true }).element?.css ?? "";
    expect(css.match(/inset /g)).toHaveLength(cssShadowTool.defaults.layers);
    expect(render({ inset: true }).previewSvg).toContain("clip-path");
  });
});
