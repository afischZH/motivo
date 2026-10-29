/**
 * A design as a picture through the tool's own render path, at any output
 * size: SVG tools render their SVG and rasterise it (decoded on the main
 * thread, encoded in the raster worker), WebGL tools draw in the shader
 * worker, image effects in the raster-effect worker (with the demo picture
 * when the design has no photo). Exactly what the export dialog produces,
 * for app pages that show designs as pictures, such as the backgrounds of
 * the social editor. The worker exports are loaded on first use.
 */
import { exportRaster, type RasterEnv, type RasterFormat } from "@musterli/exporters";
import {
  createRenderContext,
  isImageEffectTool,
  isWebglTool,
  type AnyToolDefinition,
  type CanvasSize,
  type Params,
  type ParamsSchema,
} from "@musterli/tool-registry";
import type { RasterEffectClient } from "../raster-effect/client";
import type { ShaderClient } from "../shader/client";

export interface RenderDesignImageOptions {
  /** Output size in pixels; default the design size. The design keeps its own composition. */
  out?: CanvasSize;
  /** Default PNG. */
  format?: RasterFormat;
  quality?: number;
  signal?: AbortSignal;
  env?: RasterEnv;
  shaderClient?: ShaderClient;
  effectClient?: RasterEffectClient;
}

/**
 * Renders the design (`params`, `seed`, design `size`) as a picture. Throws
 * an `ExportError` like the export dialog (`unsupported-format`,
 * `unavailable`, `aborted`, `too-large`, ...).
 */
export async function renderDesignImage(
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
  seed: number,
  size: CanvasSize,
  options: RenderDesignImageOptions = {},
): Promise<Blob> {
  const ctx = createRenderContext(seed, size);
  const out = options.out ?? size;
  const base = {
    format: options.format ?? "png",
    size: { width: Math.round(out.width), height: Math.round(out.height) },
    ...(options.quality === undefined ? {} : { quality: options.quality }),
    ...(options.signal ? { signal: options.signal } : {}),
  };
  if (isImageEffectTool(tool)) {
    const { exportImageEffect } = await import("../raster-effect/export");
    return (await exportImageEffect(tool, params, ctx, base, options.effectClient)).blob;
  }
  if (isWebglTool(tool)) {
    const { exportShader } = await import("../shader/export");
    return (await exportShader(tool, params, ctx, base, options.shaderClient)).blob;
  }
  const result = await exportRaster(tool, params as Params<ParamsSchema>, ctx, base, options.env);
  return result.blob;
}
