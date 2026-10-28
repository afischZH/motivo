/**
 * Raster export (PNG, JPG, WebP): SVG -> image -> canvas -> Blob.
 *
 * Preferred path: the browser decodes the SVG into an `ImageBitmap`, which is
 * transferred to a worker that draws and encodes it on an `OffscreenCanvas`
 * (encoding a 4K/8K PNG is the expensive part). Fallback: draw on a main
 * thread canvas in horizontal bands, yielding between bands, then encode
 * with `toBlob` (asynchronous in current browsers).
 *
 * Outputs larger than the canvas area limit (`SAFE_CANVAS_AREA` by default;
 * WebKit draws nothing on larger canvases and bitmaps) never use one canvas
 * of the full size for PNG: the image is drawn in strips that fit the limit
 * and their rows are streamed to the worker, which filters and deflates them
 * into one PNG (`PngStreamEncoder`). JPG and WebP have no streaming encoder
 * here: they keep the full canvas, but a few probe pixels of the result are
 * compared with the same pixels drawn on a 1 x 1 canvas, and a canvas that
 * stayed blank fails with `too-large` instead of producing a broken file.
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
} from "@musterli/tool-registry";
import { ExportError, throwIfAborted } from "./errors";
import { compressionStreamSupported, PngStreamEncoder } from "./png-stream";
import {
  isStripAck,
  readProbe,
  type EncodeRequest,
  type EncodeResponse,
  type StripMessage,
  type StripReply,
  type ZipMessage,
} from "./raster-encode";
import {
  MIME_TYPES,
  exportFilename,
  resolveBackground,
  resolveQuality,
  type RasterFormat,
  FILE_EXTENSIONS,
} from "./formats";
import {
  DEFAULT_BAND_PIXELS,
  resolveRasterSize,
  splitIntoBands,
  type RasterSizeRequest,
} from "./size";
import { resizeSvg } from "./svg-size";
import { exportTile, renderDesignSvg, supportsExport } from "./text";

/**
 * Largest canvas area in pixels that every supported browser draws: 4096 x
 * 4096 (WebKit's limit for canvases and image buffers on iOS; desktop WebKit
 * produced blank 8K exports too). Chromium and Firefox allow more, but one
 * limit keeps the export path the same in every browser.
 */
export const SAFE_CANVAS_AREA = 4096 * 4096;

/**
 * Test hook: a positive number under this global lowers the canvas area
 * limit of `browserRasterEnv` (never raises it), so end-to-end tests can
 * exercise the strip path at small sizes.
 */
export const MAX_CANVAS_AREA_OVERRIDE = "__musterliMaxCanvasArea";

/** A decoded image; `release` frees its resources (object URL). */
export interface LoadedImage {
  image: CanvasImageSource;
  release(): void;
}

/** Main-thread 2D context subset used here. */
export interface MainContextLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
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
  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray };
}

