/**
 * GIF export (M4-AP04): N frames of a design, each rendered by the tool's
 * own `render` (one render path, see `planAnimationFrames`), drawn on a
 * decoded on the main thread (SVG can only be decoded there) and handed to
 * the GIF worker, which quantises and encodes them with `gifenc`
 * (`gif-encode.ts`). Preferred: `createImageBitmap` rasterises the SVG off
 * the main thread and the bitmap is transferred; the worker draws it on an
 * `OffscreenCanvas` and reads the pixels there (filters such as large blurs
 * would otherwise block the main thread for 50 to 130 ms per frame).
 * Fallback (no bitmap from SVG): draw in bands on a main-thread canvas and
 * transfer the pixels. At most one frame is in flight while the next one is
 * drawn; the main thread yields between frames and between bands, so no
 * task blocks it for long. There is no main-thread fallback on purpose:
 * `gifenc` is only reachable from the worker entry, so it never lands in a
 * page or server bundle (every supported browser has module workers).
 *
 * Browser APIs only go through `GifEnv`, so the flow is testable in Node.
 */
import {
  createRenderContext,
  planAnimationFrames,
  type AnimationSource,
  type AnyToolDefinition,
  type Params,
  type ParamsSchema,
  type RenderContext,
  type ToolDefinition,
} from "@musterli/tool-registry";
import { ExportError, throwIfAborted } from "./errors";
import { FILE_EXTENSIONS, exportFilename } from "./formats";
import type { GifMessage, GifReply } from "./gif-encode";
import { GIF_PIXEL_BUDGET, planGif, type GifPlan } from "./gif-plan";
import { browserRasterEnv, type MainCanvasLike, type RasterEnv } from "./raster";
import { splitIntoBands } from "./size";
import { resizeSvg } from "./svg-size";
import { renderDesignSvg, supportsAnimatedExport } from "./text";

