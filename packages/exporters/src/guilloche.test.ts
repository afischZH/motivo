/**
 * Export smoke test of Guilloche (M4b-AP03): the offered formats and a
 * standalone SVG that is the preview render (one render path).
 */
import { createRenderContext, guillocheTool as tool } from "@musterli/tool-registry";
import { checkSvg } from "@musterli/tool-registry/testing";
import { describe, expect, it } from "vitest";
import { ExportError } from "./errors";
import { exportCss, exportSvg, supportsExport } from "./text";

const ctx = () => createRenderContext(1, { width: 1200, height: 1200 });

describe("guilloche exports", () => {
  it("offers SVG, raster and GIF, but no CSS", () => {
    for (const f of ["svg", "png", "jpg", "webp", "gif"] as const) {
      expect(supportsExport(tool, f), f).toBe(true);
    }
    expect(supportsExport(tool, "css")).toBe(false);
    expect(() => exportCss(tool, tool.defaults, ctx())).toThrow(ExportError);
  });

  it("exports the preview render as a well-formed SVG for every preset", () => {
    if (tool.render.kind !== "svg") throw new Error("svg tool expected");
    for (const p of [tool.defaults, ...tool.presets.map((x) => x.params)]) {
      const svg = exportSvg(tool, p, ctx());
      expect(svg).toBe(tool.render.render(p, ctx()));
      expect(checkSvg(svg)).toEqual([]);
    }
  });
});