/** Main-thread canvas subset used by the fallback and the strip path. */
export interface MainCanvasLike {
  getContext(type: "2d", options?: { willReadFrequently?: boolean }): MainContextLike | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

/** Worker subset used here. */
export interface WorkerLike {
  onmessage: ((event: MessageEvent<EncodeResponse | StripReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: EncodeRequest | StripMessage | ZipMessage, transfer: Transferable[]): void;
  terminate(): void;
}

/** Everything browser-specific the raster flow needs. */
export interface RasterEnv {
  /** Loads an SVG string as a decoded image. Throws on decode failure. */
  loadSvgImage(svg: string): Promise<LoadedImage>;
  /** Whether the worker path can work (Worker, OffscreenCanvas with convertToBlob, createImageBitmap). */
  workerSupported(): boolean;
  /** Whether PNG can be streamed in strips (`CompressionStream` with deflate). */
  stripsSupported(): boolean;
  /** Largest canvas area (pixels) to draw on in one piece. */
  maxCanvasArea(): number;
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

/** `SAFE_CANVAS_AREA`, lowered by the `MAX_CANVAS_AREA_OVERRIDE` global when set. */
export function effectiveMaxCanvasArea(scope: object = globalThis): number {
  const override = (scope as Record<string, unknown>)[MAX_CANVAS_AREA_OVERRIDE];
  return typeof override === "number" && Number.isFinite(override) && override >= 1
    ? Math.min(SAFE_CANVAS_AREA, Math.floor(override))
    : SAFE_CANVAS_AREA;
}

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
    stripsSupported: compressionStreamSupported,
    maxCanvasArea: () => effectiveMaxCanvasArea(),
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
): Promise<{ blob: Blob; samples?: number[] }> {
  return new Promise((resolve, reject) => {
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
      if (isStripAck(reply)) {
        reject(new ExportError("unavailable", "Unexpected strip reply"));
      } else if (reply.ok) {
        resolve(
          reply.samples ? { blob: reply.blob, samples: reply.samples } : { blob: reply.blob },
        );
      } else {
        reject(new ExportError(reply.code, reply.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new ExportError("unavailable", `Raster worker failed: ${event.message}`));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage(request, [request.bitmap]);
  });
}

function context2d(
  env: RasterEnv,
  width: number,
  height: number,
  willReadFrequently = false,
): { canvas: MainCanvasLike; ctx: MainContextLike } {
  let canvas: MainCanvasLike;
  let ctx: MainContextLike | null;
  try {
    canvas = env.createCanvas(width, height);
    ctx = willReadFrequently
      ? canvas.getContext("2d", { willReadFrequently: true })
      : canvas.getContext("2d");
  } catch (cause) {
    throw new ExportError("encode-failed", "Could not create the canvas", { cause });
  }
  if (!ctx) throw new ExportError("encode-failed", `No 2D context for ${width}x${height}`);
  return { canvas, ctx };
}

async function encodeOnMain(
  env: RasterEnv,
  image: CanvasImageSource,
  o: RasterizeOptions,
  mime: string,
  quality: number | undefined,
  background: string | undefined,
  probe: readonly (readonly [number, number])[] | undefined,
): Promise<{ blob: Blob; samples?: number[] }> {
  const { width, height } = o;
  const { canvas, ctx } = context2d(env, width, height);
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
  let samples: number[] | undefined;
  if (probe) {
    try {
      samples = readProbe(ctx, probe);
    } catch (cause) {
      throw new ExportError("too-large", "Could not read the canvas back", { cause });
    }
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob) throw new ExportError("encode-failed", "Encoding returned no data");
  if (blob.type !== mime) {
    throw new ExportError("encode-unsupported", `This browser cannot encode ${mime}`);
  }
  return samples ? { blob, samples } : { blob };
}

/** Receives the RGBA rows of a strip export, top to bottom, and produces the PNG. */
interface StripSink {
  /** Takes ownership of `data` (it may be transferred). */
  rows(data: Uint8ClampedArray, rows: number): Promise<void>;
  end(): Promise<Blob>;
  close(): void;
}

/** Strip sink on the main thread (no worker available). */
function mainStripSink(width: number, height: number): StripSink {
  const encoder = new PngStreamEncoder(width, height);
  return {
    rows: (data, rows) => encoder.addRows(data, rows),
    async end() {
      return new Blob(await encoder.finish(), { type: MIME_TYPES.png });
    },
    close() {},
  };
}

/**
 * Strip sink in the raster worker. At most one strip is in flight while the
 * next one is drawn, so memory stays at about two strips.
 */
function workerStripSink(env: RasterEnv, width: number, height: number): StripSink {
  let worker: WorkerLike;
  try {
    worker = env.createWorker();
  } catch (cause) {
    throw new ExportError("unavailable", "Could not start the raster worker", { cause });
  }
  const id = nextRequestId++;
  const waiting: { resolve: () => void; reject: (error: ExportError) => void }[] = [];
  let ending: { resolve: (blob: Blob) => void; reject: (error: ExportError) => void } | undefined;
  let failure: ExportError | undefined;
  let closed = false;

  const fail = (error: ExportError): void => {
    failure ??= error;
    for (const w of waiting.splice(0)) w.reject(failure);
    ending?.reject(failure);
    ending = undefined;
  };
  worker.onmessage = (event) => {
    const reply = event.data;
    if (isStripAck(reply)) waiting.shift()?.resolve();
    else if (reply.ok) ending?.resolve(reply.blob);
    else fail(new ExportError(reply.code, reply.message));
  };
  worker.onerror = (event) => {
    fail(new ExportError("unavailable", `Raster worker failed: ${event.message}`));
  };
  const post = (message: StripMessage, transfer: Transferable[] = []): Promise<void> => {
    if (failure) return Promise.reject(failure);
    const acked = new Promise<void>((resolve, reject) => waiting.push({ resolve, reject }));
    worker.postMessage(message, transfer);
    return acked;
  };

  let inFlight = post({ kind: "strip-start", id, width, height });
  inFlight.catch(() => undefined);
  return {
    async rows(data, rows) {
      const previous = inFlight;
      inFlight = post({ kind: "strip-rows", id, rows, data }, [data.buffer]);
      // Keep a later rejection of this strip from going unhandled; `rows`/`end` report it.
      inFlight.catch(() => undefined);
      await previous;
    },
    async end() {
      await inFlight;
      if (failure) throw failure;
      const blob = new Promise<Blob>((resolve, reject) => {
        ending = { resolve, reject };
      });
      worker.postMessage({ kind: "strip-end", id }, []);
      return blob;
    },
    close() {
      if (closed) return;
      closed = true;
      worker.terminate();
      fail(new ExportError("aborted", "Export aborted"));
    },
  };
}

/** Strip size when the PNG is encoded on the main thread (about 30 ms of filtering and deflate). */
const MAIN_STRIP_PIXELS = 500_000;

/**
 * PNG in horizontal strips of at most `maxArea` pixels (and at most
 * `bandPixels` per draw call): each strip is drawn on a small canvas, read
 * back and streamed into the PNG encoder. No canvas or bitmap ever has the
 * full output size.
 */
async function encodeStrips(
  env: RasterEnv,
  image: CanvasImageSource,
  o: RasterizeOptions,
  maxArea: number,
  background: string | undefined,
  useWorker: boolean,
): Promise<Blob> {
  const { width, height, signal } = o;
  // Without a worker the encoder runs between draws too: smaller strips keep each task short.
  const perStrip = Math.min(
    maxArea,
    o.bandPixels ?? (useWorker ? DEFAULT_BAND_PIXELS : MAIN_STRIP_PIXELS),
  );
  const bands = splitIntoBands(width, height, perStrip);
  const stripHeight = bands[0]?.height ?? height;
  const { ctx } = context2d(env, width, stripHeight, true);
  const sink = useWorker ? workerStripSink(env, width, height) : mainStripSink(width, height);
  const onAbort = (): void => sink.close();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for (const [i, band] of bands.entries()) {
      throwIfAborted(signal);
      ctx.clearRect(0, 0, width, stripHeight);
      if (background !== undefined) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, band.height);
      }
      // The image's intrinsic size equals the output size: draw rows [y, y + h) at the top.
      ctx.drawImage(image, 0, band.y, width, band.height, 0, 0, width, band.height);
      const { data } = ctx.getImageData(0, 0, width, band.height);
      await sink.rows(data, band.height);
      o.onProgress?.(((i + 1) / bands.length) * 0.95);
      if (i < bands.length - 1) await env.yieldToMain();
    }
    throwIfAborted(signal);
    return await sink.end();
  } catch (error) {
    throwIfAborted(signal);
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    sink.close();
  }
}

/**
 * Pixels compared after drawing on a canvas larger than the area limit: a
 * 3 x 3 grid at 1/6, 1/2 and 5/6 of each edge.
 */
export function probePoints(width: number, height: number): [number, number][] {
  const at = (f: number, n: number): number => Math.min(n - 1, Math.max(0, Math.floor(f * n)));
  const out: [number, number][] = [];
  for (const fy of [1 / 6, 1 / 2, 5 / 6]) {
    for (const fx of [1 / 6, 1 / 2, 5 / 6]) out.push([at(fx, width), at(fy, height)]);
  }
  return out;
}

/** A probe pixel differs when one channel differs by more than this (anti-aliasing stays well below). */
const PROBE_TOLERANCE = 64;

/**
 * Whether the samples of a large canvas agree with the reference samples:
 * fewer than a third of the points may differ (a canvas that stayed blank
 * or transparent differs nearly everywhere).
 */
export function probeMatches(actual: readonly number[], expected: readonly number[]): boolean {
  const points = Math.floor(Math.min(actual.length, expected.length) / 4);
  let differing = 0;
  for (let p = 0; p < points; p++) {
    for (let c = 0; c < 4; c++) {
      if (Math.abs((actual[p * 4 + c] ?? 0) - (expected[p * 4 + c] ?? 0)) > PROBE_TOLERANCE) {
        differing++;
        break;
      }
    }
  }
  return differing * 3 < points;
}

/** The probe pixels drawn one by one on a 1 x 1 canvas (the reference). */
function referenceSamples(
  env: RasterEnv,
  image: CanvasImageSource,
  probe: readonly (readonly [number, number])[],
  background: string | undefined,
): number[] {
  const { ctx } = context2d(env, 1, 1, true);
  const out: number[] = [];
  for (const [x, y] of probe) {
    ctx.clearRect(0, 0, 1, 1);
    if (background !== undefined) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 1, 1);
    }
    ctx.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out.push(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0);
  }
  return out;
}

