/**
 * M4b-AP01: Topographic lines and flow fields. Size and time budgets of the
 * SVG output for defaults, presets and extreme params, brand palette, and
 * the "time" animation (moving levels, travelling dashes).
 */
import { describe, expect, it } from "vitest";
import { planAnimationFrames } from "../animation";
import { applyBrandPalette } from "../brand-palette";
import { createRenderContext } from "../render";
import { renderStatic } from "../testing";
import type { AnyToolDefinition } from "../types";
import { flowFieldTool, topoLinesTool } from "./index";

const FULL_HD = { width: 1920, height: 1080 };
/** Documented SVG budget (docs/TOOLS.md K1, K2). */
const SVG_BUDGET = 1.5 * 1024 * 1024;
/**
 * Generous wall-clock budget per render: locally 15 to 40 ms at defaults,
 * shared CI runners are several times slower and noisy. Catches blow-ups;
 * the caps in the engine (`TOPO_*_MAX`, `FLOW_*_MAX`) are the exact guard.
 */
const RENDER_BUDGET_MS = 1000;

// Wall-clock timing for performance budgets in tests only; product code stays deterministic.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;

function fastest(fn: () => unknown): number {
  let best = Infinity;
  fn();
  for (let i = 0; i < 3; i++) {
    const start = clock.now();
    fn();
    best = Math.min(best, clock.now() - start);
  }
  return best;
}

const svgOf = (tool: AnyToolDefinition, params: unknown, size = FULL_HD): string => {
  const out = renderStatic(tool, params, 1, size);
  if (typeof out !== "string") throw new Error("expected SVG");
  return out;
};

describe.each([
  ["topo-lines", topoLinesTool as AnyToolDefinition],
  ["flow-field", flowFieldTool as AnyToolDefinition],
])("%s budgets", (_, tool) => {
  it("keeps defaults and every preset under the SVG budget", () => {
    for (const params of [tool.defaults, ...tool.presets.map((p) => p.params)]) {
      expect(svgOf(tool, params).length).toBeLessThan(SVG_BUDGET);
    }
  });

  it("keeps the default SVG compact (under 400 KB)", () => {
    expect(svgOf(tool, tool.defaults).length).toBeLessThan(400 * 1024);
  });

  it("renders the defaults within the time budget", () => {
    expect(fastest(() => svgOf(tool, tool.defaults))).toBeLessThan(RENDER_BUDGET_MS);
  });

  it("does the same work at 8K (output independent of the canvas size)", () => {
    const small = svgOf(tool, tool.defaults, { width: 1080, height: 1080 });
    const large = svgOf(tool, tool.defaults, { width: 8192, height: 8192 });
    expect(large.length).toBeLessThan(small.length * 1.5);
  });
});

describe("extreme params stay within the budgets", () => {
  it("topo-lines", () => {
    const p = topoLinesTool.schema.parse({
      ...topoLinesTool.defaults,
      scale: 15,
      octaves: 6,
      roughness: 1,
      warp: 1,
      levels: 40,
      style: "bands-lines",
    });
    let svg = "";
    const ms = fastest(() => (svg = svgOf(topoLinesTool, p)));
    expect(ms).toBeLessThan(RENDER_BUDGET_MS);
    // Bands and lines share the points, so both together get twice the budget.
    expect(svg.length).toBeLessThan(2 * SVG_BUDGET);
    const lines = svgOf(topoLinesTool, { ...p, style: "lines" });
    expect(lines.length).toBeLessThan(SVG_BUDGET);
  });

  it("flow-field", () => {
    const p = flowFieldTool.schema.parse({
      ...flowFieldTool.defaults,
      spacing: 1,
      separation: 0,
      seeding: "random",
      maxLines: 4000,
      length: 200,
      step: 1,
      lineWidth: 16,
      taper: "both",
    });
    let svg = "";
    const ms = fastest(() => (svg = svgOf(flowFieldTool, p)));
    expect(ms).toBeLessThan(RENDER_BUDGET_MS);
    expect(svg.length).toBeLessThan(SVG_BUDGET);
  });
});

describe("brand palette", () => {
  it("topo-lines takes the palette and the darkest colour for the lines", () => {
    const out = applyBrandPalette(
      topoLinesTool,
      topoLinesTool.defaults,
      ["#ffd166", "#06d6a0", "#073b4c"],
      new Set(),
    );
    expect(out?.params.palette).toEqual(["#ffd166", "#06d6a0", "#073b4c"]);
    expect(out?.params.lineColor).toBe("#073b4c");
  });

  it("flow-field takes the palette", () => {
    const out = applyBrandPalette(flowFieldTool, flowFieldTool.defaults, ["#111111", "#eeeeee"]);
    expect(out?.params.palette).toEqual(["#111111", "#eeeeee"]);
  });
});

describe("time animation", () => {
  it.each([
    ["topo-lines", topoLinesTool as AnyToolDefinition],
    ["flow-field", flowFieldTool as AnyToolDefinition],
  ])("%s changes every frame and loops back", (_, tool) => {
    const frames = planAnimationFrames(tool, tool.defaults, 7, "time", 4);
    const size = { width: 480, height: 320 };
    const svgs = frames.map((f) => {
      if (tool.render.kind !== "svg") throw new Error("expected an SVG tool");
      return tool.render.render(f.params as never, createRenderContext(f.seed, size, f.t));
    });
    expect(new Set(svgs).size).toBe(4);
    if (tool.render.kind !== "svg") return;
    const next = tool.render.render(tool.defaults as never, createRenderContext(7, size, 1));
    expect(next).toBe(svgs[0]);
  });
});
