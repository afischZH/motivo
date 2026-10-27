/**
 * Messages between the editor and the image-input worker, plus the worker's
 * request handler with its browser APIs injected, so it is unit-testable.
 * Messages carry plain data only; nothing from the image is ever evaluated.
 */
import { deriveFromImage, type AnyToolDefinition, type PixelBuffer } from "@motivo/tool-registry";
import { fitWithin } from "./dimensions";

/** Plain parameter object (type-erased). */
type Values = Readonly<Record<string, unknown>>;

export type ImageWorkerRequest =
  | { id: number; type: "decode"; bytes: ArrayBuffer; mime: string; maxEdge: number }
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
  | { id: number; type: "decode" | "derive"; ok: false; error: ImageWorkerError };

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
  lookup(toolId: string): AnyToolDefinition | undefined;
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
