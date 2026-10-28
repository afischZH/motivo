import { describe, expect, it } from "vitest";
import * as z from "zod";
import {
  COLOR_ANIMATION,
  SEED_AND_COLOR_ANIMATION,
  animationSources,
  colorCycleParams,
  cycleColors,
  planAnimationFrames,
  rotateColors,
  supportsAnimation,
} from "./animation";
import { colorSchema, paletteSchema } from "./common";
import { registry } from "./index";
import { parseToolParams } from "./randomize";
import { defineTool } from "./registry";
import { createRenderContext } from "./render";
import { renderStatic } from "./testing";

const SIZE = { width: 320, height: 200 };

/** Output of one frame as a comparable string (SVG, or the CSS plus its preview SVG). */
function frameOutput(
  tool: ReturnType<typeof registry.list>[number],
  frame: { params: unknown; seed: number; t?: number },
): string {
  // Frames of the "time" source carry `t`, which only an SVG renderer with a context sees.
  if (frame.t !== undefined && tool.render.kind === "svg") {
    const p = tool.schema.parse(frame.params);
    return tool.render.render(p, createRenderContext(frame.seed, SIZE, frame.t));
  }
  const out = renderStatic(tool, frame.params, frame.seed, SIZE);
  return typeof out === "string" ? out : JSON.stringify(out);
}

describe("rotateColors", () => {
  const colors = ["#ff0000", "#00ff00", "#0000ff"];

  it("keeps frame 0 and full turns unchanged", () => {
    expect(rotateColors(colors, 0, 12)).toEqual(colors);
    expect(rotateColors(colors, 12, 12)).toEqual(colors);
  });

  it("moves one position per count / k frames", () => {
    expect(rotateColors(colors, 4, 12)).toEqual(["#00ff00", "#0000ff", "#ff0000"]);
    expect(rotateColors(colors, 8, 12)).toEqual(["#0000ff", "#ff0000", "#00ff00"]);
  });

  it("blends between positions", () => {
    const [mid] = rotateColors(["#000000", "#ffffff"], 1, 4);
    expect(mid).not.toBe("#000000");
    expect(mid).not.toBe("#ffffff");
  });

  it("is deterministic", () => {
    expect(rotateColors(colors, 5, 13)).toEqual(rotateColors(colors, 5, 13));
  });

  it("turns the hue when there is only one distinct colour", () => {
    const out = rotateColors(["#3366cc", "#3366cc"], 6, 12);
    expect(out[0]).not.toBe("#3366cc");
    expect(out[0]).toBe(out[1]);
    // Grey has no hue to turn.
    expect(rotateColors(["#808080"], 3, 6)).toEqual(["#808080"]);
  });
});

const demoSchema = z.object({
  color: colorSchema,
  palette: paletteSchema,
  layers: z.array(z.object({ ink: colorSchema, size: z.number() })),
});

const demoTool = defineTool({
  id: "demo-animation",
  version: 1,
  category: ["patterns"],
  schema: demoSchema,
  defaults: {
    color: "#ff0000",
    palette: ["#00ff00", "#0000ff"],
    layers: [{ ink: "#ffffff", size: 1 }],
  },
  presets: [],
  controls: { params: { layers: { kind: "list" } } },
  randomize: (_rng, current) => current,
  render: { kind: "svg", render: () => "<svg/>" },
  exports: ["svg"],
  animation: SEED_AND_COLOR_ANIMATION,
});

describe("colour cycle params", () => {
  it("collects colours in brand palette order", () => {
    // Schema order: colour, palette, then list item colours.
    expect(cycleColors(demoTool, demoTool.defaults)).toEqual([
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#ffffff",
    ]);
  });

  it("writes rotated colours into a copy", () => {
    const before = JSON.parse(JSON.stringify(demoTool.defaults)) as unknown;
    const next = colorCycleParams(demoTool, demoTool.defaults, 1, 4);
    expect(demoTool.defaults).toEqual(before);
    expect(next).toEqual({
      color: "#00ff00",
      palette: ["#0000ff", "#ffffff"],
      layers: [{ ink: "#ff0000", size: 1 }],
    });
    expect(demoSchema.parse(next)).toEqual(next);
  });
});

