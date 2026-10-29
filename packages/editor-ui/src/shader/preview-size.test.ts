import { describe, expect, it } from "vitest";
import { SHADER_ANIMATION_MAX_PIXELS, shaderPreviewSize } from "../shell/motif";
import { SHADER_FRAME_MAX_EDGE } from "./protocol";

describe("shaderPreviewSize", () => {
  it("draws device pixels, never above the design", () => {
    expect(shaderPreviewSize({ width: 1600, height: 1000 }, 0.5, 2)).toEqual({
      width: 1600,
      height: 1000,
    });
    expect(shaderPreviewSize({ width: 1600, height: 1000 }, 0.25, 1)).toEqual({
      width: 400,
      height: 250,
    });
  });

  it("keeps stills within one pass of the GPU", () => {
    const size = shaderPreviewSize({ width: 8000, height: 4000 }, 1, 2);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(SHADER_FRAME_MAX_EDGE);
    expect(size.width / size.height).toBeCloseTo(2, 2);
  });

  it("draws animation frames smaller", () => {
    const size = shaderPreviewSize(
      { width: 1920, height: 1080 },
      1,
      2,
      SHADER_ANIMATION_MAX_PIXELS,
    );
    expect(size.width * size.height).toBeLessThanOrEqual(SHADER_ANIMATION_MAX_PIXELS * 1.01);
    expect(size.width / size.height).toBeCloseTo(1920 / 1080, 1);
  });
});
