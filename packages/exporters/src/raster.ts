/**
 * Raster export (PNG, JPG, WebP): SVG -> image -> canvas -> Blob.
 *
 * Preferred path: the browser decodes the SVG into an `ImageBitmap`, which is
 * transferred to a worker that draws and encodes it on an `OffscreenCanvas`
 * (encoding a 4K/8K PNG is the expensive part). Fallback: draw on a main
 * thread canvas in horizontal bands, yielding between bands, then encode
 * with `toBlob` (asynchronous in current browsers).
 *
 * Browser APIs are only touched inside functions, and all of them go
 * through `RasterEnv`, so the flow can be tested with fakes and the package
 * can be imported on the server.
 */
import type {
  AnyToolDefinition,
  Params,
  ParamsSchema,
  RenderContext,
  ToolDefinition,
} from "@motivo/tool-registry";
import { ExportError, throwIfAborted } from "./errors";
import { type EncodeRequest, type EncodeResponse } from "./raster-encode";
import {
  MIME_TYPES,
  exportFilename,
  resolveBackground,
  resolveQuality,
  type RasterFormat,
  FILE_EXTENSIONS,
} from "./formats";
import { resolveRasterSize, splitIntoBands, type RasterSizeRequest } from "./size";
import { resizeSvg } from "./svg-size";
import { renderDesignSvg, supportsExport } from "./text";

/** A decoded image; `release` frees its resources (object URL). */
export interface LoadedImage {
  image: CanvasImageSource;
  release(): void;
}

/** Main-thread canvas subset used by the fallback. */
export interface MainCanvasLike {
  getContext(type: "2d"): {
    fillStyle: string | CanvasGradient | CanvasPattern;
    fillRect(x: number, y: number, w: number, h: number): void;
    drawImage(
      image: CanvasImageSource,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ): void;
  } | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

/** Worker subset used here. */
export interface WorkerLike {
  onmessage: ((event: MessageEvent<EncodeResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: EncodeRequest, transfer: Transferable[]): void;
  terminate(): void;
}

/** Everything browser-specific the raster flow needs. */
export interface RasterEnv {
  /** Loads an SVG string as a decoded image. Throws on decode failure. */
  loadSvgImage(svg: string): Promise<LoadedImage>;
  /** Whether the worker path can work (Worker, OffscreenCanvas with convertToBlob, createImageBitmap). */
  workerSupported(): boolean;
  createImageBitmap(image: CanvasImageSource): Promise<ImageBitmap>;
  createWorker(): WorkerLike;
  createCanvas(width: number, height: number): MainCanvasLike;
  /** Gives the main thread back to the browser between bands. */
  yieldToMain(): Promise<void>;
}

export interface RasterizeOptions {
  format: RasterFormat;
  /** Output size in pixels; the SVG is re-sized to it before decoding. */
  width: number;
  height: number;
  /** 0 to 1 for JPG/WebP. Default `DEFAULT_QUALITY`. */
  quality?: number;
  /** Fill under the image. JPG defaults to white; `"transparent"` means none. */
  background?: string;
  signal?: AbortSignal;
  /** 0 to 1. */
  onProgress?: (fraction: number) => void;
  /** `"auto"` (default): worker if supported, else main thread. `"main"`: main thread only. */
  mode?: "auto" | "main";
  /** Max pixels per draw call on the main thread. Default `DEFAULT_BAND_PIXELS`. */
  bandPixels?: number;
}

const yieldToMain = (): Promise<void> => {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === "function") return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
};

/**
 * The real browser environment. Only call in a browser. Without
 * `createWorker` everything runs on the main thread.
 */
export function browserRasterEnv(createWorker?: () => WorkerLike): RasterEnv {
  return {
    async loadSvgImage(svg) {
      const url = URL.createObjectURL(new Blob([svg], { type: MIME_TYPES.svg }));
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      try {
        await img.decode();
      } catch (cause) {
        URL.revokeObjectURL(url);
        throw new ExportError("decode-failed", "The browser could not decode the SVG", { cause });
      }
      return { image: img, release: () => URL.revokeObjectURL(url) };
    },
    workerSupported() {
      return (
        createWorker !== undefined &&
        typeof Worker === "function" &&
        typeof createImageBitmap === "function" &&
        typeof OffscreenCanvas === "function" &&
        typeof OffscreenCanvas.prototype.convertToBlob === "function"
      );
    },
    createImageBitmap: (image) => createImageBitmap(image),
    createWorker() {
      if (!createWorker) throw new ExportError("unavailable", "No raster worker configured");
      return createWorker();
    },
    createCanvas(width, height) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
    yieldToMain,
  };
}

let defaultEnv: Promise<RasterEnv> | undefined;

/** Browser env with the bundled raster worker. Created on first use. */
export function defaultRasterEnv(): Promise<RasterEnv> {
  // Dynamic import keeps the worker URL out of bundles that never rasterise.
  defaultEnv ??= import("./raster-worker").then(({ createRasterWorker }) =>
    browserRasterEnv(() => createRasterWorker() as WorkerLike),
  );
  return defaultEnv;
}

let nextRequestId = 1;

function encodeInWorker(
  env: RasterEnv,
  request: EncodeRequest,
  signal: AbortSignal | undefined,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    let worker: WorkerLike;
    try {
      worker = env.createWorker();
    } catch (cause) {
      request.bitmap.close();
      reject(new ExportError("unavailable", "Could not start the raster worker", { cause }));
      return;
    }
    const finish = (): void => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const onAbort = (): void => {
      finish();
      reject(new ExportError("aborted", "Export aborted"));
    };
    worker.onmessage = (event) => {
      finish();
      const reply = event.data;
      if (reply.ok) resolve(reply.blob);
      else reject(new ExportError(reply.code, reply.message));
    };
    worker.onerror = (event) => {
      finish();
      reject(new ExportError("unavailable", `Raster worker failed: ${event.message}`));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage(request, [request.bitmap]);
  });
}

