/**
 * Image converter and compressor: settings, limits and the plain maths
 * around a conversion (target size, file name, savings). The pixels are
 * decoded and encoded in `image-convert.worker.ts`; this module stays pure
 * so it runs in Node tests.
 *
 * Only raster images on the allowlist are accepted (sniffed from the bytes,
 * never from the file name). SVG is left out on purpose: workers cannot
 * decode it, and SVG to PNG belongs in the editor's export.
 */
import { sniffImageType, type ImageMime } from "./sniff";

/** Formats the encoder writes. Chrome encodes all three with `convertToBlob`. */
export const OUTPUT_FORMATS = ["webp", "jpeg", "png"] as const;
export type OutputImageFormat = (typeof OUTPUT_FORMATS)[number];

export const OUTPUT_MIME: Record<OutputImageFormat, string> = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  png: "image/png",
};

export const OUTPUT_EXTENSION: Record<OutputImageFormat, string> = {
  webp: "webp",
  jpeg: "jpg",
  png: "png",
};

/** Raster inputs the converter accepts. */
export const INPUT_TYPES: readonly ImageMime[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

/** Largest input file. */
export const MAX_IMAGE_FILE_BYTES = 25 * 1024 * 1024;
/** Most files per batch. */
export const MAX_IMAGE_FILES = 30;
/** Largest edge of the decoded image (memory: 8192² RGBA is 256 MB). */
export const MAX_IMAGE_EDGE = 8192;
/** Bounds of the optional longest-edge limit. */
export const MAX_EDGE_MIN = 16;

export interface ImageConvertSettings {
  format: OutputImageFormat;
  /** 1 to 100; ignored for PNG. */
  quality: number;
  /** Longest edge in px, or `null` to keep the size. Never enlarges. */
  maxEdge: number | null;
  /** Fill behind transparent pixels for JPG (which has no alpha). */
  matte: string;
}

export const DEFAULT_SETTINGS: ImageConvertSettings = {
  format: "webp",
  quality: 80,
  maxEdge: null,
  matte: "#ffffff",
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Clamps settings from the UI (or storage) into the allowed range. */
export function normalizeSettings(input: Partial<ImageConvertSettings>): ImageConvertSettings {
  const format = OUTPUT_FORMATS.includes(input.format as OutputImageFormat)
    ? (input.format as OutputImageFormat)
    : DEFAULT_SETTINGS.format;
  const q = Number(input.quality);
  const quality = Number.isFinite(q) ? Math.min(100, Math.max(1, Math.round(q))) : 80;
  const e = input.maxEdge === null || input.maxEdge === undefined ? null : Number(input.maxEdge);
  const maxEdge =
    e === null || !Number.isFinite(e)
      ? null
      : Math.min(MAX_IMAGE_EDGE, Math.max(MAX_EDGE_MIN, Math.round(e)));
  const matte = typeof input.matte === "string" && HEX.test(input.matte) ? input.matte : "#ffffff";
  return { format, quality, maxEdge, matte };
}

/** Output size: fits the longest edge into `maxEdge`, keeps the aspect ratio, never enlarges. */
export function targetSize(
  width: number,
  height: number,
  maxEdge: number | null,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (maxEdge === null || longest <= maxEdge) return { width, height };
  const k = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
  };
}

/** Encoder quality in [0, 1], or undefined for lossless PNG. */
export function encoderQuality(settings: ImageConvertSettings): number | undefined {
  return settings.format === "png" ? undefined : settings.quality / 100;
}

/**
 * Output file name: the input name with the new extension, made safe for
 * every file system and ZIP (no path parts, no control characters).
 */
export function outputFileName(inputName: string, format: OutputImageFormat): string {
  const base = (inputName.split(/[\\/]/).pop() ?? "")
    .replace(/\.[^.]*$/, "")
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .trim()
    .slice(0, 120);
  return `${base || "image"}.${OUTPUT_EXTENSION[format]}`;
}

/** Makes names unique within one batch: `photo.webp`, `photo-2.webp`, ... */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 1) return name;
    const dot = name.lastIndexOf(".");
    return `${name.slice(0, dot)}-${count}${name.slice(dot)}`;
  });
}

/** Saved share in percent (negative when the result is larger). */
export function savings(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round((1 - after / before) * 100);
}

export type ImageInputError = "tooLarge" | "unsupportedType";

/** Checks one input file's size and sniffs its type from the first bytes. */
export function checkImageInput(
  head: Uint8Array,
  size: number,
): { ok: true; mime: ImageMime } | { ok: false; error: ImageInputError } {
  if (size > MAX_IMAGE_FILE_BYTES) return { ok: false, error: "tooLarge" };
  const mime = sniffImageType(head);
  if (mime === null || !INPUT_TYPES.includes(mime)) return { ok: false, error: "unsupportedType" };
  return { ok: true, mime };
}
