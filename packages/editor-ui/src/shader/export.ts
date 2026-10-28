/**
 * Exports of WebGL tools (docs/ARCHITECTURE.md 4.15): PNG, JPG and WebP
 * drawn in tiles by the shader worker with the preview's shader and
 * uniforms, and GIF frames drawn there too (`exportDesignGif`, the export
 * dialog's `exportGif` service).
 */
import {
  ExportError,
  FILE_EXTENSIONS,
  MIME_TYPES,
  exportFilename,
  exportGif,
  resolveQuality,
  resolveRasterSize,
  supportsExport,
  throwIfAborted,
  type GifEnv,
  type GifExportOptions,
  type GifExportResult,
  type GifFrameRenderer,
  type RasterExportOptions,
  type RasterExportResult,
} from "@musterli/exporters";
import {
  isWebglTool,
  type AnyToolDefinition,
  type Params,
  type ParamsSchema,
  type RenderContext,
  type ToolDefinition,
} from "@musterli/tool-registry";
import { ShaderRenderError, retainShaderClient, shaderClient, type ShaderClient } from "./client";
import { withinShaderBudget, type ShaderEncodeOptions } from "./protocol";

/** `ExportError` of a failed worker call. */
function exportErrorOf(error: unknown): ExportError {
  if (error instanceof ExportError) return error;
  const code = error instanceof ShaderRenderError ? error.code : "render-failed";
  if (code === "aborted") return new ExportError("aborted", "Export aborted", { cause: error });
  if (code === "too-large") {
    return new ExportError("too-large", "Shader export over budget", { cause: error });
  }
  return new ExportError(
    code === "unavailable" || code === "unsupported" ? "unavailable" : "encode-failed",
    `Shader export failed: ${code}`,
    { cause: error },
  );
}

/** PNG, JPG or WebP of a WebGL tool at the output size. Throws `ExportError`. */
export async function exportShader(
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
  ctx: RenderContext,
  options: RasterExportOptions,
  client: ShaderClient = shaderClient(),
): Promise<RasterExportResult> {
  const { format } = options;
  if (!isWebglTool(tool) || !supportsExport(tool, format)) {
    throw new ExportError("unsupported-format", `Tool "${tool.id}" cannot export ${format}`);
  }
  const size = resolveRasterSize(ctx, options.size, options.maxEdge);
  const encode: ShaderEncodeOptions = { mime: MIME_TYPES[format] as ShaderEncodeOptions["mime"] };
  const quality = resolveQuality(format, options.quality);
  if (quality !== undefined) encode.quality = quality;
  // Shaders draw opaque pixels, so a JPG background never shows.
  if (!withinShaderBudget(size, encode)) {
    throw new ExportError("too-large", `${size.width}x${size.height} exceeds the ${format} budget`);
  }
  throwIfAborted(options.signal);
  const release = retainShaderClient();
  let blob: Blob;
  try {
    blob = await client.encode(
      {
        tool,
        params,
        seed: ctx.seed,
        design: { width: ctx.width, height: ctx.height },
        out: { width: size.width, height: size.height },
      },
      encode,
      options.signal,
      options.onProgress,
    );
  } catch (error) {
    throwIfAborted(options.signal);
    throw exportErrorOf(error);
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

/** GIF frames of a WebGL tool, drawn by the shader worker at GIF size. */
export function shaderGifFrames(
  tool: AnyToolDefinition,
  ctx: RenderContext,
  client: ShaderClient = shaderClient(),
): GifFrameRenderer {
  const design = { width: ctx.width, height: ctx.height };
  return async (frame, size, signal) => {
    try {
      const bitmap = await client.frame(
        {
          tool,
          params: frame.params as Readonly<Record<string, unknown>>,
          seed: frame.seed,
          design,
          out: size,
          ...(frame.t === undefined ? {} : { t: frame.t }),
        },
        signal,
      );
      return { bitmap };
    } catch (error) {
      throwIfAborted(signal);
      throw exportErrorOf(error);
    }
  };
}

/** `exportGif` for every tool: WebGL tools draw their frames in the shader worker. */
export async function exportDesignGif<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  params: Params<S>,
  ctx: RenderContext,
  options: GifExportOptions,
  env?: GifEnv,
): Promise<GifExportResult> {
  const anyTool: AnyToolDefinition = tool;
  if (!isWebglTool(anyTool)) return exportGif(tool, params, ctx, options, env);
  const release = retainShaderClient();
  try {
    return await exportGif(
      tool,
      params,
      ctx,
      { ...options, renderFrame: shaderGifFrames(anyTool, ctx) },
      env,
    );
  } finally {
    release();
  }
}
