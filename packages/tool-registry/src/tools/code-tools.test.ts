/**
 * W3 (mid priority): CSS easing, fluid spacing scale and gradient text.
 * The code exports, the GIF over time and the preview budgets.
 */
import { describe, expect, it } from "vitest";
import { createRng } from "@musterli/engine";
import { planAnimationFrames } from "../animation";
import { renderStatic } from "../testing";
import type { AnyToolDefinition, ExtraExport } from "../types";
import { cssEasingTool, gradientTextTool, spacingScaleTool } from "./index";

const extra = <P>(tool: { extraExports?: readonly ExtraExport<P>[] }, id: string, p: P): string => {
  const e = tool.extraExports?.find((x) => x.id === id);
  if (!e) throw new Error(`missing extra export ${id}`);
  return e.render(p, { width: 1200, height: 800 } as never) as string;
};

describe("css-easing", () => {
  it("exports cubic-bezier and spring code with reduced motion", () => {
    const p = cssEasingTool.defaults;
    const transition = extra(cssEasingTool, "css-transition", p);
    expect(transition).toContain("--ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);");
    expect(transition).toContain("transition: transform 400ms var(--ease-out-quint);");
    expect(transition).toContain("prefers-reduced-motion");
    const spring = { ...p, kind: "spring" as const };
    expect(extra(cssEasingTool, "css-animation", spring)).toContain(
      "animation: slide-in 400ms linear(0, ",
    );
    expect(extra(cssEasingTool, "tailwind-theme", p)).toContain("--ease-out-quint: cubic-bezier(");
  });

  it("starts the GIF at the still image", () => {
    const anyTool = cssEasingTool as unknown as AnyToolDefinition;
    const still = renderStatic(anyTool, cssEasingTool.defaults, 1, { width: 600, height: 400 });
    const first = planAnimationFrames(anyTool, cssEasingTool.defaults, 1, "time", 8)[0];
    if (!first) throw new Error("no frames");
    const frame =
      cssEasingTool.render.kind === "svg"
        ? cssEasingTool.render.render(first.params, {
            rng: createRng(1),
            seed: 1,
            width: 600,
            height: 400,
            t: first.t ?? 0,
          } as never)
        : "";
    expect(frame).toBe(still);
  });
});

describe("spacing-scale", () => {
  it("exports variables, utilities and a Tailwind theme", () => {
    const p = { ...spacingScaleTool.defaults, pairs: "one-up" as const };
    const vars = extra(spacingScaleTool, "css-variables", p);
    expect(vars).toContain("--space-s: clamp(1rem, ");
    expect(vars).toContain("--space-s-m: clamp(");
    expect(extra(spacingScaleTool, "utility-classes", p)).toContain(".flow-space-s > * + *");
    expect(extra(spacingScaleTool, "tailwind-theme", p)).toContain("--spacing-xl: clamp(");
  });

  it("falls back to the default prefix for an unusable one", () => {
    const vars = extra(spacingScaleTool, "css-variables", {
      ...spacingScaleTool.defaults,
      prefix: "!!",
    });
    expect(vars).toContain("--space-s:");
  });
});

describe("gradient-text", () => {
  it("exports background-clip CSS and Tailwind classes", () => {
    const p = { ...gradientTextTool.defaults, shine: false };
    const css = extra(gradientTextTool, "css", p);
    expect(css).toContain("background-clip: text;");
    expect(css).toContain("-webkit-background-clip: text;");
    expect(css).toContain("color: transparent;");
    expect(css).not.toContain("@keyframes");
    expect(extra(gradientTextTool, "tailwind", p)).toBe(
      "bg-[linear-gradient(90deg,_#6366f1,_#ec4899,_#f59e0b)] bg-clip-text text-transparent\n",
    );
  });

  it("adds the shine animation with reduced motion", () => {
    const css = extra(gradientTextTool, "css", { ...gradientTextTool.defaults, shine: true });
    expect(css).toContain("background-size: 200% 100%;");
    expect(css).toContain("@keyframes gradient-text-shine");
    expect(css).toContain("prefers-reduced-motion");
  });

  it("keeps the text on a new variant", () => {
    const anyTool = gradientTextTool as unknown as AnyToolDefinition;
    const next = anyTool.randomize(
      createRng(4),
      { ...gradientTextTool.defaults, text: "Hallo" },
      new Set(),
    );
    expect((next as { text: string }).text).toBe("Hallo");
  });
});

describe.each([
  ["css-easing", cssEasingTool],
  ["spacing-scale", spacingScaleTool],
  ["gradient-text", gradientTextTool],
] as const)("%s", (_, tool) => {
  it("renders every preset at 4K quickly and gives valid variants", () => {
    const anyTool = tool as unknown as AnyToolDefinition;
    for (const preset of tool.presets) {
      const svg = renderStatic(anyTool, preset.params, 1, { width: 3840, height: 2160 }) as string;
      expect(svg.length).toBeLessThan(64 * 1024);
    }
    for (let seed = 1; seed <= 10; seed++) {
      expect(
        tool.schema.safeParse(anyTool.randomize(createRng(seed), tool.defaults, new Set())).success,
      ).toBe(true);
    }
  });
});
