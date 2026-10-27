import { describe, expect, it } from "vitest";
import {
  DEFAULT_JPG_BACKGROUND,
  FILE_EXTENSIONS,
  MIME_TYPES,
  RASTER_FORMATS,
  exportFilename,
  isRasterFormat,
  resolveBackground,
  resolveQuality,
} from "./formats";

describe("format tables", () => {
  it("maps raster formats to browser-encodable MIME types", () => {
    expect(RASTER_FORMATS.map((f) => MIME_TYPES[f])).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
    expect(MIME_TYPES.svg).toBe("image/svg+xml");
    expect(FILE_EXTENSIONS.jpg).toBe("jpg");
  });

  it("recognises raster formats", () => {
    expect(isRasterFormat("webp")).toBe(true);
    expect(isRasterFormat("svg")).toBe(false);
  });
});

describe("resolveQuality", () => {
  it("uses defaults for lossy formats and none for PNG", () => {
    expect(resolveQuality("png", 0.5)).toBeUndefined();
    expect(resolveQuality("jpg")).toBe(0.92);
    expect(resolveQuality("webp")).toBe(0.9);
  });

  it("clamps user values and ignores non-finite ones", () => {
    expect(resolveQuality("jpg", 2)).toBe(1);
    expect(resolveQuality("jpg", -1)).toBe(0);
    expect(resolveQuality("jpg", 0.7)).toBe(0.7);
    expect(resolveQuality("webp", Number.NaN)).toBe(0.9);
  });
});

describe("resolveBackground", () => {
  it("always fills JPG", () => {
    expect(resolveBackground("jpg")).toBe(DEFAULT_JPG_BACKGROUND);
    expect(resolveBackground("jpg", "transparent")).toBe(DEFAULT_JPG_BACKGROUND);
    expect(resolveBackground("jpg", "#123456")).toBe("#123456");
  });

  it("keeps PNG and WebP transparent unless asked", () => {
    expect(resolveBackground("png")).toBeUndefined();
    expect(resolveBackground("webp", "transparent")).toBeUndefined();
    expect(resolveBackground("png", "#000")).toBe("#000");
  });
});

describe("exportFilename", () => {
  it("follows motivo-<toolId>-<seed>.<ext>", () => {
    expect(exportFilename("css-gradient", 42, "png")).toBe("motivo-css-gradient-42.png");
    expect(exportFilename("blob", 7, ".css", "clip-path")).toBe("motivo-blob-7-clip-path.css");
  });

  it("prints seeds as uint32 and sanitises ids", () => {
    expect(exportFilename("blob", -1, "svg")).toBe("motivo-blob-4294967295.svg");
    expect(exportFilename("../Evil Tool", 1, "svg")).toBe("motivo-evil-tool-1.svg");
    expect(exportFilename("///", 1, "svg")).toBe("motivo-design-1.svg");
  });
});
