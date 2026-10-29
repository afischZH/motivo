/**
 * A design as a picture through the tool's own render path, at any output
 * size: SVG tools render their SVG and rasterise it (decoded on the main
 * thread, encoded in the raster worker; the SVG itself is made in the SVG
 * render worker where there is one), WebGL tools draw in the shader
 * worker, image effects in the raster-effect worker (with the demo picture
 * when the design has no photo). Exactly what the export dialog produces,
 * for app pages that show designs as pictures, such as the backgrounds of
 * the social editor. The worker exports are loaded on first use.
 */
import {
  exportRaster,
  supportsExport,
  throwIfAborted,
  type RasterEnv,
  type RasterFormat,
} from "@musterli/exporters";
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
import { browserSvgRenderClient, type SvgRenderClient } from "./svg-render-client";

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
  /** Default: the page's SVG render worker when `env` is not given, else the main thread. */
  svgClient?: SvgRenderClient | null;
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
  const svgClient =
    options.svgClient === undefined
      ? options.env
        ? null
        : browserSvgRenderClient()
      : options.svgClient;
  const svg = supportsExport(tool, base.format)
    ? await svgClient?.render({ toolId: tool.id, params, seed, size })
    : null;
  throwIfAborted(options.signal);
  const result = await exportRaster(
    tool,
    params as Params<ParamsSchema>,
    ctx,
    svg ? { ...base, svg } : base,
    options.env,
  );
  return result.blob;
}
