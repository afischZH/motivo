/**
 * Messages between the editor and the shader worker, plus the worker's
 * request handler with its browser APIs injected, so it is unit-testable
 * in Node with a fake runtime (docs/ARCHITECTURE.md 4.15).
 *
 * Preview frames are drawn in one pass and handed back as an
 * `ImageBitmap`. Exports are drawn in tiles of `SHADER_TILE_EDGE` px (tile
 * origin as a uniform, so the picture is the same as in one pass) and
 * assembled in strips: PNG goes through the streaming encoder of
 * `@musterli/exporters`, so an 8K PNG never needs one large canvas; JPG and
 * WebP are composed on a 2D canvas and encoded there (no streaming encoder).
 */
import { PngStreamEncoder } from "@musterli/exporters/png-stream";
import { renderInStrips, type ShaderFrame } from "@musterli/shaders";
import { ShaderContextLostError } from "@musterli/shaders/runtime";
import {
  CANVAS_EDGE_MAX,
  isWebglTool,
  webglFrame,
  type AnyToolDefinition,
  type CanvasSize,
} from "@musterli/tool-registry";

/** Plain parameter object (type-erased). */
type Values = Readonly<Record<string, unknown>>;

export interface ShaderEncodeOptions {
  mime: "image/png" | "image/jpeg" | "image/webp";
  quality?: number;
}

export interface ShaderRenderRequest {
  id: number;
  toolId: string;
  params: Values;
  seed: number;
  /** Design size (the render context). */
  design: CanvasSize;
  /** Output pixels. */
  out: CanvasSize;
  /** Loop time 0..1 (GIF frames, animated preview); absent: the still. */
  t?: number;
  /** Absent: an `ImageBitmap` (preview, GIF frame). */
  encode?: ShaderEncodeOptions;
}

export type ShaderWorkerError =
  | "unknown-tool"
  /** No WebGL2 (or no `OffscreenCanvas`) in this worker. */
  | "unsupported"
  /** The request is malformed (sizes out of range, params the schema refuses). */
  | "invalid-request"
  /** Over the pixel budget of the requested format. */
  | "too-large"
  /** The GPU context was lost twice in a row. */
  | "context-lost"
  | "render-failed";

export type ShaderRenderResponse =
  | { id: number; ok: true; bitmap: ImageBitmap }
  | { id: number; ok: true; blob: Blob }
  | { id: number; ok: false; error: ShaderWorkerError }
  /** Export progress, 0..1; the final reply follows. */
  | { id: number; progress: number };

/** The part of `ShaderRuntime` the handler uses (a fake in tests). */
export interface ShaderRuntimeLike {
  draw(frame: ShaderFrame): void;
  readPixels(): Uint8Array;
  isLost(): boolean;
  dispose(): void;
}

/** A 2D canvas the strips of a JPG or WebP export are composed on. */
export interface ShaderComposer {
  putStrip(strip: Uint8ClampedArray, y: number, height: number): void;
  encode(options: ShaderEncodeOptions): Promise<Blob>;
  /** Frees the canvas at once (up to 200 MB) instead of waiting for GC. */
  dispose?(): void;
}

/** The browser APIs the handler uses. */
export interface ShaderWorkerEnv {
  /** A fresh runtime on a new canvas; `null` without WebGL2. */
  createRuntime(): ShaderRuntimeLike | null;
  /** What the runtime's last `draw` left in its canvas, as a bitmap (preview). */
  snapshot(runtime: ShaderRuntimeLike): Promise<ImageBitmap>;
  createComposer(width: number, height: number): ShaderComposer;
  lookup(toolId: string): AnyToolDefinition | undefined;
  /** Export progress of request `id`. */
  progress?(id: number, fraction: number): void;
}

/**
 * Largest preview or GIF frame edge: one pass, no tiles. 2048 is below the
 * smallest render size a WebGL2 device must support (`MAX_RENDERBUFFER_SIZE`).
 */
export const SHADER_FRAME_MAX_EDGE = 2048;

/**
 * Largest JPG or WebP export in pixels (as image effects): the composed
 * canvas holds all of it at once. PNG streams and may use the full
 * `CANVAS_EDGE_MAX` square.
 */
export const SHADER_COMPOSED_MAX_PIXELS = 50_331_648;

const isEdge = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max;

function isSize(value: unknown, max: number): value is CanvasSize {
  if (typeof value !== "object" || value === null) return false;
  const { width, height } = value as Record<string, unknown>;
  return isEdge(width, max) && isEdge(height, max);
}

const ENCODE_MIMES: ReadonlySet<unknown> = new Set(["image/png", "image/jpeg", "image/webp"]);

/** A known format and, if given, a quality in 0..1. */
function isEncodeOptions(value: unknown): value is ShaderEncodeOptions {
  if (typeof value !== "object" || value === null) return false;
  const { mime, quality } = value as Record<string, unknown>;
  return (
    ENCODE_MIMES.has(mime) &&
    (quality === undefined ||
      (typeof quality === "number" && Number.isFinite(quality) && quality >= 0 && quality <= 1))
  );
}

