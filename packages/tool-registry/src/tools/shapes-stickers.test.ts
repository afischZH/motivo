/**
 * Shapes and stickers: starburst badge, squiggle lines and Bauhaus pattern.
 * Size and time budgets at 4K, valid variants, the GIF loop and the CSS
 * underline.
 */
import { describe, expect, it } from "vitest";
import { createRng } from "@musterli/engine";
import { planAnimationFrames } from "../animation";
import { renderStatic } from "../testing";
import type { AnyToolDefinition } from "../types";
import { bauhausPatternTool, squiggleLinesTool, starburstBadgeTool } from "./index";

const UHD = { width: 3840, height: 2160 };
/** Generous wall-clock budget per render; shared CI runners are slow and noisy. */
const RENDER_BUDGET_MS = 500;
const SVG_BUDGET = 256 * 1024;

// Wall-clock timing for performance budgets in tests only; product code stays deterministic.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;

const tools = [
  ["starburst-badge", starburstBadgeTool],
  ["squiggle-lines", squiggleLinesTool],
  ["bauhaus-pattern", bauhausPatternTool],
] as const;

describe.each(tools)("%s", (_, tool) => {
  const anyTool = tool as unknown as AnyToolDefinition;

  it("renders every preset at 4K within the size and time budget", () => {
    for (const preset of tool.presets) {
      const start = clock.now();
      const svg = renderStatic(anyTool, preset.params, 1, UHD);
      expect(clock.now() - start).toBeLessThan(RENDER_BUDGET_MS);
      expect((svg as string).length, preset.id).toBeLessThan(SVG_BUDGET);
    }
  });

  it("gives valid new variants", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const next = anyTool.randomize(createRng(seed), tool.defaults, new Set());
      expect(tool.schema.safeParse(next).success).toBe(true);
    }
  });
});

describe("starburst-badge and squiggle-lines", () => {
  it.each([starburstBadgeTool, squiggleLinesTool])("start the GIF at the still image", (tool) => {
    const anyTool = tool as unknown as AnyToolDefinition;
    const size = { width: 600, height: 400 };
    const still = renderStatic(anyTool, tool.defaults, 1, size);
    const first = planAnimationFrames(anyTool, tool.defaults, 1, "time", 8)[0];
    if (!first) throw new Error("no frames");
    expect(first.t ?? 0).toBe(0);
    expect(renderStatic(anyTool, first.params, 1, size)).toBe(still);
  });

  it("keeps the badge text on a new variant", () => {
    const anyTool = starburstBadgeTool as unknown as AnyToolDefinition;
    const out = anyTool.randomize(createRng(4), starburstBadgeTool.defaults, new Set());
    expect(out).toMatchObject({ line1: "-20%", line2: "SALE" });
  });
});

describe("squiggle-lines", () => {
  it("exports a squiggly underline as CSS", () => {
    const extra = squiggleLinesTool.extraExports?.find((e) => e.id === "css-underline");
    const css = (extra?.render(squiggleLinesTool.defaults, { width: 1200, height: 800 } as never) ??
      "") as string;
    expect(css).toContain(".squiggle {");
    expect(css).toContain("data:image/svg+xml");
    expect(css).toContain("repeat-x");
  });
});
