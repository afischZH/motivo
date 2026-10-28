/**
 * Messages between the editor and the image-input worker, plus the worker's
 * request handler with its browser APIs injected, so it is unit-testable.
 * Messages carry plain data only; nothing from the image is ever evaluated.
 */
import { toBase64 } from "@motivo/engine";
import { deriveFromImage, type AnyToolDefinition, type PixelBuffer } from "@motivo/tool-registry";
import { fitWithin } from "./dimensions";

/** A rectangle in source pixels. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Output types of a cropped upload: JPEG stays JPEG (no alpha), everything else PNG. */
export type CropMime = "image/png" | "image/jpeg";

/** Quality of re-encoded JPEG uploads. */
export const CROP_JPEG_QUALITY = 0.9;

/** Plain parameter object (type-erased). */
type Values = Readonly<Record<string, unknown>>;

export type ImageWorkerRequest =
  | { id: number; type: "decode"; bytes: ArrayBuffer; mime: string; maxEdge: number }
  | {
      id: number;
      type: "crop";
      bytes: ArrayBuffer;
      mime: string;
      /** Part of the source to keep, in source pixels. */
      crop: PixelRect;
      /** Longest edge of the output. */
      maxEdge: number;
    }
  | {
      id: number;
      type: "derive";
      toolId: string;
      pixels: PixelBuffer;
      params: Values;
      seed: number;
    };

/** `unsupported`: this worker cannot decode (no OffscreenCanvas); the caller falls back. */
export type ImageWorkerError = "decode-failed" | "unsupported" | "unknown-tool";

export type ImageWorkerResponse =
  | { id: number; type: "decode"; ok: true; pixels: PixelBuffer }
  | { id: number; type: "derive"; ok: true; patch: Values | null }
  | { id: number; type: "crop"; ok: true; href: string; width: number; height: number }
  | { id: number; type: "decode" | "derive" | "crop"; ok: false; error: ImageWorkerError };

/** Decoded bitmap: `ImageBitmap` in a browser, a fake in tests. */
export interface BitmapLike {
  readonly width: number;
  readonly height: number;
  close(): void;
}

/** The browser APIs the worker uses. */
export interface ImageWorkerEnv {
  /** `null` where `createImageBitmap` or `OffscreenCanvas` is missing. */
  createBitmap: ((blob: Blob) => Promise<BitmapLike>) | null;
  /** Draws the bitmap scaled to `width` × `height` and reads the RGBA pixels. */
  readPixels(bitmap: BitmapLike, width: number, height: number): PixelBuffer;
  /**
   * Draws `crop` of the bitmap scaled to `width` × `height` and encodes it.
   * Resolves to the encoded bytes and their actual type (a browser may fall
   * back to PNG). Missing where `OffscreenCanvas.convertToBlob` is.
   */
  encodeCrop?:
    | ((
        bitmap: BitmapLike,
        crop: PixelRect,
        width: number,
        height: number,
        mime: CropMime,
      ) => Promise<{ bytes: Uint8Array; mime: string }>)
    | null;
  lookup(toolId: string): AnyToolDefinition | undefined;
}

/** Output type for an upload of type `mime`. */
export function cropMime(mime: string): CropMime {
  return mime === "image/jpeg" ? "image/jpeg" : "image/png";
}

/** Clamps a crop to the image and rounds it to whole pixels (at least 1 × 1). */
export function clampPixelRect(crop: PixelRect, width: number, height: number): PixelRect {
  const x = Math.min(Math.max(0, Math.floor(crop.x)), Math.max(0, width - 1));
  const y = Math.min(Math.max(0, Math.floor(crop.y)), Math.max(0, height - 1));
  const w = Math.min(Math.max(1, Math.round(crop.width)), width - x);
  const h = Math.min(Math.max(1, Math.round(crop.height)), height - y);
  return { x, y, width: w, height: h };
}

/** `data:` URI of encoded image bytes. */
export function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${toBase64(bytes)}`;
}

export async function handleImageRequest(
  request: ImageWorkerRequest,
  env: ImageWorkerEnv,
): Promise<ImageWorkerResponse> {
  const { id } = request;
  if (request.type === "derive") {
    const tool = env.lookup(request.toolId);
    if (!tool) return { id, type: "derive", ok: false, error: "unknown-tool" };
    const patch = deriveFromImage(tool, request.pixels, request.params, request.seed);
    return { id, type: "derive", ok: true, patch };
  }
  if (request.type === "crop") return handleCrop(request, env);
  if (!env.createBitmap) return { id, type: "decode", ok: false, error: "unsupported" };
  let bitmap: BitmapLike;
  try {
    bitmap = await env.createBitmap(new Blob([request.bytes], { type: request.mime }));
  } catch {
    return { id, type: "decode", ok: false, error: "decode-failed" };
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height, request.maxEdge);
    return {
      id,
      type: "decode",
      ok: true,
      pixels: env.readPixels(bitmap, size.width, size.height),
    };
  } catch {
    return { id, type: "decode", ok: false, error: "decode-failed" };
  } finally {
    bitmap.close();
  }
}

async function handleCrop(
  request: Extract<ImageWorkerRequest, { type: "crop" }>,
  env: ImageWorkerEnv,
): Promise<ImageWorkerResponse> {
  const { id } = request;
  const encode = env.encodeCrop;
  if (!env.createBitmap || !encode) return { id, type: "crop", ok: false, error: "unsupported" };
  let bitmap: BitmapLike;
  try {
    bitmap = await env.createBitmap(new Blob([request.bytes], { type: request.mime }));
  } catch {
    return { id, type: "crop", ok: false, error: "decode-failed" };
  }
  try {
    const crop = clampPixelRect(request.crop, bitmap.width, bitmap.height);
    const size = fitWithin(crop.width, crop.height, request.maxEdge);
    const out = await encode(bitmap, crop, size.width, size.height, cropMime(request.mime));
    if (out.mime !== "image/png" && out.mime !== "image/jpeg") {
      return { id, type: "crop", ok: false, error: "decode-failed" };
    }
    return {
      id,
      type: "crop",
      ok: true,
      href: bytesToDataUri(out.bytes, out.mime),
      width: size.width,
      height: size.height,
    };
  } catch {
    return { id, type: "crop", ok: false, error: "decode-failed" };
  } finally {
    bitmap.close();
  }
}
