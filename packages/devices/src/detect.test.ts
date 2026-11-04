import { describe, expect, it } from "vitest";

import { detectScreen } from "./detect";

describe("detectScreen", () => {
  it("matches an iPhone from CSS size and pixel ratio", () => {
    const result = detectScreen({ width: 402, height: 874, pixelRatio: 3 });
    expect(result?.device?.id).toBe("iphone-6-3");
    expect(result).toMatchObject({ width: 1206, height: 2622 });
  });

  it("ignores orientation", () => {
    expect(detectScreen({ width: 874, height: 402, pixelRatio: 3 })?.device?.id).toBe("iphone-6-3");
  });

  it("matches a MacBook at its default scaled resolution only by native pixels", () => {
    expect(detectScreen({ width: 1512, height: 982, pixelRatio: 2 })?.device?.id).toBe(
      "macbook-pro-14",
    );
  });

  it("tolerates rounded fractional pixel ratios", () => {
    // 412 × 915 CSS px at 2.625 = 1081.5 × 2401.9 native px.
    expect(detectScreen({ width: 412, height: 915, pixelRatio: 2.625 })?.device?.id).toBe(
      "android-fhd",
    );
    expect(detectScreen({ width: 411, height: 923, pixelRatio: 2.625 })?.device?.id).toBe("pixel");
  });

  it("returns the raw size for unknown screens", () => {
    expect(detectScreen({ width: 1366, height: 768, pixelRatio: 1 })).toEqual({
      width: 1366,
      height: 768,
      device: undefined,
    });
  });

  it("rejects missing data", () => {
    expect(detectScreen({ width: 0, height: 800, pixelRatio: 1 })).toBeUndefined();
    expect(detectScreen({ width: 400, height: 800, pixelRatio: Number.NaN })).toBeUndefined();
  });
});
