import { polkaDotsTool } from "@musterli/tool-registry";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { THUMBNAIL_RENDER_EDGE, Thumbnail, thumbnailRenderSize } from "./thumbnail";

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

describe("Thumbnail", () => {
  it("renders only a same-size placeholder on the server", () => {
    const html = renderToString(
      createElement(Thumbnail, {
        tool: polkaDotsTool as never,
        params: polkaDotsTool.defaults,
        seed: 1,
        size: { width: 1920, height: 1080 },
        edge: 72,
      }),
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("data:");
    expect(html).toContain("data-thumbnail-placeholder");
    expect(html).toContain("width:72px");
    expect(html).toContain("height:40.5px");
  });
});
