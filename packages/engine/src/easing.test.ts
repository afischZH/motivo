import { describe, expect, it } from "vitest";
import { EASINGS, ease } from "./easing";

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