async function encodeOnMain(
  env: RasterEnv,
  image: CanvasImageSource,
  o: RasterizeOptions,
  mime: string,
  quality: number | undefined,
  background: string | undefined,
): Promise<Blob> {
  const { width, height } = o;
  let canvas: MainCanvasLike;
  let ctx: ReturnType<MainCanvasLike["getContext"]>;
  try {
    canvas = env.createCanvas(width, height);
    ctx = canvas.getContext("2d");
  } catch (cause) {
    throw new ExportError("encode-failed", "Could not create the canvas", { cause });
  }
  if (!ctx) throw new ExportError("encode-failed", `No 2D context for ${width}x${height}`);
  if (background !== undefined) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  const bands = splitIntoBands(width, height, o.bandPixels);
  for (const [i, band] of bands.entries()) {
    throwIfAborted(o.signal);
    // The image's intrinsic size equals the output size (see resizeSvg), so source = destination.
    ctx.drawImage(image, 0, band.y, width, band.height, 0, band.y, width, band.height);
    o.onProgress?.(((i + 1) / bands.length) * 0.9);
    if (i < bands.length - 1) await env.yieldToMain();
  }
  throwIfAborted(o.signal);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob) throw new ExportError("encode-failed", "Encoding returned no data");
  if (blob.type !== mime) {
    throw new ExportError("encode-unsupported", `This browser cannot encode ${mime}`);
  }
  return blob;
}

/**
 * Rasterises an SVG string. Throws `ExportError` (`decode-failed`,
 * `encode-failed`, `encode-unsupported`, `aborted`).
 */
export async function rasterizeSvg(
  svg: string,
  options: RasterizeOptions,
  env?: RasterEnv,
): Promise<Blob> {
  const e = env ?? (await defaultRasterEnv());
  const { format, signal } = options;
  const width = Math.max(1, Math.round(options.width));
  const height = Math.max(1, Math.round(options.height));
  const o: RasterizeOptions = { ...options, width, height };
  const mime = MIME_TYPES[format];
  const quality = resolveQuality(format, options.quality);
  const background = resolveBackground(format, options.background);

  throwIfAborted(signal);
  options.onProgress?.(0);
  const loaded = await e.loadSvgImage(resizeSvg(svg, width, height));
  try {
    throwIfAborted(signal);
    if ((options.mode ?? "auto") === "auto" && e.workerSupported()) {
      let bitmap: ImageBitmap | undefined;
      try {
        bitmap = await e.createImageBitmap(loaded.image);
      } catch {
        // Some engines cannot make bitmaps from SVG images; use the main thread.
      }
      if (bitmap) {
        const request: EncodeRequest = { id: nextRequestId++, bitmap, width, height, mime };
        if (quality !== undefined) request.quality = quality;
        if (background !== undefined) request.background = background;
        try {
          const blob = await encodeInWorker(e, request, signal);
          options.onProgress?.(1);
          return blob;
        } catch (error) {
          // Only infrastructure problems fall back; real results are final.
          if (!(error instanceof ExportError) || error.code !== "unavailable") throw error;
        }
      }
    }
    const blob = await encodeOnMain(e, loaded.image, o, mime, quality, background);
    options.onProgress?.(1);
    return blob;
  } finally {
    loaded.release();
  }
}

export interface RasterExportOptions extends Omit<RasterizeOptions, "width" | "height"> {
  /** Output size; default: the design size from `ctx`. Clamped to `maxEdge`. */
  size?: RasterSizeRequest;
  /** Largest edge in pixels (licence limit). Default `CANVAS_EDGE_MAX`. */
  maxEdge?: number;
}

export interface RasterExportResult {
  blob: Blob;
  width: number;
  height: number;
  /** The requested size exceeded `maxEdge` and was scaled down. */
  clamped: boolean;
  /** `motivo-<toolId>-<seed>.<ext>` */
  filename: string;
}

/**
 * Renders the design with the tool's own render function and rasterises it.
 * The design is rendered at `ctx` size and scaled as a vector to the output
 * size; to change the composition (aspect ratio), render with another size.
 */
export async function exportRaster<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  params: Params<S>,
  ctx: RenderContext,
  options: RasterExportOptions,
  env?: RasterEnv,
): Promise<RasterExportResult> {
  const anyTool: AnyToolDefinition = tool;
  if (!supportsExport(anyTool, options.format)) {
    throw new ExportError(
      "unsupported-format",
      `Tool "${tool.id}" cannot export ${options.format}`,
    );
  }
  const svg = renderDesignSvg(tool, params, ctx);
  const size = resolveRasterSize(ctx, options.size, options.maxEdge);
  const raster: RasterizeOptions = { ...options, width: size.width, height: size.height };
  const blob = await rasterizeSvg(svg, raster, env);
  return {
    blob,
    width: size.width,
    height: size.height,
    clamped: size.clamped,
    filename: exportFilename(tool.id, ctx.seed, FILE_EXTENSIONS[options.format]),
  };
}
