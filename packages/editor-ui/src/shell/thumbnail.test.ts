import { describe, expect, it } from "vitest";
import { THUMBNAIL_RENDER_EDGE, thumbnailRenderSize } from "./thumbnail";

describe("thumbnailRenderSize", () => {
  it("scales the longest edge down and keeps the aspect ratio", () => {
    expect(thumbnailRenderSize({ width: 1080, height: 1080 })).toEqual({
      width: THUMBNAIL_RENDER_EDGE,
      height: THUMBNAIL_RENDER_EDGE,
    });
    expect(thumbnailRenderSize({ width: 1920, height: 1080 })).toEqual({ width: 256, height: 144 });
    expect(thumbnailRenderSize({ width: 1080, height: 1350 })).toEqual({ width: 205, height: 256 });
  });

  it("keeps every edge at least 1 px for extreme strips", () => {
    expect(thumbnailRenderSize({ width: 8192, height: 16 })).toEqual({ width: 256, height: 1 });
  });

  it("leaves small sizes untouched", () => {
    const size = { width: 200, height: 100 };
    expect(thumbnailRenderSize(size)).toBe(size);
  });
});