describe("planAnimationFrames", () => {
  it("seeds: same params, consecutive uint32 seeds", () => {
    const frames = planAnimationFrames(demoTool, demoTool.defaults, 0xffffffff, "seeds", 3);
    expect(frames.map((f) => f.seed)).toEqual([0xffffffff, 0, 1]);
    for (const f of frames) expect(f.params).toBe(demoTool.defaults);
  });

  it("colors: frame 0 is the design itself", () => {
    const frames = planAnimationFrames(demoTool, demoTool.defaults, 7, "colors", 8);
    expect(frames).toHaveLength(8);
    expect(frames[0]?.params).toEqual(demoTool.defaults);
    expect(frames.every((f) => f.seed === 7)).toBe(true);
    expect(planAnimationFrames(demoTool, demoTool.defaults, 7, "colors", 8)).toEqual(frames);
  });

  it("clamps the count to at least one frame", () => {
    expect(planAnimationFrames(demoTool, demoTool.defaults, 1, "seeds", 0)).toHaveLength(1);
  });

  it("rejects sources the tool does not offer", () => {
    expect(() => planAnimationFrames(demoTool, demoTool.defaults, 1, "time", 4)).toThrow();
  });

  it("time and custom frames", () => {
    const timed = defineTool({
      ...demoTool,
      animation: {
        sources: ["custom", "time"],
        customLabelKey: "demo.custom",
        frame: (params, info) => ({ params: { ...params, color: "#000000" }, seed: info.index }),
      },
    });
    expect(planAnimationFrames(timed, timed.defaults, 1, "time", 4).map((f) => f.t)).toEqual([
      0, 0.25, 0.5, 0.75,
    ]);
    const custom = planAnimationFrames(timed, timed.defaults, 1, "custom", 2);
    expect(custom.map((f) => [f.seed, f.params.color])).toEqual([
      [0, "#000000"],
      [1, "#000000"],
    ]);
  });
});

describe("animated tools in the registry", () => {
  const animated = registry.list().filter(supportsAnimation);

  it("enables a sensible set of tools", () => {
    const ids = animated.map((t) => t.id);
    for (const id of [
      "blob",
      "seamless-patterns",
      "mesh-gradient",
      "blurry-gradient",
      "css-patterns",
      "bento-grid",
      "geometric-patterns",
    ]) {
      expect(ids).toContain(id);
    }
    // Glass effects are CSS effects on a backdrop, not a motif to animate.
    expect(ids).not.toContain("glass-effects");
    // CSS shadow: colour cycle of its shadow and surface colours; the
    // contrast checker is a measuring tool, nothing to animate.
    expect(ids).toContain("css-shadow");
    expect(ids).not.toContain("contrast-checker");
  });

  it("the shared opt-ins are well-formed", () => {
    expect(SEED_AND_COLOR_ANIMATION.sources).toEqual(["seeds", "colors"]);
    expect(COLOR_ANIMATION.sources).toEqual(["colors"]);
  });

  for (const tool of animated) {
    describe(tool.id, () => {
      const sources = animationSources(tool);

      it("declares a valid animation", () => {
        expect(new Set(sources).size).toBe(sources.length);
        if (sources.includes("custom")) {
          expect(tool.animation?.frame).toBeTypeOf("function");
          expect(tool.animation?.customLabelKey).toBeTruthy();
        }
        // The exporters render frames as SVG.
        expect(["svg", "css"]).toContain(tool.render.kind);
        expect(tool.exports).not.toContain("gif");
      });

      for (const source of sources) {
        it(`${source}: frames pass the schema and move`, () => {
          const frames = planAnimationFrames(tool, tool.defaults, 1, source, 6);
          for (const frame of frames) {
            expect(parseToolParams(tool, frame.params).success).toBe(true);
          }
          const first = frameOutput(
            tool,
            frames[0] as { params: unknown; seed: number; t?: number },
          );
          // Frame 0 is the design as shown in the preview.
          expect(first).toBe(frameOutput(tool, { params: tool.defaults, seed: 1 }));
          const distinct = new Set(
            frames.map((f) =>
              frameOutput(tool, f as { params: unknown; seed: number; t?: number }),
            ),
          );
          expect(distinct.size).toBeGreaterThan(1);
        });
      }
    });
  }
});
