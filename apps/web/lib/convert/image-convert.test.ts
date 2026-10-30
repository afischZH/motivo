import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  MAX_IMAGE_EDGE,
  MAX_IMAGE_FILE_BYTES,
  checkImageInput,
  encoderQuality,
  normalizeSettings,
  outputFileName,
  savings,
  targetSize,
  uniqueNames,
} from "./image-convert";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

describe("image converter", () => {
  it("fits the longest edge and never enlarges", () => {
    expect(targetSize(4000, 3000, 1000)).toEqual({ width: 1000, height: 750 });
    expect(targetSize(3000, 4000, 1000)).toEqual({ width: 750, height: 1000 });
    expect(targetSize(800, 600, 1000)).toEqual({ width: 800, height: 600 });
    expect(targetSize(800, 600, null)).toEqual({ width: 800, height: 600 });
    expect(targetSize(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });

  it("clamps settings into range", () => {
    expect(normalizeSettings({ quality: 500, maxEdge: 1, matte: "red" })).toEqual({
      ...DEFAULT_SETTINGS,
      quality: 100,
      maxEdge: 16,
    });
    expect(normalizeSettings({ format: "gif" as never, maxEdge: 99999 }).maxEdge).toBe(
      MAX_IMAGE_EDGE,
    );
    expect(normalizeSettings({ format: "gif" as never }).format).toBe("webp");
    expect(normalizeSettings({ quality: Number.NaN }).quality).toBe(80);
  });

  it("drops the quality for lossless PNG", () => {
    expect(encoderQuality({ ...DEFAULT_SETTINGS, format: "png" })).toBeUndefined();
    expect(encoderQuality({ ...DEFAULT_SETTINGS, quality: 75 })).toBe(0.75);
  });

  it("builds safe output names", () => {
    expect(outputFileName("Holiday photo.JPG", "webp")).toBe("Holiday photo.webp");
    expect(outputFileName("../../etc/passwd", "png")).toBe("passwd.png");
    expect(outputFileName('a<b>:"c".png', "jpeg")).toBe("abc.jpg");
    expect(outputFileName(".png", "webp")).toBe("image.webp");
  });

  it("numbers duplicate names", () => {
    expect(uniqueNames(["a.webp", "b.webp", "A.webp", "a.webp"])).toEqual([
      "a.webp",
      "b.webp",
      "A-2.webp",
      "a-3.webp",
    ]);
  });

  it("computes savings", () => {
    expect(savings(1000, 250)).toBe(75);
    expect(savings(1000, 1500)).toBe(-50);
    expect(savings(0, 10)).toBe(0);
  });

  it("accepts raster images only and checks the size", () => {
    expect(checkImageInput(PNG, 100)).toEqual({ ok: true, mime: "image/png" });
    expect(checkImageInput(SVG, 100)).toEqual({ ok: false, error: "unsupportedType" });
    expect(checkImageInput(PNG, MAX_IMAGE_FILE_BYTES + 1)).toEqual({
      ok: false,
      error: "tooLarge",
    });
  });
});
