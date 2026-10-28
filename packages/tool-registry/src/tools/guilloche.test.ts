import { GUILLOCHE_POINT_BUDGET, createRng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { planAnimationFrames } from "../animation";
import { applyBrandPalette } from "../brand-palette";
import { createRenderContext } from "../render";
import { parseToolParams } from "../randomize";
import { checkSvg } from "../testing";
import { guillocheTool as tool, type GuillocheParams } from "./guilloche";

const size = { width: 1200, height: 1200 };
const render = (p: GuillocheParams, seed = 1, t?: number): string => {
  if (tool.render.kind !== "svg") throw new Error("svg tool expected");
  return tool.render.render(p, createRenderContext(seed, size, t));
};
const d = tool.defaults;
const pathCount = (svg: string): number => svg.match(/<path /g)?.length ?? 0;

// Wall-clock timing for performance budgets in tests only; product code stays deterministic.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;

describe("guilloche render", () => {
  it("does not depend on the seed", () => {
    expect(render(d, 1)).toBe(render(d, 99));
  });

  it("draws every layout as well-formed SVG", () => {
    for (const layout of ["rosette", "band", "frame"] as const) {
      for (const curve of ["weave", "spiro", "harmonic"] as const) {
        const svg = render({ ...d, layout, curve });
        expect(checkSvg(svg), `${layout} ${curve}`).toEqual([]);
      }
    }
  });

  it("adds the second layer in its own colour", () => {
    const one = render({ ...d, colorMode: "single" });
    const two = render({ ...d, colorMode: "single", overlay: true, overlayColor: "#123abc" });
    expect(pathCount(two)).toBe(pathCount(one) + 1);
    expect(two).toContain('stroke="#123abc"');
    expect(one).not.toContain("#123abc");
  });

  it("keeps every preset compact at the default size", () => {
    for (const p of tool.presets) {
      const svg = render(p.params);
      expect(svg.length, p.id).toBeLessThan(400_000);
    }
  });

  it("keeps crafted extreme params small and quick", () => {
    const parsed = parseToolParams(tool, {
      ...d,
      layout: "frame",
      repeats: 48,
      inner: 0,
      outer: 1,
      lines: 96,
      petals: 48,
      frequency: 96,
      amplitude: 1,
      overlay: true,
      overlayLines: 96,
      overlayPetals: 48,
      overlayFrequency: 96,
      colorMode: "along",
      palette: [
        "#000000",
        "#ff0000",
        "#00ff00",
        "#0000ff",
        "#ffffff",
        "#111111",
        "#222222",
        "#333333",
        "#444444",
        "#555555",
      ],
    });
    if (!parsed.success) throw new Error(parsed.error.message);
    const extreme = parsed.data as GuillocheParams;
    const start = clock.now();
    const svg = render(extreme);
    const ms = clock.now() - start;
    // About 9 bytes per point at most.
    expect(svg.length).toBeLessThan(GUILLOCHE_POINT_BUDGET * 10);
    expect(svg.length).toBeLessThan(1_500_000);
    expect(checkSvg(svg)).toEqual([]);
    // Generous for shared CI runners; locally about 0.2 s.
    expect(ms).toBeLessThan(2000);
  });
});

describe("guilloche animation", () => {
  it("offers motion first, then colour cycling", () => {
    expect(tool.animation?.sources).toEqual(["time", "colors"]);
  });

  it("motion turns the phase of every line once around, seamlessly", () => {
    const frames = planAnimationFrames(tool, d, 1, "time", 8);
    expect(frames.map((f) => f.t)).toEqual([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]);
    const svgs = frames.map((f) => render(f.params, f.seed, f.t));
    expect(svgs[0]).toBe(render(d));
    expect(new Set(svgs).size).toBe(8);
  });
});

describe("guilloche brand palette and randomize", () => {
  it("maps brand colours onto the palette and the second layer colour", () => {
    const brand = ["#101010", "#202020", "#303030"];
    const out = applyBrandPalette(tool, d, brand, new Set())?.params;
    if (!out) throw new Error("brand palette expected to apply");
    expect(out.palette).toEqual(brand);
    expect(brand).toContain(out.overlayColor);
    expect(out.background).toBe(d.background);
  });

  it("keeps the layout and the frame edges when rolling", () => {
    const certificate = tool.presets.find((p) => p.id === "certificate")?.params;
    if (!certificate) throw new Error("certificate preset expected");
    for (let s = 0; s < 20; s++) {
      const out = tool.randomize(createRng(s), certificate, new Set());
      expect(out.layout).toBe("frame");
      expect(out.inner).toBe(certificate.inner);
      expect(out.outer).toBe(certificate.outer);
      expect(out.repeats).toBe(certificate.repeats);
    }
  });
});
