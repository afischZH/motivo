/**
 * Loading and analysing user images for tools with `imageInput`
 * (docs/ARCHITECTURE.md, image input). The image never leaves the browser:
 *
 *  1. size, type (magic bytes) and pixel count are checked before decoding;
 *  2. raster images are decoded and downsampled in a worker; SVG is only
 *     rasterised through an `<img>` (no scripts, no external resources);
 *  3. `imageInput.derive` runs in the same worker.
 *
 * Every worker call has a timeout; a worker that hangs is terminated and
 * replaced on the next call. Where workers or `OffscreenCanvas` are missing,
 * decoding falls back to an `<img>` on the main thread and deriving runs
 * there too (the pixels are at most `maxEdge`², so that stays short).
 */
import { deriveFromImage, type AnyToolDefinition, type PixelBuffer } from "@motivo/tool-registry";
import type { ParamValues } from "../store/editor-store";
import { checkImageBytes, checkImageSize, type ImageInputError } from "./check";
import { fitWithin } from "./dimensions";
import {
  CROP_JPEG_QUALITY,
  bytesToDataUri,
  clampPixelRect,
  cropMime,
  type ImageWorkerRequest,
  type ImageWorkerResponse,
  type PixelRect,
} from "./protocol";

export type ImageDecodeResult =
  { ok: true; pixels: PixelBuffer } | { ok: false; error: ImageInputError };

export type ImageDeriveResult =
  { ok: true; patch: ParamValues } | { ok: false; error: ImageInputError };

/** A cropped, downsampled and re-encoded raster upload. */
export type ImageCropResult =
  { ok: true; href: string; width: number; height: number } | { ok: false; error: ImageInputError };

export interface ImageInputServices {
  /** Checks, decodes and downsamples `file` to at most `maxEdge` pixels per side. */
  decode(file: Blob, maxEdge: number): Promise<ImageDecodeResult>;
  /** Runs `tool.imageInput.derive` for the pixels, params and seed. */
  derive(
    tool: AnyToolDefinition,
    pixels: PixelBuffer,
    params: ParamValues,
    seed: number,
  ): Promise<ImageDeriveResult>;
  /**
   * Cuts `crop` (source pixels) out of a checked raster image, scales it to
   * at most `maxEdge` and encodes it as a PNG or JPEG data URI (worker).
   */
  crop(bytes: Uint8Array, mime: string, crop: PixelRect, maxEdge: number): Promise<ImageCropResult>;
  /** Stops the worker. */
  dispose(): void;
}

