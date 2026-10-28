/**
 * Raster export of image-effect tools: the same worker render as the
 * preview, at the output size (docs/ARCHITECTURE.md 4.14). `exportDesignRaster`
 * is the export dialog's `exportRaster` service: it routes image effects
 * here and every other tool to the SVG rasteriser of `@musterli/exporters`.
 */
import {
  ExportError,
  FILE_EXTENSIONS,
  MIME_TYPES,
  exportFilename,
  exportRaster,
  resolveBackground,
  resolveQuality,
  resolveRasterSize,
  supportsExport,
  throwIfAborted,
  type RasterEnv,
  type RasterExportOptions,
  type RasterExportResult,
} from "@musterli/exporters";
import {
  effectVectorBudget,
  effectVectorInputSize,
  isImageEffectTool,
  type AnyToolDefinition,
  type Params,
  type ParamsSchema,
  type RenderContext,
  type ToolDefinition,
} from "@musterli/tool-registry";
import {
  RasterEffectError,
  rasterEffectClient,
  retainRasterEffectClient,
  type RasterEffectClient,
} from "./client";
import { IMAGE_EFFECT_MAX_PIXELS, type EffectEncodeOptions } from "./protocol";

export { IMAGE_EFFECT_MAX_PIXELS };

export async function exportImageEffect(
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
  ctx: RenderContext,
  options: RasterExportOptions,
  client: RasterEffectClient = rasterEffectClient(),
): Promise<RasterExportResult> {
  const { format } = options;
  if (!isImageEffectTool(tool) || !supportsExport(tool, format)) {
    throw new ExportError("unsupported-format", `Tool "${tool.id}" cannot export ${format}`);
  }
  const size = resolveRasterSize(ctx, options.size, options.maxEdge);
  if (size.width * size.height > IMAGE_EFFECT_MAX_PIXELS) {
    throw new ExportError("too-large", `${size.width}x${size.height} exceeds the effect budget`);
  }
  throwIfAborted(options.signal);
  const encode: EffectEncodeOptions = {
    mime: MIME_TYPES[format] as EffectEncodeOptions["mime"],
  };
  const quality = resolveQuality(format, options.quality);
  if (quality !== undefined) encode.quality = quality;
  const background = resolveBackground(format, options.background);
  if (background !== undefined) encode.background = background;

  const job = client.encode(
    {
      tool,
      params,
      seed: ctx.seed,
      design: { width: ctx.width, height: ctx.height },
      out: { width: size.width, height: size.height },
    },
    encode,
    options.signal,
  );
  const aborted = new Promise<never>((_, reject) => {
    options.signal?.addEventListener(
      "abort",
      () => reject(new ExportError("aborted", "Export aborted")),
      { once: true },
    );
  });
  let blob: Blob;
  const release = retainRasterEffectClient();
  try {
    blob = await Promise.race([job, aborted]);
  } catch (error) {
    if (error instanceof ExportError) throw error;
    const code = error instanceof RasterEffectError ? error.code : "render-failed";
    throw new ExportError(
      code === "unavailable" ? "unavailable" : "encode-failed",
      `Image effect export failed: ${code}`,
      { cause: error },
    );
  } finally {
    release();
  }
  options.onProgress?.(1);
  return {
    blob,
    width: size.width,
    height: size.height,
    clamped: size.clamped,
    filename: exportFilename(tool.id, ctx.seed, FILE_EXTENSIONS[format]),
  };
}

/** Options of `exportImageEffectSvg`. */
export interface EffectSvgExportOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/**
 * SVG export of an image effect with vector output (halftone): built in the
 * export worker from the picture at the analysis size
 * (`effectVectorInputSize`), in design units (docs/ARCHITECTURE.md 4.16).
 * Over the tool's shape budget it fails with `too-large`; the dialog
 * explains the budget before it gets there.
 */
export async function exportImageEffectSvg(
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
  ctx: RenderContext,
  options: EffectSvgExportOptions = {},
  client: RasterEffectClient = rasterEffectClient(),
): Promise<{ blob: Blob; filename: string }> {
  const budget = effectVectorBudget(tool, params, ctx);
  if (!isImageEffectTool(tool) || budget === null || !supportsExport(tool, "svg")) {
    throw new ExportError("unsupported-format", `Tool "${tool.id}" cannot export svg`);
  }
  if (budget.shapes > budget.max) {
    throw new ExportError("too-large", `${budget.shapes} shapes exceed ${budget.max}`);
  }
  throwIfAborted(options.signal);
  const design = { width: ctx.width, height: ctx.height };
  const job = client.encode(
    { tool, params, seed: ctx.seed, design, out: effectVectorInputSize(design) },
    { mime: "image/svg+xml" },
    options.signal,
  );
  const release = retainRasterEffectClient();
  let blob: Blob;
  try {
    blob = await job;
  } catch (error) {
    const code = error instanceof RasterEffectError ? error.code : "render-failed";
    if (code === "aborted") throw new ExportError("aborted", "Export aborted", { cause: error });
    throw new ExportError(
      code === "unavailable" ? "unavailable" : "encode-failed",
      `Image effect SVG export failed: ${code}`,
      { cause: error },
    );
  } finally {
    release();
  }
  options.onProgress?.(1);
  return { blob, filename: exportFilename(tool.id, ctx.seed, FILE_EXTENSIONS.svg) };
}

/** `exportRaster` for every tool: image effects through the worker, the rest as SVG. */
export function exportDesignRaster<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  params: Params<S>,
  ctx: RenderContext,
  options: RasterExportOptions,
  env?: RasterEnv,
): Promise<RasterExportResult> {
  const anyTool: AnyToolDefinition = tool;
  return isImageEffectTool(anyTool)
    ? exportImageEffect(anyTool, params as Readonly<Record<string, unknown>>, ctx, options)
    : exportRaster(tool, params, ctx, options, env);
}