/**
 * Whether a request is well-formed for `tool`: a WebGL tool, sizes in range
 * (bitmaps at most `SHADER_FRAME_MAX_EDGE`), `t` in 0..1, a known output
 * format and params the tool's schema accepts. Requests only come from the
 * editor; this is defence in depth.
 */
export function isValidShaderRequest(
  tool: AnyToolDefinition,
  request: ShaderRenderRequest,
): boolean {
  const outMax = request.encode ? CANVAS_EDGE_MAX : SHADER_FRAME_MAX_EDGE;
  return (
    isWebglTool(tool) &&
    (request.encode === undefined || isEncodeOptions(request.encode)) &&
    isSize(request.design, CANVAS_EDGE_MAX) &&
    isSize(request.out, outMax) &&
    Number.isFinite(request.seed) &&
    (request.t === undefined ||
      (typeof request.t === "number" && request.t >= 0 && request.t <= 1)) &&
    tool.schema.safeParse(request.params).success
  );
}

/** Whether `options` stays within the budget of its format at `out`. */
export function withinShaderBudget(out: CanvasSize, options: ShaderEncodeOptions): boolean {
  return options.mime === "image/png" || out.width * out.height <= SHADER_COMPOSED_MAX_PIXELS;
}

/** Concatenates the PNG parts into one `Blob`. */
async function encodePng(
  frame: Omit<ShaderFrame, "tile">,
  draw: (tile: NonNullable<ShaderFrame["tile"]>) => Uint8Array,
  onRow: (fraction: number) => void,
): Promise<Blob> {
  const { width, height } = frame.out;
  const encoder = new PngStreamEncoder(width, height);
  await renderInStrips(width, height, draw, async (strip, row, index, rows) => {
    await encoder.addRows(strip, row.height);
    onRow((index + 1) / rows);
  });
  return new Blob(await encoder.finish(), { type: "image/png" });
}

/** Handles requests one at a time (one GPU context, flat memory). */
export function createShaderHandler(env: ShaderWorkerEnv) {
  let runtime: ShaderRuntimeLike | null | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const getRuntime = (): ShaderRuntimeLike | null => {
    if (runtime === undefined || runtime?.isLost()) {
      runtime?.dispose();
      runtime = env.createRuntime();
    }
    return runtime;
  };

  const dropRuntime = () => {
    runtime?.dispose();
    runtime = undefined;
  };

  const render = async (
    request: ShaderRenderRequest,
    tool: AnyToolDefinition,
    gl: ShaderRuntimeLike,
  ): Promise<ShaderRenderResponse> => {
    const { id } = request;
    const base = webglFrame(tool, request.params, request.seed, request.design, request.t);
    const frame: Omit<ShaderFrame, "tile"> = {
      ...base,
      out: request.out,
      design: request.design,
    };
    const encode = request.encode;
    if (!encode) {
      gl.draw(frame);
      if (gl.isLost()) throw new ShaderContextLostError();
      return { id, ok: true, bitmap: await env.snapshot(gl) };
    }
    const drawTile = (tile: NonNullable<ShaderFrame["tile"]>): Uint8Array => {
      gl.draw({ ...frame, tile });
      const pixels = gl.readPixels();
      if (gl.isLost()) throw new ShaderContextLostError();
      return pixels;
    };
    const progress = (fraction: number) => env.progress?.(id, fraction);
    if (encode.mime === "image/png") {
      return { id, ok: true, blob: await encodePng(frame, drawTile, progress) };
    }
    const { width, height } = request.out;
    const composer = env.createComposer(width, height);
    try {
      await renderInStrips(width, height, drawTile, (strip, row, index, rows) => {
        composer.putStrip(strip, row.y, row.height);
        progress(((index + 1) / rows) * 0.9);
      });
      return { id, ok: true, blob: await composer.encode(encode) };
    } finally {
      composer.dispose?.();
    }
  };

  const run = async (request: ShaderRenderRequest): Promise<ShaderRenderResponse> => {
    const { id } = request;
    const tool = env.lookup(request.toolId);
    if (!tool) return { id, ok: false, error: "unknown-tool" };
    if (!isValidShaderRequest(tool, request)) return { id, ok: false, error: "invalid-request" };
    if (request.encode && !withinShaderBudget(request.out, request.encode)) {
      return { id, ok: false, error: "too-large" };
    }
    // A lost context (GPU reset, driver update, too many contexts) gets one
    // retry on a fresh runtime; the browser may refuse a new one for a while.
    for (let attempt = 0; attempt < 2; attempt++) {
      const gl = getRuntime();
      if (!gl) return { id, ok: false, error: "unsupported" };
      try {
        return await render(request, tool, gl);
      } catch (error) {
        if (!(error instanceof ShaderContextLostError) && !gl.isLost()) {
          return { id, ok: false, error: "render-failed" };
        }
        dropRuntime();
      }
    }
    return { id, ok: false, error: "context-lost" };
  };

  return (request: ShaderRenderRequest): Promise<ShaderRenderResponse> => {
    const next = queue.then(() => run(request));
    queue = next.catch(() => undefined);
    return next.catch((): ShaderRenderResponse => ({
      id: request.id,
      ok: false,
      error: "render-failed",
    }));
  };
}
