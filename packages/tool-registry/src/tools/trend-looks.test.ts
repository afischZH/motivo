/**
 * W5: holographic gradient, neon shapes and glitch background. Size and
 * time budgets at 4K, variants and the seeded GIF frames.
 */
import { describe, expect, it } from "vitest";
import { createRng } from "@musterli/engine";
import { planAnimationFrames } from "../animation";
import { renderStatic } from "../testing";
import type { AnyToolDefinition } from "../types";
import { glitchBackgroundTool, holographicGradientTool, neonShapesTool } from "./index";

const UHD = { width: 3840, height: 2160 };
/** Generous wall-clock budget per render; shared CI runners are slow and noisy. */
const RENDER_BUDGET_MS = 500;
/** All three are plain vector markup: far below the 1.5 MB SVG budget of other tools. */
const SVG_BUDGET = 256 * 1024;

// Wall-clock timing for performance budgets in tests only; product code stays deterministic.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;

const tools = [
  ["holographic-gradient", holographicGradientTool],
  ["neon-shapes", neonShapesTool],
  ["glitch-background", glitchBackgroundTool],
] as const;

describe.each(tools)("%s", (_, tool) => {
  const anyTool = tool as unknown as AnyToolDefinition;

  it("renders every preset at 4K within the size and time budget", () => {
    for (const preset of tool.presets) {
      const start = clock.now();
      const svg = renderStatic(anyTool, preset.params, 1, UHD);
      expect(clock.now() - start).toBeLessThan(RENDER_BUDGET_MS);
      expect(typeof svg).toBe("string");
      // Grain tiles are a fixed 128 px PNG; the rest must stay small.
      const markup = (svg as string).replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, "");
      expect(markup.length, preset.id).toBeLessThan(SVG_BUDGET);
      expect(svg as string).not.toContain("<filter");
    }
  });

  it("gives valid new variants", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const next = anyTool.randomize(createRng(seed), tool.defaults, new Set());
      expect(tool.schema.safeParse(next).success).toBe(true);
    }
  });

  it("animates with new seeds and colours", () => {
    expect(planAnimationFrames(anyTool, tool.defaults, 1, "seeds", 4)).toHaveLength(4);
    expect(planAnimationFrames(anyTool, tool.defaults, 1, "colors", 6)).toHaveLength(6);
  });
});

describe("holographic-gradient and glitch-background", () => {
  it.each([holographicGradientTool, glitchBackgroundTool])(
    "keep grain on a new variant",
    (tool) => {
      const anyTool = tool as unknown as AnyToolDefinition;
      const out = anyTool.randomize(createRng(3), { ...tool.defaults, grain: 37 }, new Set());
      expect((out as { grain: number }).grain).toBe(37);
    },
  );
});

describe("neon-shapes", () => {
  it("keeps the background behind the shapes", () => {
    const svg = renderStatic(neonShapesTool, neonShapesTool.defaults, 1, {
      width: 400,
      height: 300,
    }) as string;
    expect(svg).toContain(`fill="${neonShapesTool.defaults.background}"`);
  });
});
