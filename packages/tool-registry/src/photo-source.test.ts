import { pixelDigest } from "@musterli/effects";
import { describe, expect, it } from "vitest";
import {
  PHOTO_SAMPLE_MAX_EDGE,
  fitSize,
  isImageEffectTool,
  photoAssetOf,
  photoDesignSize,
  photoSampleSize,
  renderImageEffect,
} from "./photo-source";
import { asciiArtTool, blobTool, duotoneTool } from "./tools";

const PHOTO = {
  kind: "raster",
  href: "data:image/jpeg;base64,AAAA",
  width: 1200,
  height: 800,
  name: "x.jpg",
};

describe("photo source helpers", () => {
  it("fits sizes down, never up", () => {
    expect(fitSize({ width: 4000, height: 1000 }, 2000)).toEqual({ width: 2000, height: 500 });
    expect(fitSize({ width: 300, height: 200 }, 2000)).toEqual({ width: 300, height: 200 });
    expect(photoSampleSize({ width: 8192, height: 4096 })).toEqual({
      width: PHOTO_SAMPLE_MAX_EDGE,
      height: PHOTO_SAMPLE_MAX_EDGE / 2,
    });
  });

  it("uses the photo size as design size, within the canvas limits", () => {
    expect(photoDesignSize(PHOTO)).toEqual({ width: 1200, height: 800 });
    expect(photoDesignSize({ ...PHOTO, width: 8, height: 4 })).toEqual({ width: 32, height: 16 });
    expect(photoDesignSize({ ...PHOTO, kind: "svg" })).toBeNull();
    expect(photoDesignSize(null)).toBeNull();
    expect(photoDesignSize({ kind: "raster", width: 0, height: 5 })).toBeNull();
  });

  it("finds the photo of photo tools only", () => {
    expect(photoAssetOf(duotoneTool, { ...duotoneTool.defaults, photo: PHOTO })).toEqual({
      href: PHOTO.href,
      width: 1200,
      height: 800,
    });
    expect(photoAssetOf(duotoneTool, duotoneTool.defaults)).toBeNull();
    expect(photoAssetOf(blobTool, { photo: PHOTO })).toBeNull();
    expect(isImageEffectTool(duotoneTool)).toBe(true);
    expect(isImageEffectTool(asciiArtTool)).toBe(false);
  });

  it("renders the sample deterministically and checks the source size", () => {
    const design = { width: 300, height: 200 };
    const out = { width: 60, height: 40 };
    const a = renderImageEffect(duotoneTool, duotoneTool.defaults, 1, design, out);
    const b = renderImageEffect(duotoneTool, duotoneTool.defaults, 1, design, out);
    expect(a).toMatchObject(out);
    expect(pixelDigest(a)).toBe(pixelDigest(b));
    expect(() =>
      renderImageEffect(duotoneTool, duotoneTool.defaults, 1, design, out, {
        width: 10,
        height: 10,
        data: new Uint8ClampedArray(400),
      }),
    ).toThrow(RangeError);
    expect(() => renderImageEffect(blobTool, blobTool.defaults, 1, design, out)).toThrow(TypeError);
  });
});