/** Worker subset used here. */
export interface ImageWorkerLike {
  onmessage: ((event: MessageEvent<ImageWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: ImageWorkerRequest): void;
  terminate(): void;
}

export interface ImageInputEnv {
  /** Resolves to `null` where workers are unavailable. */
  createWorker(): Promise<ImageWorkerLike | null>;
  /** Decodes through an `<img>` and reads the pixels from a small canvas. */
  decodeOnMainThread(bytes: Uint8Array, mime: string, maxEdge: number): Promise<PixelBuffer>;
  /** Crops and encodes through an `<img>` and a canvas; optional (tests). */
  cropOnMainThread?(
    bytes: Uint8Array,
    mime: string,
    crop: PixelRect,
    maxEdge: number,
  ): Promise<{ href: string; width: number; height: number }>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const DECODE_TIMEOUT_MS = 20_000;
export const DERIVE_TIMEOUT_MS = 10_000;
export const CROP_TIMEOUT_MS = 20_000;

type CallResult = ImageWorkerResponse | { failure: "timeout" | "unavailable" };

export function createImageInputServices(env: ImageInputEnv): ImageInputServices {
  let worker: ImageWorkerLike | null = null;
  let starting: Promise<ImageWorkerLike | null> | null = null;
  /** A worker that crashed or failed to load is not tried again. */
  let broken = false;
  let nextId = 1;
  const pending = new Map<number, { resolve(r: CallResult): void; timer: unknown }>();

  const settleAll = (failure: "timeout" | "unavailable") => {
    for (const { resolve, timer } of pending.values()) {
      env.clearTimeout(timer);
      resolve({ failure });
    }
    pending.clear();
  };

  const stop = () => {
    worker?.terminate();
    worker = null;
    starting = null;
  };

  const getWorker = async (): Promise<ImageWorkerLike | null> => {
    if (broken) return null;
    if (worker) return worker;
    starting ??= env
      .createWorker()
      .catch(() => null)
      .then((w) => {
        if (!w) {
          broken = true;
          return null;
        }
        w.onmessage = (event) => {
          const entry = pending.get(event.data.id);
          if (!entry) return;
          pending.delete(event.data.id);
          env.clearTimeout(entry.timer);
          entry.resolve(event.data);
        };
        const crash = (event?: Event) => {
          // Handled here: keep it out of the console as an uncaught error.
          event?.preventDefault();
          broken = true;
          stop();
          settleAll("unavailable");
        };
        w.onerror = crash;
        w.onmessageerror = crash;
        worker = w;
        return w;
      });
    return starting;
  };

  type Request = ImageWorkerRequest extends infer R
    ? R extends unknown
      ? Omit<R, "id">
      : never
    : never;

  const call = async (request: Request, timeoutMs: number): Promise<CallResult> => {
    const w = await getWorker();
    if (!w) return { failure: "unavailable" };
    const id = nextId++;
    return new Promise<CallResult>((resolve) => {
      const timer = env.setTimeout(() => {
        // A hanging worker (pathological image) is replaced on the next call.
        pending.delete(id);
        stop();
        settleAll("timeout");
        resolve({ failure: "timeout" });
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      w.postMessage({ ...request, id } as ImageWorkerRequest);
    });
  };

  const decodeHere = async (bytes: Uint8Array, mime: string, maxEdge: number) => {
    try {
      return { ok: true, pixels: await env.decodeOnMainThread(bytes, mime, maxEdge) } as const;
    } catch {
      return { ok: false, error: "decode-failed" } as const;
    }
  };

  return {
    async decode(file, maxEdge) {
      const sizeError = checkImageSize(file.size);
      if (sizeError) return { ok: false, error: sizeError };
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        return { ok: false, error: "read-failed" };
      }
      const checked = checkImageBytes(bytes);
      if (!checked.ok) return checked;
      if (checked.mime === "image/svg+xml") return decodeHere(bytes, checked.mime, maxEdge);
      // Copied, not transferred: the main-thread fallback may still need the bytes.
      const reply = await call(
        { type: "decode", bytes: bytes.buffer as ArrayBuffer, mime: checked.mime, maxEdge },
        DECODE_TIMEOUT_MS,
      );
      if ("failure" in reply) {
        return reply.failure === "timeout"
          ? { ok: false, error: "timeout" }
          : decodeHere(bytes, checked.mime, maxEdge);
      }
      if (reply.ok && reply.type === "decode") return { ok: true, pixels: reply.pixels };
      if (!reply.ok && reply.error === "unsupported")
        return decodeHere(bytes, checked.mime, maxEdge);
      return { ok: false, error: "decode-failed" };
    },

    async derive(tool, pixels, params, seed) {
      const reply = await call(
        { type: "derive", toolId: tool.id, pixels, params, seed },
        DERIVE_TIMEOUT_MS,
      );
      let patch: ParamValues | null;
      if ("failure" in reply) {
        if (reply.failure === "timeout") return { ok: false, error: "timeout" };
        patch = deriveFromImage(tool, pixels, params, seed);
      } else if (reply.ok && reply.type === "derive") {
        patch = reply.patch;
      } else {
        // The worker only knows registered tools; others (tests, previews) run here.
        patch = deriveFromImage(tool, pixels, params, seed);
      }
      return patch ? { ok: true, patch } : { ok: false, error: "no-result" };
    },

    async crop(bytes, mime, rect, maxEdge) {
      const here = async (): Promise<ImageCropResult> => {
        if (!env.cropOnMainThread) return { ok: false, error: "decode-failed" };
        try {
          return { ok: true, ...(await env.cropOnMainThread(bytes, mime, rect, maxEdge)) };
        } catch {
          return { ok: false, error: "decode-failed" };
        }
      };
      // Copied, not transferred: the main-thread fallback may still need the bytes.
      const copy = bytes.slice().buffer as ArrayBuffer;
      const reply = await call(
        { type: "crop", bytes: copy, mime, crop: rect, maxEdge },
        CROP_TIMEOUT_MS,
      );
      if ("failure" in reply) {
        return reply.failure === "timeout" ? { ok: false, error: "timeout" } : here();
      }
      if (reply.ok && reply.type === "crop") {
        return { ok: true, href: reply.href, width: reply.width, height: reply.height };
      }
      if (!reply.ok && reply.error === "unsupported") return here();
      return { ok: false, error: "decode-failed" };
    },

    dispose() {
      stop();
      settleAll("unavailable");
    },
  };
}

/** Crops and encodes on the main thread (no worker or no `OffscreenCanvas.convertToBlob`). */
async function cropWithImage(
  bytes: Uint8Array,
  mime: string,
  rect: PixelRect,
  maxEdge: number,
): Promise<{ href: string; width: number; height: number }> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const crop = clampPixelRect(rect, img.naturalWidth, img.naturalHeight);
    const size = fitWithin(crop.width, crop.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
    const type = cropMime(mime);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, type === "image/jpeg" ? CROP_JPEG_QUALITY : undefined),
    );
    if (!blob) throw new Error("Encoding failed");
    const out = new Uint8Array(await blob.arrayBuffer());
    return { href: bytesToDataUri(out, blob.type), width: size.width, height: size.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Decodes with an `<img>` (object URL) and reads the pixels from a small canvas. */
async function decodeWithImage(
  bytes: Uint8Array,
  mime: string,
  maxEdge: number,
): Promise<PixelBuffer> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    // An SVG without width/height has no intrinsic size in some browsers.
    const width = img.naturalWidth || maxEdge;
    const height = img.naturalHeight || maxEdge;
    const size = fitWithin(width, height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("No 2D context");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const { data } = ctx.getImageData(0, 0, size.width, size.height);
    return { width: size.width, height: size.height, data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The real browser services. Only call in a browser. */
export function browserImageInputServices(): ImageInputServices {
  return createImageInputServices({
    createWorker: async () => {
      if (typeof Worker === "undefined") return null;
      const { createImageInputWorker } = await import("./worker");
      return createImageInputWorker() as unknown as ImageWorkerLike;
    },
    decodeOnMainThread: decodeWithImage,
    cropOnMainThread: cropWithImage,
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
}
