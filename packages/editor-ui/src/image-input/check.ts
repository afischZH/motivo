/**
 * Checks on a user image before anything decodes it (docs/ARCHITECTURE.md,
 * image input): size limit, type by magic bytes (the file name and declared
 * type are ignored) and, for raster formats, the pixel count from the header.
 * Pure, so the limits are unit-tested without a browser.
 */
import { imageDimensions, type ImageDimensions } from "./dimensions";
import { sniffImageType, type ImageMime } from "./sniff";

/** Largest accepted file, like the converters. */
export const IMAGE_INPUT_MAX_BYTES = 5 * 1024 * 1024;
/** Largest decoded image (64 MP, e.g. 8000 × 8000); guards against decompression bombs. */
export const IMAGE_INPUT_MAX_PIXELS = 64_000_000;
/** `accept` of the file input. Only a hint for the picker; the bytes decide. */
export const IMAGE_INPUT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";

/** Every way loading an image can fail; keys of `Editor.imageInput.errors`. */
export type ImageInputError =
  | "too-large"
  | "unsupported-type"
  | "too-many-pixels"
  | "read-failed"
  | "decode-failed"
  | "timeout"
  | "no-result";

export type CheckedImage =
  | { ok: true; mime: ImageMime; dimensions: ImageDimensions | null }
  | { ok: false; error: ImageInputError };

/** Size check on the file itself, before reading it. */
export function checkImageSize(bytes: number): ImageInputError | null {
  return bytes > IMAGE_INPUT_MAX_BYTES ? "too-large" : null;
}

/** Type and pixel-count check on the file's bytes. */
export function checkImageBytes(bytes: Uint8Array): CheckedImage {
  const sizeError = checkImageSize(bytes.length);
  if (sizeError) return { ok: false, error: sizeError };
  const mime = sniffImageType(bytes);
  if (mime === null) return { ok: false, error: "unsupported-type" };
  if (mime === "image/svg+xml") return { ok: true, mime, dimensions: null };
  const dimensions = imageDimensions(bytes, mime);
  if (dimensions === null) return { ok: false, error: "decode-failed" };
  if (dimensions.width * dimensions.height > IMAGE_INPUT_MAX_PIXELS) {
    return { ok: false, error: "too-many-pixels" };
  }
  return { ok: true, mime, dimensions };
}
