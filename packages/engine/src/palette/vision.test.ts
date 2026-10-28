import { describe, expect, it } from "vitest";
import { hexToOklch, oklchToHex } from "../color";
import {
  MACHADO_2009,
  VISION_SIMULATIONS,
  contrastRatio,
  formatRatio,
  linearToSrgb,
  nearestPassingColor,
  relativeLuminance,
  sampleTargets,
  simulateVision,
  srgbToLinear,
  wcagChecks,
} from "./index";

describe("Machado, Oliveira, Fernandes (2009) matrices", () => {
  it("match the published severity 1.0 values", () => {
    // Reference values from the paper's supplementary table (as copied in colorspacious).
    expect(MACHADO_2009.protanopia[0]).toEqual([0.152286, 1.052583, -0.204868]);
    expect(MACHADO_2009.deuteranopia[1]).toEqual([0.280085, 0.672501, 0.047413]);
    expect(MACHADO_2009.tritanopia[2]).toEqual([0.004733, 0.691367, 0.3039]);
  });

  it("keep white white: every row sums to 1", () => {
    for (const m of Object.values(MACHADO_2009)) {
      for (const row of m) expect(row[0] + row[1] + row[2]).toBeCloseTo(1, 5);
    }
  });
});

describe("simulateVision", () => {
  it("leaves black, white and greys unchanged in every simulation", () => {
    for (const sim of VISION_SIMULATIONS) {
      expect(simulateVision("#000000", sim)).toBe("#000000");
      expect(simulateVision("#ffffff", sim)).toBe("#ffffff");
      expect(simulateVision("#808080", sim)).toBe("#808080");
    }
  });

  it("applies the matrix in linear sRGB (pure red under protanopia)", () => {
    // Linear red (1, 0, 0) times the matrix is its first column, clamped at 0.
    const col = MACHADO_2009.protanopia.map((row) => row[0]);
    const enc = col.map((v) => Math.round(linearToSrgb(v) * 255));
    const hex = `#${enc.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    expect(simulateVision("#ff0000", "protanopia")).toBe(hex);
    // Hand-computed: 0.152286 -> 108.8 (0x6d), 0.114503 -> 95.2 (0x5f), -0.003882 -> 0.
    expect(hex).toBe("#6d5f00");
  });

  it("shows red and green as similar under deuteranopia", () => {
    const red = simulateVision("#d62828", "deuteranopia");
    const green = simulateVision("#2a9d55", "deuteranopia");
    const dHue = Math.abs(hexToOklch(red).h - hexToOklch(green).h);
    expect(Math.min(dHue, 360 - dHue)).toBeLessThan(40);
  });

  it("maps to the grey of the same luminance for achromatopsia", () => {
    const grey = simulateVision("#ff0000", "achromatopsia");
    expect(grey).toBe("#7f7f7f");
    for (const hex of ["#3a86ff", "#e76f51", "#2a9d8f"]) {
      const g = simulateVision(hex, "achromatopsia");
      expect(Math.abs(relativeLuminance(g) - relativeLuminance(hex))).toBeLessThan(0.005);
    }
  });

  it("is the identity for none", () => {
    expect(simulateVision("#AbCdEf", "none")).toBe("#abcdef");
  });

  it("round-trips the sRGB transfer function", () => {
    for (const v of [0, 0.02, 0.04045, 0.2, 0.5, 1]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6);
    }
  });
});

describe("WCAG checks", () => {
  it("decide on the exact ratio while the display rounds down", () => {
    const justBelow = 4.4999;
    expect(formatRatio(justBelow)).toBe("4.4");
    const checks = wcagChecks(justBelow);
    expect(checks.find((c) => c.id === "normal-aa")?.pass).toBe(false);
    expect(checks.find((c) => c.id === "large-aa")?.pass).toBe(true);
    expect(wcagChecks(4.5).find((c) => c.id === "normal-aa")?.pass).toBe(true);
    expect(wcagChecks(7).map((c) => c.pass)).toEqual([true, true, true, true, true]);
    expect(wcagChecks(2.9).map((c) => c.pass)).toEqual([false, false, false, false, false]);
  });

  it("uses the targets of each sample", () => {
    expect(sampleTargets("body")).toEqual({ aa: 4.5, aaa: 7 });
    expect(sampleTargets("heading")).toEqual({ aa: 3, aaa: 4.5 });
    expect(sampleTargets("ui")).toEqual({ aa: 3, aaa: null });
  });
});

describe("nearestPassingColor", () => {
  const cases: [string, string, number][] = [
    ["#5b6b7f", "#ffffff", 7],
    ["#7bc8a4", "#ffffff", 3],
    ["#e4572e", "#ffffff", 4.5],
    ["#3a86ff", "#ffbe0b", 4.5],
    ["#64748b", "#0f172a", 7],
    ["#ffffff", "#e4572e", 4.5],
  ];

  it.each(cases)("moves %s against %s to %s:1", (color, against, target) => {
    const out = nearestPassingColor(color, against, target);
    expect(out).not.toBeNull();
    const hex = out as string;
    expect(contrastRatio(hex, against)).toBeGreaterThanOrEqual(target);
    // Same hue (where the colour has one) and only a lightness change.
    const a = hexToOklch(color);
    const b = hexToOklch(hex);
    if (a.c > 0.03 && b.c > 0.03) {
      const dh = Math.abs(a.h - b.h);
      expect(Math.min(dh, 360 - dh)).toBeLessThan(6);
    }
    // Deterministic: the same input gives the same colour.
    expect(nearestPassingColor(color, against, target)).toBe(hex);
  });

  it("returns the smallest lightness change that passes", () => {
    const color = "#5b6b7f";
    const out = nearestPassingColor(color, "#ffffff", 7) as string;
    const start = hexToOklch(color);
    const end = hexToOklch(out);
    expect(end.l).toBeLessThan(start.l);
    // A colour a bit closer to the start fails.
    const closer = { ...end, l: end.l + (start.l - end.l) * 0.05 };
    expect(contrastRatio(oklchToHex(closer), "#ffffff")).toBeLessThan(7);
  });

  it("returns the colour itself when it already passes", () => {
    expect(nearestPassingColor("#000000", "#FFFFFF", 7)).toBe("#000000");
  });

  it("returns null when no lightness reaches the target", () => {
    expect(nearestPassingColor("#777777", "#777777", 7)).toBeNull();
    expect(nearestPassingColor("#ff0000", "#ffffff", 22)).toBeNull();
  });
});
