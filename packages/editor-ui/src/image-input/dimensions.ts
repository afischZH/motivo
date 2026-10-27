/**
 * Pixel dimensions from the header of a PNG, GIF, JPEG or WebP file, read
 * before decoding. Lets the image input refuse decompression bombs (a small
 * file that decodes to gigabytes) without handing them to the decoder.
 * Pure byte parsing; returns `null` when the header is missing or broken.
 */
import type { ImageMime } from "./sniff";

export interface ImageDimensions {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number): number => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number): number => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number): number => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number): number => u16be(b, i) * 0x10000 + u16be(b, i + 2);
const ascii = (b: Uint8Array, i: number, n: number): string =>
  String.fromCharCode(...b.subarray(i, i + n));

const valid = (width: number, height: number): ImageDimensions | null =>
  width > 0 && height > 0 ? { width, height } : null;

function png(b: Uint8Array): ImageDimensions | null {
  // Signature (8), chunk length (4), "IHDR" (4), width (4), height (4).
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  return valid(u32be(b, 16), u32be(b, 20));
}

function gif(b: Uint8Array): ImageDimensions | null {
  if (b.length < 10) return null;
  return valid(u16le(b, 6), u16le(b, 8));
}

/** Start-of-frame markers carry the size; C4 (DHT), C8 (JPG) and CC (DAC) do not. */
const isSof = (m: number): boolean =>
  m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function jpeg(b: Uint8Array): ImageDimensions | null {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1] ?? 0;
    // Fill bytes: any number of 0xFF before the marker.
    while (marker === 0xff && i + 2 < b.length) {
      i++;
      marker = b[i + 1] ?? 0;
    }
    i += 2;
    // Standalone markers without a length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / scan before a frame header
    const length = u16be(b, i);
    if (length < 2) return null;
    if (isSof(marker)) {
      if (i + 7 > b.length) return null;
      return valid(u16be(b, i + 5), u16be(b, i + 3));
    }
    i += length;
  }
  return null;
}

function webp(b: Uint8Array): ImageDimensions | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8X") return valid(u24le(b, 24) + 1, u24le(b, 27) + 1);
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const b1 = b[22] ?? 0;
    const b2 = b[23] ?? 0;
    const b3 = b[24] ?? 0;
    const width = 1 + (((b1 & 0x3f) << 8) | (b[21] ?? 0));
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return valid(width, height);
  }
  if (chunk === "VP8 ") {
    // Frame tag (3) and start code 9D 01 2A, then 14-bit width and height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return valid(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  return null;
}

/** Dimensions of a raster image, or `null` (SVG has no fixed pixel size). */
export function imageDimensions(bytes: Uint8Array, mime: ImageMime): ImageDimensions | null {
  switch (mime) {
    case "image/png":
      return png(bytes);
    case "image/gif":
      return gif(bytes);
    case "image/jpeg":
      return jpeg(bytes);
    case "image/webp":
      return webp(bytes);
    case "image/svg+xml":
      return null;
  }
}

/** Size that fits `maxEdge` while keeping the aspect ratio; never upscales, at least 1 × 1. */
export function fitWithin(width: number, height: number, maxEdge: number): ImageDimensions {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