/** Worker subset used for GIF encoding. */
export interface GifWorkerLike {
  onmessage: ((event: MessageEvent<GifReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: GifMessage, transfer: Transferable[]): void;
  terminate(): void;
}

/** Everything browser-specific the GIF flow needs. */
export interface GifEnv extends Pick<RasterEnv, "loadSvgImage" | "createCanvas" | "yieldToMain"> {
  /** Whether a GIF worker can be started. */
  workerSupported(): boolean;
  /**
   * Decodes an image into a bitmap off the main thread, for workers that can
   * draw it (`OffscreenCanvas`). Absent when unsupported; may reject (some
   * engines cannot make bitmaps from SVG images).
   */
  createImageBitmap?(image: CanvasImageSource): Promise<ImageBitmap>;
  createWorker(): GifWorkerLike;
}

export interface GifExportOptions {
  source: AnimationSource;
  /** 2 to 60 (`GIF_FRAMES_MIN`..`GIF_FRAMES_MAX`). */
  frames: number;
  /** Frame delay in ms. Default `GIF_DELAY_DEFAULT`. */
  delay?: number;
  /** Endless loop (default) or play once. */
  loop?: boolean;
  /** Longest edge in pixels, at most `GIF_MAX_EDGE`. */
  edge: number;
  signal?: AbortSignal;
  /** 0 to 1. */
  onProgress?: (fraction: number) => void;
}

export interface GifExportResult {
  blob: Blob;
  width: number;
  height: number;
  frames: number;
  /** `musterli-<toolId>-<seed>.gif` */
  filename: string;
}

/** Max pixels per draw call; small bands keep each main-thread task short. */
const GIF_BAND_PIXELS = 262_144;

let nextId = 1;

/** Receives frames in order and produces the GIF. */
interface GifSink {
  start(width: number, height: number, delay: number, loop: boolean): Promise<void>;
  /** Takes ownership of the pixels or the bitmap (transferred). */
  frame(frame: { data: Uint8ClampedArray } | { bitmap: ImageBitmap }): Promise<void>;
  end(): Promise<Blob>;
  close(): void;
}

/** Sends the protocol messages through `send`, which answers each with a reply. */
function protocolSink(
  send: (message: GifMessage, transfer: Transferable[]) => Promise<GifReply>,
  onClose: () => void,
): GifSink {
  const id = nextId++;
  let inFlight: Promise<void> = Promise.resolve();
  let closed = false;
  const expectAck = (reply: GifReply): void => {
    if (reply.kind === "gif-ack") return;
    if (!reply.ok) throw new ExportError(reply.code, reply.message);
    throw new ExportError("encode-failed", "Unexpected GIF reply");
  };
  return {
    async start(width, height, delay, loop) {
      expectAck(await send({ kind: "gif-start", id, width, height, delay, loop }, []));
    },
    async frame(frame) {
      const previous = inFlight;
      const sent =
        "bitmap" in frame
          ? send({ kind: "gif-frame", id, bitmap: frame.bitmap }, [frame.bitmap])
          : send({ kind: "gif-frame", id, data: frame.data }, [frame.data.buffer]);
      inFlight = sent.then(expectAck);
      // Reported by the next `frame` or `end`; never unhandled.
      inFlight.catch(() => undefined);
      await previous;
    },
    async end() {
      await inFlight;
      const reply = await send({ kind: "gif-end", id }, []);
      if (reply.kind === "gif-done" && reply.ok) return reply.blob;
      if (reply.kind === "gif-done") throw new ExportError(reply.code, reply.message);
      throw new ExportError("encode-failed", "Unexpected GIF reply");
    },
    close() {
      if (closed) return;
      closed = true;
      onClose();
    },
  };
}

/** GIF sink in a worker. Replies arrive in message order. */
function workerSink(env: GifEnv): GifSink {
  let worker: GifWorkerLike;
  try {
    worker = env.createWorker();
  } catch (cause) {
    throw new ExportError("unavailable", "Could not start the GIF worker", { cause });
  }
  const waiting: { resolve: (r: GifReply) => void; reject: (e: ExportError) => void }[] = [];
  let failure: ExportError | undefined;
  const fail = (error: ExportError): void => {
    failure ??= error;
    for (const w of waiting.splice(0)) w.reject(failure);
  };
  worker.onmessage = (event) => waiting.shift()?.resolve(event.data);
  worker.onerror = (event) => {
    fail(new ExportError("unavailable", `GIF worker failed: ${event.message}`));
  };
  return protocolSink(
    (message, transfer) => {
      if (failure) return Promise.reject(failure);
      const reply = new Promise<GifReply>((resolve, reject) => waiting.push({ resolve, reject }));
      worker.postMessage(message, transfer);
      return reply;
    },
    () => {
      worker.terminate();
      fail(new ExportError("aborted", "Export aborted"));
    },
  );
}

/** The real browser environment with the bundled GIF worker. */
export function browserGifEnv(createWorker?: () => GifWorkerLike): GifEnv {
  const raster = browserRasterEnv();
  return {
    loadSvgImage: raster.loadSvgImage,
    createCanvas: raster.createCanvas,
    yieldToMain: raster.yieldToMain,
    workerSupported: () => createWorker !== undefined && typeof Worker === "function",
    ...(typeof createImageBitmap === "function" && typeof OffscreenCanvas === "function"
      ? { createImageBitmap: (image: CanvasImageSource) => createImageBitmap(image) }
      : {}),
    createWorker() {
      if (!createWorker) throw new ExportError("unavailable", "No GIF worker configured");
      return createWorker();
    },
  };
}

let defaultEnv: Promise<GifEnv> | undefined;

/** Browser env with the bundled GIF worker. Created on first use. */
export function defaultGifEnv(): Promise<GifEnv> {
  defaultEnv ??= import("./gif-worker").then(({ createGifWorker }) =>
    browserGifEnv(() => createGifWorker() as GifWorkerLike),
  );
  return defaultEnv;
}

/** Draws one decoded frame in bands and reads its pixels back. */
async function drawFrame(
  env: GifEnv,
  canvas: MainCanvasLike,
  image: CanvasImageSource,
  width: number,
  height: number,
  signal: AbortSignal | undefined,
): Promise<Uint8ClampedArray> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new ExportError("encode-failed", `No 2D context for ${width}x${height}`);
  ctx.clearRect(0, 0, width, height);
  const bands = splitIntoBands(width, height, GIF_BAND_PIXELS);
  for (const [i, band] of bands.entries()) {
    throwIfAborted(signal);
    // The image's intrinsic size equals the output size (resizeSvg), so source = destination.
    ctx.drawImage(image, 0, band.y, width, band.height, 0, band.y, width, band.height);
    if (i < bands.length - 1) await env.yieldToMain();
  }
  return ctx.getImageData(0, 0, width, height).data;
}

