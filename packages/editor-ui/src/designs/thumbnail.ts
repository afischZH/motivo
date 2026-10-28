/**
 * Thumbnails of saved designs: the design through the tool's own render
 * path (same SVG as preview and export), rasterised to about 400 px. Encoding
 * runs in the raster worker; WebP where the browser can encode it, PNG
 * otherwise (Safari cannot encode WebP).
 */
import { ExportError, rasterizeSvg, renderDesignSvg, type RasterEnv } from "@motivo/exporters";
import {
  createRenderContext,
  type AnyToolDefinition,
  type CanvasSize,
  type Params,
  type ParamsSchema,
} from "@motivo/tool-registry";

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
}

/**
 * Renders a thumbnail. Resolves to `null` when the tool has no SVG output or
 * the browser cannot rasterise it; a design is saved without one then.
 */
export async function createDesignThumbnail(
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
  seed: number,
  size: CanvasSize,
  options: DesignThumbnailOptions = {},
): Promise<Blob | null> {
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
