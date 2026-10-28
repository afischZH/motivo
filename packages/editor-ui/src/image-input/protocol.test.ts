import { describe, expect, it } from "vitest";
import { clampPixelRect, cropMime } from "./protocol";

describe("clampPixelRect", () => {
  it("clamps a crop to the image and rounds to whole pixels", () => {
    expect(clampPixelRect({ x: -5, y: 2.7, width: 500, height: 10.4 }, 100, 50)).toEqual({
      x: 0,
      y: 2,
      width: 100,
      height: 10,
    });
    expect(clampPixelRect({ x: 200, y: 200, width: 0, height: 0 }, 100, 50)).toEqual({
      x: 99,
      y: 49,
      width: 1,
      height: 1,
    });
  });

  it("never returns non-finite values (hostile or broken messages)", () => {
    const rect = clampPixelRect(
      { x: Number.NaN, y: Infinity, width: NaN, height: -Infinity },
      64,
      32,
    );
    for (const v of Object.values(rect)) expect(Number.isFinite(v)).toBe(true);
    expect(rect).toEqual({ x: 0, y: 0, width: 64, height: 32 });
    expect(clampPixelRect({ x: 0, y: 0, width: Infinity, height: 1e308 }, 64, 32)).toEqual({
      x: 0,
      y: 0,
      width: 64,
      height: 32,
    });
  });

  it("re-encodes everything but JPEG as PNG", () => {
    expect(cropMime("image/jpeg")).toBe("image/jpeg");
    expect(cropMime("image/webp")).toBe("image/png");
    expect(cropMime("image/svg+xml")).toBe("image/png");
  });
});
