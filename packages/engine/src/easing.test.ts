import { describe, expect, it } from "vitest";
import { CSS_TIMINGS, EASINGS, cssTiming, cubicBezierAt, ease } from "./easing";

describe("ease", () => {
  it.each(EASINGS)("%s maps 0 to 0 and 1 to 1 and clamps", (name) => {
    expect(ease(name, 0)).toBe(0);
    expect(ease(name, 1)).toBe(1);
    expect(ease(name, -1)).toBe(0);
    expect(ease(name, 2)).toBe(1);
  });

  it.each(EASINGS)("%s is monotonic", (name) => {
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = ease(name, i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("has the expected shape at the midpoint", () => {
    expect(ease("linear", 0.5)).toBe(0.5);
    expect(ease("ease-in", 0.5)).toBeLessThan(0.5);
    expect(ease("ease-out", 0.5)).toBeGreaterThan(0.5);
    expect(ease("ease-in-out", 0.5)).toBeCloseTo(0.5, 10);
    expect(ease("ease-in-out", 0.25)).toBeLessThan(0.25);
  });
});

describe("cssTiming", () => {
  it.each(CSS_TIMINGS)("%s maps the ends exactly, clamps and is monotonic", (name) => {
    expect(cssTiming(name, 0)).toBe(0);
    expect(cssTiming(name, 1)).toBe(1);
    expect(cssTiming(name, -0.5)).toBe(0);
    expect(cssTiming(name, 1.5)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 200; i++) {
      const v = cssTiming(name, i / 200);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it("matches known values of the keyword curves", () => {
    expect(cssTiming("linear", 0.3)).toBe(0.3);
    // ease-in-out is point-symmetric around the midpoint.
    expect(cssTiming("ease-in-out", 0.5)).toBeCloseTo(0.5, 6);
    expect(cssTiming("ease-in-out", 0.25) + cssTiming("ease-in-out", 0.75)).toBeCloseTo(1, 6);
    expect(cssTiming("ease-in", 0.5)).toBeLessThan(0.5);
    expect(cssTiming("ease-out", 0.5)).toBeGreaterThan(0.5);
    // cubic-bezier(.25, .1, .25, 1) at half time is about 80 % of the way.
    expect(cssTiming("ease", 0.5)).toBeCloseTo(0.8024, 3);
  });

  it("solves general cubic-bezier curves", () => {
    // Control points on the diagonal give the identity.
    expect(cubicBezierAt(1 / 3, 1 / 3, 2 / 3, 2 / 3, 0.37)).toBeCloseTo(0.37, 6);
    // Overshooting y values are allowed (back easing).
    expect(cubicBezierAt(0.3, 1.6, 0.6, 1, 0.5)).toBeGreaterThan(1);
    // A flat start (zero slope at s = 0) still converges.
    expect(cubicBezierAt(1, 0, 1, 0, 0.001)).toBeGreaterThanOrEqual(0);
  });
});
