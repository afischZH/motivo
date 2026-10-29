/**
 * M5-AP03: 3D Perspective Grid. Size and time budgets of the SVG output, the
 * seamless "time" animation (frame 0 = preview), randomize with locks and
 * the generic brand palette.
 */
import { describe, expect, it } from "vitest";
import { planAnimationFrames } from "../animation";
import { applyBrandPalette } from "../brand-palette";
import { createRenderContext } from "../render";
import { renderStatic } from "../testing";
import { createRng } from "@musterli/engine";
import { perspectiveGridTool } from "./perspective-grid";

const FULL_HD = { width: 1920, height: 1080 };

const svgOf = (params: unknown, size = FULL_HD, t?: number): string => {
  const out = renderStatic(perspectiveGridTool, params, 1, size, t);
  if (typeof out !== "string") throw new Error("expected SVG");
  return out;
};

const render = (params: unknown, seed: number, t?: number): string => {
  const tool = perspectiveGridTool;
  if (tool.render.kind !== "svg") throw new Error("expected an SVG tool");
  return tool.render.render(
    params as never,
    createRenderContext(seed, { width: 480, height: 320 }, t),
  );
};

describe("perspective-grid budgets", () => {
  it("keeps defaults and every preset compact (under 120 KB)", () => {
    for (const params of [
      perspectiveGridTool.defaults,
      ...perspectiveGridTool.presets.map((p) => p.params),
    ]) {
      expect(svgOf(params).length).toBeLessThan(120 * 1024);
    }
  });

  it("does the same work at 8K (output independent of the canvas size)", () => {
    const small = svgOf(perspectiveGridTool.defaults, { width: 1080, height: 1080 });
    const large = svgOf(perspectiveGridTool.defaults, { width: 8192, height: 8192 });
    expect(large.length).toBeLessThan(small.length * 1.5);
  });

  it("stays under 300 KB at the schema limits", () => {
    const p = perspectiveGridTool.schema.parse({
      ...perspectiveGridTool.defaults,
      fov: 140,
      cameraHeight: 0.25,
      cellDepth: 0.25,
      distance: 120,
      lineWidth: 0.5,
      taper: 0,
      ceiling: true,
      stars: 100,
      mountains: 40,
      tilt: 30,
    });
    for (const size of [FULL_HD, { width: 8192, height: 16 }, { width: 16, height: 8192 }]) {
      expect(svgOf(p, size).length).toBeLessThan(300 * 1024);
    }
  });
});

describe("time animation", () => {
  it("moves the floor every frame, starts at the preview and loops back", () => {
    const frames = planAnimationFrames(
      perspectiveGridTool,
      perspectiveGridTool.defaults,
      7,
      "time",
      4,
    );
    const svgs = frames.map((f) => render(f.params, f.seed, f.t));
    expect(new Set(svgs).size).toBe(4);
    expect(svgs[0]).toBe(render(perspectiveGridTool.defaults, 7));
    expect(render(perspectiveGridTool.defaults, 7, 1)).toBe(svgs[0]);
  });
});

describe("randomize", () => {
  it("keeps locked params and stays within the schema", () => {
    const locks = new Set(["lineColor", "horizon"] as const);
    for (let seed = 1; seed <= 20; seed++) {
      const next = perspectiveGridTool.randomize(
        createRng(seed),
        perspectiveGridTool.defaults,
        locks,
      );
      expect(perspectiveGridTool.schema.safeParse(next).success).toBe(true);
      expect(next.lineColor).toBe(perspectiveGridTool.defaults.lineColor);
      expect(next.horizon).toBe(perspectiveGridTool.defaults.horizon);
      // Grid geometry the user tuned stays.
      expect(next.lineWidth).toBe(perspectiveGridTool.defaults.lineWidth);
      expect(next.tilt).toBe(perspectiveGridTool.defaults.tilt);
    }
  });
});

describe("brand palette", () => {
  it("takes the sky palette and the colour params in order", () => {
    const colors = ["#101010", "#ff0066", "#ffee00"];
    const out = applyBrandPalette(perspectiveGridTool, perspectiveGridTool.defaults, colors);
    expect(out?.params.palette).toEqual(colors);
    expect(out?.params.lineColor).toBe("#101010");
    expect(out?.params.background).toBe(perspectiveGridTool.defaults.background);
  });
});
