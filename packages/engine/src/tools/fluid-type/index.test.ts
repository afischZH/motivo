import { describe, expect, it } from "vitest";
import {
  TYPE_SCALE_RATIOS,
  fluidClamp,
  fluidSizeAt,
  fluidSpecimenSvg,
  fluidStepName,
  fluidTypeSteps,
  fluidZoomFactor,
  truncateToWidth,
  type FluidStep,
} from "./index";

const base = {
  minViewport: 360,
  maxViewport: 1280,
  minBase: 16,
  maxBase: 18,
  minRatio: TYPE_SCALE_RATIOS["minor-third"],
  maxRatio: TYPE_SCALE_RATIOS["major-third"],
  stepsDown: 2,
  stepsUp: 5,
};

const step = (n: number): FluidStep => {
  const s = fluidTypeSteps(base).find((x) => x.step === n);
  if (!s) throw new Error(`no step ${n}`);
  return s;
};

describe("fluid type scale", () => {
  it("builds the steps from -stepsDown to stepsUp with the modular scale at both ends", () => {
    const steps = fluidTypeSteps(base);
    expect(steps.map((s) => s.step)).toEqual([-2, -1, 0, 1, 2, 3, 4, 5]);
    expect(step(0).min).toBe(16);
    expect(step(0).max).toBe(18);
    expect(step(2).min).toBeCloseTo(16 * 1.2 ** 2, 10);
    expect(step(2).max).toBeCloseTo(18 * 1.25 ** 2, 10);
    expect(step(-1).min).toBeCloseTo(16 / 1.2, 10);
  });

  it("interpolates linearly between the viewports and clamps outside", () => {
    const s = step(0);
    expect(fluidSizeAt(s, 360)).toBeCloseTo(16, 10);
    expect(fluidSizeAt(s, 1280)).toBeCloseTo(18, 10);
    expect(fluidSizeAt(s, 820)).toBeCloseTo(17, 10);
    expect(fluidSizeAt(s, 100)).toBe(16);
    expect(fluidSizeAt(s, 4000)).toBe(18);
  });

  it("writes clamp() with a rem plus vw preferred value", () => {
    // 2 px over 920 px of viewport: 0.2174vw; intercept 16 − 360 · 2/920 px.
    expect(fluidClamp(step(0), "rem")).toBe("clamp(1rem, 0.9511rem + 0.2174vw, 1.125rem)");
    expect(fluidClamp(step(0), "px")).toBe("clamp(16px, 15.22px + 0.2174vw, 18px)");
  });

  it("keeps the bounds in order for shrinking steps and writes a plain length for fixed ones", () => {
    const shrinking = fluidTypeSteps({
      ...base,
      minBase: 20,
      maxBase: 16,
      stepsDown: 0,
      stepsUp: 0,
    });
    expect(fluidClamp(shrinking[0] as FluidStep, "px")).toBe(
      "clamp(16px, 21.57px - 0.4348vw, 20px)",
    );
    const fixed = fluidTypeSteps({ ...base, maxBase: 16, maxRatio: base.minRatio });
    expect(fluidClamp(fixed[2] as FluidStep, "rem")).toBe("1rem");
  });

  it("measures the largest growth for the zoom rule of thumb", () => {
    expect(fluidZoomFactor(fluidTypeSteps(base))).toBeCloseTo(
      (18 * 1.25 ** 5) / (16 * 1.2 ** 5),
      10,
    );
    expect(fluidZoomFactor(fluidTypeSteps({ ...base, maxBase: 40 }))).toBeGreaterThan(2.5);
  });

  it("names steps by number or by t-shirt size", () => {
    expect([-2, -1, 0, 1, 2, 3].map((s) => fluidStepName(s, "steps"))).toEqual([
      "-2",
      "-1",
      "0",
      "1",
      "2",
      "3",
    ]);
    expect([-3, -1, 0, 1, 2, 8].map((s) => fluidStepName(s, "tshirt"))).toEqual([
      "2xs",
      "sm",
      "base",
      "lg",
      "xl",
      "7xl",
    ]);
  });

  it("cuts sample text to the width with an ellipsis", () => {
    expect(truncateToWidth("Hello", "sans", 10, 1000)).toBe("Hello");
    const cut = truncateToWidth("The quick brown fox", "sans", 20, 100);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThan(19);
    expect(truncateToWidth("Hello", "sans", 100, 10)).toBe("");
  });

  it("escapes the sample text in the specimen and stays deterministic", () => {
    const steps = fluidTypeSteps(base);
    const o = {
      steps,
      names: steps.map((s) => `--step-${s.step}`),
      minViewport: 360,
      maxViewport: 1280,
      viewport: 1024,
      sample: `<script>"&'`,
      font: "sans" as const,
      fontWeight: 600,
      background: "#ffffff",
      ink: "#111111",
      muted: "#777777",
      accent: "#4f46e5",
      width: 1280,
      height: 960,
    };
    const svg = fluidSpecimenSvg(o);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;&quot;&amp;&#39;");
    expect(svg).toBe(fluidSpecimenSvg(o));
    expect(svg.match(/--step-/g)).toHaveLength(steps.length);
  });
});
