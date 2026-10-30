import { describe, expect, it } from "vitest";
import {
  type EasingOptions,
  SPRING_POINTS,
  easingAt,
  easingCss,
  easingRange,
  easingSpecimenSvg,
  springAt,
} from "./index";

const bezier = (o: Partial<EasingOptions> = {}): EasingOptions => ({
  kind: "bezier",
  x1: 0.42,
  y1: 0,
  x2: 0.58,
  y2: 1,
  stiffness: 170,
  damping: 18,
  ...o,
});

describe("springAt", () => {
  it("starts at 0, ends at 1 and overshoots when underdamped", () => {
    const o = { stiffness: 170, damping: 8 };
    expect(springAt(o, 0)).toBe(0);
    expect(springAt(o, 1)).toBe(1);
    expect(springAt(o, 0.999)).toBeCloseTo(1, 2);
    let max = 0;
    for (let i = 0; i <= 100; i++) max = Math.max(max, springAt(o, i / 100));
    expect(max).toBeGreaterThan(1.1);
  });

  it("does not overshoot when overdamped", () => {
    const o = { stiffness: 100, damping: 40 };
    for (let i = 0; i <= 100; i++) expect(springAt(o, i / 100)).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("easingCss", () => {
  it("writes cubic-bezier and linear()", () => {
    expect(easingCss(bezier())).toBe("cubic-bezier(0.42, 0, 0.58, 1)");
    const spring = easingCss(bezier({ kind: "spring" }));
    expect(spring.startsWith("linear(0, ")).toBe(true);
    expect(spring.endsWith(", 1)")).toBe(true);
    expect(spring.split(",")).toHaveLength(SPRING_POINTS + 1);
  });
});

describe("easingRange", () => {
  it("includes overshooting control points", () => {
    expect(easingRange(bezier())).toEqual({ min: 0, max: 1 });
    const back = easingRange(bezier({ x1: 0.68, y1: -0.6, x2: 0.32, y2: 1.6 }));
    expect(back.min).toBeLessThan(0);
    expect(back.max).toBeGreaterThan(1);
  });
});

describe("easingSpecimenSvg", () => {
  it("shows the CSS value and moves the dot with the time", () => {
    const at = (t: number) =>
      easingSpecimenSvg({
        easing: bezier(),
        width: 1200,
        height: 800,
        background: "#fff",
        ink: "#111",
        muted: "#888",
        accent: "#00f",
        duration: 400,
        t,
      });
    expect(at(0)).toContain("cubic-bezier(0.42, 0, 0.58, 1)</text>");
    expect(at(0)).toContain("400ms");
    expect(at(0.3)).not.toBe(at(0.6));
    expect(easingAt(bezier(), 0.5)).toBeCloseTo(0.5, 6);
  });

  it("lays out tall canvases too", () => {
    const svg = easingSpecimenSvg({
      easing: bezier({ kind: "spring" }),
      width: 600,
      height: 1200,
      background: "#fff",
      ink: "#111",
      muted: "#888",
      accent: "#00f",
      duration: 800,
      t: 0.5,
    });
    expect(svg).toContain("linear(");
    expect(svg).toContain("…</text>");
  });
});
