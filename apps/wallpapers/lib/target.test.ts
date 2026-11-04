import { DEVICES } from "@musterli/devices";
import { describe, expect, it } from "vitest";

import { clampEdge, designSize, resolveTarget } from "./target";

describe("designSize", () => {
  it("never scales above the pixel ratio", () => {
    expect(designSize(1440, 3120, 3.5).scale).toBe(3);
    expect(designSize(1920, 1080, 1).scale).toBe(1);
  });

  it("uses the device pixel ratio when it divides both edges", () => {
    expect(designSize(1206, 2622, 3)).toEqual({ width: 402, height: 874, scale: 3 });
  });

  it("falls back to the nearest exact divisor", () => {
    // 1280 is not divisible by 3: the next divisor below 3.5 is 2.
    expect(designSize(1280, 2856, 3.5)).toEqual({ width: 640, height: 1428, scale: 2 });
    expect(designSize(1366, 767, 1)).toEqual({ width: 1366, height: 767, scale: 1 });
  });

  it("gives whole design pixels for every catalog device", () => {
    for (const device of DEVICES) {
      const size = designSize(device.width, device.height, device.pixelRatio);
      expect(Number.isInteger(size.width) && Number.isInteger(size.height), device.id).toBe(true);
      expect(size.width * size.scale).toBe(device.width);
    }
  });
});

describe("resolveTarget", () => {
  it("resolves catalog devices", () => {
    expect(resolveTarget({ kind: "device", id: "monitor-4k" })).toMatchObject({
      width: 3840,
      height: 2160,
      design: { width: 1920, height: 1080 },
    });
    expect(resolveTarget({ kind: "device", id: "nope" })).toBeUndefined();
  });

  it("clamps custom sizes to the export limits", () => {
    expect(clampEdge(10)).toBe(64);
    expect(clampEdge(99999)).toBe(8192);
    expect(clampEdge(Number.NaN)).toBe(64);
    expect(resolveTarget({ kind: "custom", width: 5120, height: 1440 })).toMatchObject({
      width: 5120,
      height: 1440,
      design: { width: 2560, height: 720 },
    });
  });
});
