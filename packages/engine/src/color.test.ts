import { describe, expect, it } from "vitest";
import {
  hexToOklch,
  hexToRgb,
  isInGamut,
  mixHex,
  oklchToHex,
  randomPalette,
  rgbToHex,
  samplePalette,
} from "./color";
import { createRng } from "./rng";

describe("hexToRgb / rgbToHex", () => {
  it("round-trips 6-digit hex and expands 3-digit hex", () => {
    expect(rgbToHex(hexToRgb("#1E90FF"))).toBe("#1e90ff");
    expect(rgbToHex(hexToRgb("#f0a"))).toBe("#ff00aa");
  });

  it("rejects invalid input", () => {
    expect(() => hexToRgb("red")).toThrow(RangeError);
    expect(() => hexToRgb("#12345")).toThrow(RangeError);
    expect(() => hexToRgb("#11223344")).toThrow(RangeError);
  });

  it("clamps out-of-range channels", () => {
    expect(rgbToHex({ r: 1.2, g: -0.1, b: 0.5 })).toBe("#ff0080");
  });
});

describe("OKLCH conversion", () => {
  it("matches reference values for pure sRGB colours", () => {
    const white = hexToOklch("#ffffff");
    expect(white.l).toBeCloseTo(1, 4);
    expect(Number.isNaN(white.h)).toBe(true);
    const red = hexToOklch("#ff0000");
    expect(red.l).toBeCloseTo(0.628, 3);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
  });

  it("round-trips in-gamut colours through OKLCH", () => {
    for (const hex of ["#000000", "#808080", "#1e90ff", "#ff6347", "#2e8b57"]) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });

  it("maps out-of-gamut colours into sRGB by reducing chroma", () => {
    const hex = oklchToHex({ l: 0.7, c: 0.4, h: 150 });
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    const back = hexToOklch(hex);
    expect(back.l).toBeCloseTo(0.7, 2);
    expect(Math.abs(back.h - 150)).toBeLessThan(2);
    expect(isInGamut(hexToRgb(hex))).toBe(true);
  });
});

describe("mixHex", () => {
  it("returns the end colours at t = 0 and t = 1 in every space", () => {
    for (const space of ["oklch", "oklab", "srgb"] as const) {
      expect(mixHex("#ff0000", "#0000ff", 0, space)).toBe("#ff0000");
      expect(mixHex("#ff0000", "#0000ff", 1, space)).toBe("#0000ff");
    }
  });

  it("mixes in gamma-encoded sRGB like legacy CSS", () => {
    expect(mixHex("#000000", "#ffffff", 0.5, "srgb")).toBe("#808080");
  });

  it("keeps OKLCH midpoints saturated instead of muddy", () => {
    const srgb = hexToOklch(mixHex("#ff0000", "#00ff00", 0.5, "srgb"));
    const oklch = hexToOklch(mixHex("#ff0000", "#00ff00", 0.5, "oklch"));
    expect(oklch.c).toBeGreaterThan(srgb.c);
  });

  it("takes the longer hue arc when asked", () => {
    // red (h ~29) to yellow (h ~110): shorter passes orange, longer passes blue.
    const shorter = hexToOklch(mixHex("#ff0000", "#ffff00", 0.5, "oklch", "shorter"));
    const longer = hexToOklch(mixHex("#ff0000", "#ffff00", 0.5, "oklch", "longer"));
    expect(shorter.h).toBeGreaterThan(40);
    expect(shorter.h).toBeLessThan(100);
    expect(longer.h).toBeGreaterThan(200);
    expect(longer.h).toBeLessThan(300);
  });

  it("uses the chromatic colour's hue when mixing with grey", () => {
    const mid = hexToOklch(mixHex("#ffffff", "#0000ff", 0.5, "oklch"));
    const blue = hexToOklch("#0000ff");
    expect(Math.abs(mid.h - blue.h)).toBeLessThan(2);
  });
});

describe("samplePalette", () => {
  it("returns the end colours and the requested count", () => {
    const out = samplePalette(["#ff0000", "#00ff00", "#0000ff"], 5);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe("#ff0000");
    expect(out[2]).toBe("#00ff00");
    expect(out[4]).toBe("#0000ff");
  });

  it("returns the first colour for a single sample", () => {
    expect(samplePalette(["#123456", "#abcdef"], 1)).toEqual(["#123456"]);
  });

  it("throws on an empty palette", () => {
    expect(() => samplePalette([], 3)).toThrow(RangeError);
  });
});

describe("randomPalette", () => {
  it("is deterministic and returns valid hex colours", () => {
    const a = randomPalette(createRng(5), 4);
    expect(a).toEqual(randomPalette(createRng(5), 4));
    expect(a).toHaveLength(4);
    for (const c of a) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("varies with the seed", () => {
    expect(randomPalette(createRng(1), 3)).not.toEqual(randomPalette(createRng(2), 3));
  });
});
