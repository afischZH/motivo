/**
 * Thumbnails of saved designs: the design through the tool's own render
 * path, at most 400 px. SVG tools: the same SVG as preview and export,
 * rasterised and encoded in the raster worker. WebGL tools (shader
 * gradient): drawn by the shader worker. Image effects (halftone, dither,
 * duotone, ASCII art, ...): drawn by the raster-effect worker, with the
 * tool's demo picture when the design has no photo, as in the preview.
 * Nothing of it runs on the main thread. WebP where the browser can encode
 * it, PNG otherwise (Safari cannot encode WebP).
 */
import {
  ExportError,
  rasterizeSvg,
  renderDesignSvg,
  type RasterEnv,
  type RasterExportOptions,
  type RasterExportResult,
} from "@musterli/exporters";
import {
  createRenderContext,
  isImageEffectTool,
  isWebglTool,
  type AnyToolDefinition,
  type CanvasSize,
  type Params,
  type ParamsSchema,
  type RenderContext,
} from "@musterli/tool-registry";
import type { RasterEffectClient } from "../raster-effect/client";
import type { ShaderClient } from "../shader/client";

/** Longest edge of a stored thumbnail in pixels. */
export const DESIGN_THUMBNAIL_EDGE = 400;
const WEBP_QUALITY = 0.8;

/** The design size scaled down so the longest edge is at most `maxEdge`. */
function fitSize(size: CanvasSize, maxEdge: number): CanvasSize {
  const k = Math.min(1, maxEdge / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * k)),
    height: Math.max(1, Math.round(size.height * k)),
  };
}

export interface DesignThumbnailOptions {
  /** The design's SVG when already rendered (the editor preview), to skip a render. */
  svg?: string;
  signal?: AbortSignal;
  /** Raster environment; replaceable in tests. */
  env?: RasterEnv;
  /** Worker clients of WebGL tools and image effects; replaceable in tests. */
  shaderClient?: ShaderClient;
  effectClient?: RasterEffectClient;
}

type WorkerExport = (
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
  ctx: RenderContext,
  options: RasterExportOptions,
) => Promise<RasterExportResult>;

/**
 * The export of WebGL tools and image effects (the same worker render as
 * their preview and export), loaded on first use; `null` for SVG tools.
 */
async function workerExportOf(
  tool: AnyToolDefinition,
  options: DesignThumbnailOptions,
): Promise<WorkerExport | null> {
  if (isImageEffectTool(tool)) {
    const { exportImageEffect } = await import("../raster-effect/export");
    return (t, p, ctx, o) => exportImageEffect(t, p, ctx, o, options.effectClient);
  }
  if (isWebglTool(tool)) {
    const { exportShader } = await import("../shader/export");
    return (t, p, ctx, o) => exportShader(t, p, ctx, o, options.shaderClient);
  }
  return null;
}

/** WebP, else PNG, from a worker export. `null` when the worker cannot draw it. */
async function workerThumbnail(
  run: WorkerExport,
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
  seed: number,
  size: CanvasSize,
  signal: AbortSignal | undefined,
): Promise<Blob | null> {
  const ctx = createRenderContext(seed, size);
  const out = fitSize(size, DESIGN_THUMBNAIL_EDGE);
  const base = {
    size: { width: out.width, height: out.height },
    ...(signal ? { signal } : {}),
  };
  try {
    return (await run(tool, params, ctx, { ...base, format: "webp", quality: WEBP_QUALITY })).blob;
  } catch (error) {
    // Without workers (or without WebGL2) PNG fails the same way.
    if (
      error instanceof ExportError &&
      (error.code === "unavailable" || error.code === "aborted")
    ) {
      return null;
    }
  }
  try {
    return (await run(tool, params, ctx, { ...base, format: "png" })).blob;
  } catch {
    return null;
  }
}

/**
 * Renders a thumbnail. Resolves to `null` when the tool has no picture
 * output or the browser cannot draw it; a design is saved without one then.
 */
export async function createDesignThumbnail(
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
  seed: number,
  size: CanvasSize,
  options: DesignThumbnailOptions = {},
): Promise<Blob | null> {
  const run = await workerExportOf(tool, options).catch(() => null);
  if (run) return workerThumbnail(run, tool, params, seed, size, options.signal);
  let svg = options.svg;
  try {
    svg ??= renderDesignSvg(tool, params as Params<ParamsSchema>, createRenderContext(seed, size));
  } catch {
    return null;
  }
  const out = fitSize(size, DESIGN_THUMBNAIL_EDGE);
  const base = {
    width: out.width,
    height: out.height,
    ...(options.signal ? { signal: options.signal } : {}),
  };
  try {
    return await rasterizeSvg(svg, { ...base, format: "webp", quality: WEBP_QUALITY }, options.env);
  } catch (error) {
    if (!(error instanceof ExportError) || error.code !== "encode-unsupported") return null;
  }
  try {
    return await rasterizeSvg(svg, { ...base, format: "png" }, options.env);
  } catch {
    return null;
  }
}
