import { describe, expect, it } from "vitest";
import {
  IMAGE_INPUT_MAX_BYTES,
  IMAGE_INPUT_MAX_PIXELS,
  checkImageBytes,
  checkImageSize,
} from "./check";
import { fitWithin, imageDimensions } from "./dimensions";

const bytes = (...parts: (number[] | string)[]): Uint8Array =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
const u32be = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const u16be = (v: number) => [(v >> 8) & 255, v & 255];
const u16le = (v: number) => [v & 255, (v >> 8) & 255];
const u24le = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255];

const png = (w: number, h: number) =>
  bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    u32be(13),
    "IHDR",
    u32be(w),
    u32be(h),
    [8, 6, 0, 0, 0],
  );
const gif = (w: number, h: number) => bytes("GIF89a", u16le(w), u16le(h), [0, 0, 0]);
/** SOI, an APP0 segment, then a baseline SOF0 frame header. */
const jpeg = (w: number, h: number) =>
  bytes(
    [0xff, 0xd8, 0xff, 0xe0],
    u16be(6),
    "JFIF",
    [0xff, 0xff, 0xc0],
    u16be(17),
    [8],
    u16be(h),
    u16be(w),
    [3],
  );
const webpX = (w: number, h: number) =>
  bytes(
    "RIFF",
    [0, 0, 0, 0],
    "WEBP",
    "VP8X",
    u32be(10).reverse(),
    [0, 0, 0, 0],
    u24le(w - 1),
    u24le(h - 1),
  );
const webpLossy = (w: number, h: number) =>
  bytes(
    "RIFF",
    [0, 0, 0, 0],
    "WEBP",
    "VP8 ",
    [0, 0, 0, 0],
    [0, 0, 0],
    [0x9d, 0x01, 0x2a],
    u16le(w),
    u16le(h),
  );
function webpLossless(w: number, h: number): Uint8Array {
  const a = w - 1;
  const b = h - 1;
  return bytes(
    "RIFF",
    [0, 0, 0, 0],
    "WEBP",
    "VP8L",
    [0, 0, 0, 0],
    [0x2f],
    [a & 0xff, ((a >> 8) & 0x3f) | ((b & 0x3) << 6), (b >> 2) & 0xff, (b >> 10) & 0x0f],
    [0, 0, 0, 0, 0],
  );
}

describe("imageDimensions", () => {
  it("reads the size of every raster format from its header", () => {
    expect(imageDimensions(png(640, 480), "image/png")).toEqual({ width: 640, height: 480 });
    expect(imageDimensions(gif(320, 200), "image/gif")).toEqual({ width: 320, height: 200 });
    expect(imageDimensions(jpeg(4032, 3024), "image/jpeg")).toEqual({ width: 4032, height: 3024 });
    expect(imageDimensions(webpX(5000, 3000), "image/webp")).toEqual({ width: 5000, height: 3000 });
    expect(imageDimensions(webpLossy(800, 600), "image/webp")).toEqual({ width: 800, height: 600 });
    expect(imageDimensions(webpLossless(1234, 5678), "image/webp")).toEqual({
      width: 1234,
      height: 5678,
    });
  });

  it("returns null for truncated or broken headers and for SVG", () => {
    expect(imageDimensions(png(1, 1).subarray(0, 20), "image/png")).toBeNull();
    expect(imageDimensions(png(0, 10), "image/png")).toBeNull();
    expect(imageDimensions(bytes([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg")).toBeNull();
    expect(imageDimensions(bytes([0xff, 0xd8, 0x00, 0x00, 0x00]), "image/jpeg")).toBeNull();
    expect(imageDimensions(bytes("<svg/>"), "image/svg+xml")).toBeNull();
  });
});

describe("fitWithin", () => {
  it("downsamples to the longest edge and never upscales", () => {
    expect(fitWithin(4000, 3000, 256)).toEqual({ width: 256, height: 192 });
    expect(fitWithin(100, 5000, 256)).toEqual({ width: 5, height: 256 });
    expect(fitWithin(120, 80, 256)).toEqual({ width: 120, height: 80 });
    expect(fitWithin(10000, 1, 256)).toEqual({ width: 256, height: 1 });
  });
});

describe("checkImageBytes", () => {
  it("accepts allowed types by their bytes", () => {
    expect(checkImageBytes(png(10, 10))).toEqual({
      ok: true,
      mime: "image/png",
      dimensions: { width: 10, height: 10 },
    });
    expect(checkImageBytes(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toEqual({
      ok: true,
      mime: "image/svg+xml",
      dimensions: null,
    });
  });

  it("refuses unknown types, decompression bombs, broken headers and large files", () => {
    expect(checkImageBytes(bytes("%PDF-1.7"))).toEqual({ ok: false, error: "unsupported-type" });
    expect(checkImageBytes(bytes("<html><script></script></html>"))).toEqual({
      ok: false,
      error: "unsupported-type",
    });
    expect(checkImageBytes(png(20000, 20000))).toEqual({ ok: false, error: "too-many-pixels" });
    expect(IMAGE_INPUT_MAX_PIXELS).toBeLessThan(20000 * 20000);
    expect(checkImageBytes(bytes([0xff, 0xd8, 0xff, 0xd9]))).toEqual({
      ok: false,
      error: "decode-failed",
    });
    const big = new Uint8Array(IMAGE_INPUT_MAX_BYTES + 1);
    big.set(png(10, 10));
    expect(checkImageBytes(big)).toEqual({ ok: false, error: "too-large" });
    expect(checkImageSize(IMAGE_INPUT_MAX_BYTES)).toBeNull();
    expect(checkImageSize(IMAGE_INPUT_MAX_BYTES + 1)).toBe("too-large");
  });
});
