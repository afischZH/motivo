import { describe, expect, it } from "vitest";

import {
  bestTone,
  contrastLevel,
  contrastRatio,
  luminance,
  textContrast,
} from "./context-contrast";

/** `count` RGBA pixels of one colour. */
const fill = (count: number, rgba: [number, number, number, number]) =>
  Array.from({ length: count }, () => rgba).flat();

describe("context contrast", () => {
  it("matches WCAG for black on white", () => {
    expect(contrastRatio(luminance(0, 0, 0), luminance(255, 255, 255))).toBeCloseTo(21, 5);
  });

  it("picks light text on a dark motif and dark text on a light one", () => {
    expect(bestTone(fill(10, [20, 20, 60, 255])).tone).toBe("light");
    expect(bestTone(fill(10, [240, 230, 200, 255])).tone).toBe("dark");
  });

  it("ignores the weakest 5 % of the pixels (single specks)", () => {
    // 2 white stars in 100 dark pixels: light text still has a high contrast.
    const pixels = [...fill(98, [10, 10, 30, 255]), ...fill(2, [255, 255, 255, 255])];
    expect(textContrast(pixels, "light")).toBeGreaterThan(15);
    // 20 % white: now they count.
    const busy = [...fill(80, [10, 10, 30, 255]), ...fill(20, [255, 255, 255, 255])];
    expect(textContrast(busy, "light")).toBeCloseTo(1, 5);
  });

  it("counts transparent pixels as the white page", () => {
    expect(textContrast(fill(4, [0, 0, 0, 0]), "light")).toBeCloseTo(1, 5);
  });

  it("names the WCAG level", () => {
    expect(contrastLevel(7.5)).toBe("aaa");
    expect(contrastLevel(4.6)).toBe("aa");
    expect(contrastLevel(3.2)).toBe("aa-large");
    expect(contrastLevel(2)).toBe("fail");
  });
});
