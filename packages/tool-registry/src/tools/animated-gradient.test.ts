import { ANIMATED_GRADIENT_RULES, createRng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { planAnimationFrames } from "../animation";
import { applyBrandPalette } from "../brand-palette";
import { createRenderContext } from "../render";
import type { CssOutput } from "../types";
import { animatedGradientTool as tool, type AnimatedGradientParams } from "./animated-gradient";

const SIZE = { width: 600, height: 400 };

function render(params: Partial<AnimatedGradientParams>, seed = 1, t?: number): CssOutput {
  if (tool.render.kind !== "css") throw new Error("css renderer expected");
  return tool.render.render({ ...tool.defaults, ...params }, createRenderContext(seed, SIZE, t));
}

function extra(id: string, params: Partial<AnimatedGradientParams> = {}): string {
  const e = tool.extraExports?.find((x) => x.id === id);
  if (!e) throw new Error(`missing extra export ${id}`);
  return e.render({ ...tool.defaults, ...params }, createRenderContext(1, SIZE));
}

describe("animated-gradient render", () => {
  it("draws the gradient on an element over the whole canvas, animated only as motion", () => {
    const out = render({});
    expect(out.element).toMatchObject({ x: 0, y: 0, width: 600, height: 400 });
    expect(out.element?.css).toContain("background-image: linear-gradient(120deg, ");
    expect(out.element?.css).not.toContain("animation");
    expect(out.element?.motionCss).toBe(
      "animation: musterli-ag-pan 12s ease-in-out infinite alternate;",
    );
    expect(out.previewSvg).toMatch(/^<svg /);
  });

  it("keeps the global rules constant across params and modes", () => {
    for (const mode of ["pan", "rotate", "shift", "blobs"] as const) {
      expect(render({ mode, palette: ["#000000", "#ffffff"] }).rules).toBe(ANIMATED_GRADIENT_RULES);
    }
  });

  it("gives every blob its own animated box", () => {
    const out = render({ mode: "blobs" });
    expect(out.element?.motionCss).toBeUndefined();
    expect(out.element?.css).toBe("background-color: #0f172a;");
    expect(out.element?.content).toHaveLength(4);
    for (const box of out.element?.content ?? []) {
      expect(box.width).toBe(box.height);
      expect(box.css).toContain("radial-gradient(closest-side, ");
      expect(box.motionCss).toBe("animation: musterli-ag-float 12s ease-in-out infinite;");
    }
    // A new seed moves the blobs.
    expect(render({ mode: "blobs" }, 2).element?.content).not.toEqual(out.element?.content);
  });

  it("draws later times in the SVG twin only (the CSS stays the same)", () => {
    const calm = render({ mode: "shift" });
    const later = render({ mode: "shift" }, 1, 0.4);
    expect(later.previewSvg).not.toBe(calm.previewSvg);
    expect(later.element).toEqual(calm.element);
    expect(render({ mode: "shift" }, 1, 0).previewSvg).toBe(calm.previewSvg);
  });
});

describe("animated-gradient GIF frames", () => {
  it("starts with the preview and loops through time", () => {
    const frames = planAnimationFrames(tool, tool.defaults, 1, "time", 8);
    expect(frames[0]?.t).toBe(0);
    const svgs = frames.map((f) => render(f.params, f.seed, f.t).previewSvg);
    expect(svgs[0]).toBe(render({}).previewSvg);
    // The pan goes there and back: frame 4 of 8 is the far end, frames 1 and 7 mirror.
    expect(svgs[1]).toBe(svgs[7]);
    expect(new Set(svgs).size).toBe(5);
  });
});

describe("animated-gradient exports", () => {
  it.each(["pan", "rotate", "shift", "blobs"] as const)(
    "%s: CSS, HTML and Tailwind stop the animation for reduced motion",
    (mode) => {
      expect(extra("css", { mode })).toContain("@media (prefers-reduced-motion: reduce)");
      expect(extra("html", { mode })).toContain("@media (prefers-reduced-motion: reduce)");
      expect(extra("tailwind", { mode })).toContain("motion-reduce:animate-none");
      expect(extra("tailwind-theme", { mode })).toContain("--animate-");
    },
  );

  it("offers still images and GIF but no generic CSS", () => {
    expect(tool.exports).toEqual(["svg", "png", "jpg", "webp"]);
    expect(tool.animation?.sources).toEqual(["time", "colors"]);
  });
});

describe("animated-gradient params", () => {
  it("maps a brand palette onto at most six colours and keeps the blob base", () => {
    const colors = [
      "#111111",
      "#222222",
      "#333333",
      "#444444",
      "#555555",
      "#666666",
      "#777777",
      "#888888",
    ];
    const result = applyBrandPalette(tool, { ...tool.defaults, mode: "blobs" }, colors, new Set());
    expect(result).not.toBeNull();
    const next = result?.params as AnimatedGradientParams;
    expect(next.palette).toEqual(colors.slice(0, 6));
    expect(next.background).toBe("#0f172a");
  });

  it("randomize keeps mode, direction and shape and respects locks", () => {
    const current: AnimatedGradientParams = {
      ...tool.defaults,
      mode: "rotate",
      direction: "reverse",
      rotateShape: "linear",
    };
    const next = tool.randomize(createRng(5), current, new Set(["angle"]));
    expect(next.mode).toBe("rotate");
    expect(next.direction).toBe("reverse");
    expect(next.rotateShape).toBe("linear");
    expect(next.timing).toBe("linear");
    expect(next.angle).toBe(current.angle);
    expect(tool.schema.safeParse(next).success).toBe(true);
  });
});