/**
 * Renders the frames of an animation with the tool's own render function
 * and encodes them as a looping GIF. The design is rendered at `ctx` size
 * and scaled as a vector to the GIF size. Throws `ExportError`
 * (`unsupported-format`, `budget-exceeded`, `decode-failed`,
 * `encode-failed`, `unavailable`, `aborted`).
 */
export async function exportGif<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  params: Params<S>,
  ctx: RenderContext,
  options: GifExportOptions,
  env?: GifEnv,
): Promise<GifExportResult> {
  const anyTool: AnyToolDefinition = tool;
  if (!supportsAnimatedExport(anyTool) || !anyTool.animation?.sources.includes(options.source)) {
    throw new ExportError("unsupported-format", `Tool "${tool.id}" cannot export this GIF`);
  }
  const design = { width: ctx.width, height: ctx.height };
  const plan: GifPlan = planGif(
    design,
    options.delay === undefined
      ? { edge: options.edge, frames: options.frames }
      : { edge: options.edge, frames: options.frames, delay: options.delay },
  );
  if (plan.overBudget) {
    throw new ExportError(
      "budget-exceeded",
      `${plan.frames} frames of ${plan.width}x${plan.height} exceed ${GIF_PIXEL_BUDGET} pixels`,
    );
  }
  const { signal } = options;
  throwIfAborted(signal);
  options.onProgress?.(0);
  const e = env ?? (await defaultGifEnv());
  const frames = planAnimationFrames(anyTool, params, ctx.seed, options.source, plan.frames);

  if (!e.workerSupported()) {
    throw new ExportError("unavailable", "This browser cannot run the GIF worker");
  }
  const sink = workerSink(e);
  const onAbort = (): void => sink.close();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await sink.start(plan.width, plan.height, plan.delay, options.loop ?? true);
    let useBitmaps = e.createImageBitmap !== undefined;
    let canvas: MainCanvasLike | undefined;
    for (const [i, frame] of frames.entries()) {
      throwIfAborted(signal);
      const svg = renderDesignSvg(
        tool,
        frame.params,
        createRenderContext(frame.seed, design, frame.t),
      );
      const loaded = await e.loadSvgImage(resizeSvg(svg, plan.width, plan.height));
      let frameData: { data: Uint8ClampedArray } | { bitmap: ImageBitmap };
      try {
        throwIfAborted(signal);
        let bitmap: ImageBitmap | undefined;
        if (useBitmaps && e.createImageBitmap) {
          try {
            bitmap = await e.createImageBitmap(loaded.image);
          } catch {
            // No bitmaps from SVG in this engine: draw on the main thread from now on.
            useBitmaps = false;
          }
        }
        frameData = bitmap
          ? { bitmap }
          : {
              data: await drawFrame(
                e,
                (canvas ??= e.createCanvas(plan.width, plan.height)),
                loaded.image,
                plan.width,
                plan.height,
                signal,
              ),
            };
      } finally {
        loaded.release();
      }
      await sink.frame(frameData);
      options.onProgress?.(((i + 1) / frames.length) * 0.95);
      await e.yieldToMain();
    }
    throwIfAborted(signal);
    const blob = await sink.end();
    options.onProgress?.(1);
    return {
      blob,
      width: plan.width,
      height: plan.height,
      frames: plan.frames,
      filename: exportFilename(tool.id, ctx.seed, FILE_EXTENSIONS.gif),
    };
  } catch (error) {
    throwIfAborted(signal);
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    sink.close();
  }
}