/**
 * Rasterises an SVG string. Throws `ExportError` (`decode-failed`,
 * `encode-failed`, `encode-unsupported`, `too-large`, `aborted`).
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
  const auto = (options.mode ?? "auto") === "auto";
  const maxArea = Math.max(1, e.maxCanvasArea());
  const large = width * height > maxArea;

  throwIfAborted(signal);
  options.onProgress?.(0);
  const loaded = await e.loadSvgImage(resizeSvg(svg, width, height));
  try {
    throwIfAborted(signal);
    if (large && format === "png" && e.stripsSupported()) {
      const useWorker = auto && e.workerSupported();
      let blob: Blob;
      try {
        blob = await encodeStrips(e, loaded.image, o, maxArea, background, useWorker);
      } catch (error) {
        // Only infrastructure problems fall back; real results are final.
        if (!useWorker || !(error instanceof ExportError) || error.code !== "unavailable") {
          throw error;
        }
        blob = await encodeStrips(e, loaded.image, o, maxArea, background, false);
      }
      options.onProgress?.(1);
      return blob;
    }

    const probe = large ? probePoints(width, height) : undefined;
    let reference: number[] | undefined;
    const drewEverything = (samples: number[] | undefined): boolean => {
      if (!probe) return true;
      if (!samples) return false;
      reference ??= referenceSamples(e, loaded.image, probe, background);
      return probeMatches(samples, reference);
    };

    if (auto && e.workerSupported()) {
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
        if (probe) request.probe = probe;
        try {
          const result = await encodeInWorker(e, request, signal);
          if (drewEverything(result.samples)) {
            options.onProgress?.(1);
            return result.blob;
          }
          // The worker's bitmap or canvas stayed blank; the main thread may still manage.
        } catch (error) {
          // Only infrastructure problems fall back; real results are final.
          const retry =
            error instanceof ExportError &&
            (error.code === "unavailable" || (probe !== undefined && error.code === "too-large"));
          if (!retry) throw error;
        }
      }
    }
    const result = await encodeOnMain(e, loaded.image, o, mime, quality, background, probe);
    if (!drewEverything(result.samples)) {
      throw new ExportError(
        "too-large",
        `This browser cannot draw ${width}x${height} pixels for ${format.toUpperCase()}`,
      );
    }
    options.onProgress?.(1);
    return result.blob;
  } finally {
    loaded.release();
  }
}

export interface RasterExportOptions extends Omit<RasterizeOptions, "width" | "height"> {
  /** Output size; default: the design size from `ctx`. Clamped to `maxEdge`. */
  size?: RasterSizeRequest;
  /** Largest edge in pixels (technical limit). Default `CANVAS_EDGE_MAX`. */
  maxEdge?: number;
}

export interface RasterExportResult {
  blob: Blob;
  width: number;
  height: number;
  /** The requested size exceeded `maxEdge` and was scaled down. */
  clamped: boolean;
  /** `musterli-<toolId>-<seed>.<ext>` */
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

/**
 * Rasterises the repeat tile of a seamless design (PNG tile export). The
 * tile is drawn at its own size times `options.size.scale` (default 1);
 * width/height requests are ignored, a tile has a fixed aspect ratio.
 */
export async function exportRasterTile<S extends ParamsSchema>(
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
  const tile = exportTile(tool, params, ctx);
  const scale = options.size?.scale;
  const size = resolveRasterSize(
    { width: tile.width, height: tile.height },
    scale === undefined ? {} : { scale },
    options.maxEdge,
  );
  const raster: RasterizeOptions = { ...options, width: size.width, height: size.height };
  const blob = await rasterizeSvg(tile.svg, raster, env);
  return {
    blob,
    width: size.width,
    height: size.height,
    clamped: size.clamped,
    filename: exportFilename(tool.id, ctx.seed, FILE_EXTENSIONS[options.format], "tile"),
  };
}
