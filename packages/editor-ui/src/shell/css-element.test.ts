/**
 * M4-AP06: CSS outputs with an element (glass card, gradient border) and
 * params-dependent export formats.
 */
import { registry, type AnyToolDefinition } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import { listExportChoices } from "../export/export-model";
import { cssToStyle, renderMotif } from "./render";

function tool(id: string): AnyToolDefinition {
  const t = registry.get(id);
  if (!t) throw new Error(`${id} missing`);
  return t;
}

const size = { width: 600, height: 400 };

describe("renderMotif with a CSS element", () => {
  it("parses the element, its motion and content, and passes the rules on", () => {
    const glass = tool("glass-effects");
    const params = { ...glass.defaults, effect: "gradient-border", animated: true };
    const out = renderMotif(glass, params, 1, size);
    if (out.kind !== "css" || !out.element) throw new Error("expected a CSS element");
    expect(out.element).toMatchObject({ x: 150, y: 110, width: 300, height: 180 });
    expect(out.element.motion).toEqual([
      ["animation", ["musterli-border-spin 6s linear infinite"]],
    ]);
    expect(out.element.content.length).toBeGreaterThan(0);
    expect(out.rules).toContain("@property --musterli-border-angle");
    const style = cssToStyle(out.element.declarations);
    expect(style["--musterli-border-angle"]).toBe("0deg");
    expect(style.background).toMatch(/padding-box, conic-gradient\(from calc\(/);
  });

  it("maps the -webkit- backdrop filter to a React style key", () => {
    const glass = tool("glass-effects");
    const out = renderMotif(glass, glass.defaults, 1, size);
    if (out.kind !== "css" || !out.element) throw new Error("expected a CSS element");
    const style = cssToStyle(out.element.declarations);
    expect(style.WebkitBackdropFilter).toBe("blur(16px) saturate(160%)");
    expect(style.backdropFilter).toBe("blur(16px) saturate(160%)");
    expect(out.rules).toBeUndefined();
  });

  it("leaves outputs without an element unchanged", () => {
    const out = renderMotif(tool("css-gradient"), tool("css-gradient").defaults, 1, size);
    expect(out.kind === "css" && out.element).toBeFalsy();
  });
});

describe("listExportChoices with params", () => {
  it("offers code only for glass and images for border and glow", () => {
    const glass = tool("glass-effects");
    expect(listExportChoices(glass, glass.defaults).map((c) => c.id)).toEqual([
      "extra:css",
      "extra:tailwind",
      "extra:html",
    ]);
    expect(
      listExportChoices(glass, { ...glass.defaults, effect: "glow" }).map((c) => c.id),
    ).toEqual(["png", "webp", "extra:css", "extra:tailwind", "extra:html"]);
  });

  it("offers images, SVG and code for the bento grid", () => {
    const bento = tool("bento-grid");
    expect(listExportChoices(bento, bento.defaults).map((c) => c.id)).toEqual([
      "png",
      "jpg",
      "webp",
      "svg",
      "extra:css-grid",
      "extra:tailwind",
    ]);
  });
});
