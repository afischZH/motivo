/**
 * Helpers around `ToolDefinition.photoSource` and image-effect renderers
 * (docs/ARCHITECTURE.md 4.13), shared by the editor worker, static motifs
 * and tests, so every caller feeds an effect the same way.
 */
import { resizeCover } from "@musterli/effects";
import { createRenderContext } from "./render";
import type { AnyToolDefinition, CanvasSize, ImageEffectRenderer, PixelBuffer } from "./types";

/** Longest edge of the built-in sample picture (the design size is fitted into it). */
export const PHOTO_SAMPLE_MAX_EDGE = 2048;

/** Plain parameter object (type-erased). */
type Values = Readonly<Record<string, unknown>>;

/** `size` scaled down (never up) so the longest edge is at most `maxEdge`, at least 1 × 1. */
export function fitSize(size: CanvasSize, maxEdge: number): CanvasSize {
  const k = Math.min(1, maxEdge / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * k)),
    height: Math.max(1, Math.round(size.height * k)),
  };
}

/** Size the sample picture is generated at for a design of `design` size. */
export function photoSampleSize(design: CanvasSize): CanvasSize {
  return fitSize(design, PHOTO_SAMPLE_MAX_EDGE);
}

/** A raster photo in the tool's photo param: `href` (data URI) and pixel size. */
export interface PhotoAssetRef {
  href: string;
  width: number;
  height: number;
}

/** The user's photo of a photo tool, or `null` while the sample stands in. */
export function photoAssetOf(tool: AnyToolDefinition, params: Values): PhotoAssetRef | null {
  const key = tool.photoSource?.param;
  const value = key === undefined ? undefined : params[key];
  if (typeof value !== "object" || value === null) return null;
  const asset = value as Record<string, unknown>;
  return asset.kind === "raster" &&
    typeof asset.href === "string" &&
    typeof asset.width === "number" &&
    typeof asset.height === "number"
    ? { href: asset.href, width: asset.width, height: asset.height }
    : null;
}

/** Whether the tool renders through a pixel effect (needs the photo pipeline). */
export function isImageEffectTool(
  tool: AnyToolDefinition,
): tool is AnyToolDefinition & { render: ImageEffectRenderer<Values> } {
  return tool.render.kind === "image-effect" && tool.photoSource !== undefined;
}

/**
 * Renders an image-effect tool at `out` pixels for a design of `design`
 * size: `source` is the picture already cropped and scaled to `out` (the
 * editor draws it with a canvas); without it the sample is generated and
 * resampled here (Node, static motifs, tests). Throws for other tools.
 */
export function renderImageEffect(
  tool: AnyToolDefinition,
  params: Values,
  seed: number,
  design: CanvasSize,
  out: CanvasSize,
  source?: PixelBuffer,
): PixelBuffer {
  if (!isImageEffectTool(tool) || !tool.photoSource) {
    throw new TypeError(`Tool "${tool.id}" is not an image effect`);
  }
  let input = source;
  if (input === undefined) {
    const s = photoSampleSize(design);
    const sample = tool.photoSource.sample(s.width, s.height);
    input =
      sample.width === out.width && sample.height === out.height
        ? sample
        : resizeCover(sample, out.width, out.height);
  }
  if (input.width !== out.width || input.height !== out.height) {
    throw new RangeError(
      `Source is ${input.width}x${input.height}, expected ${out.width}x${out.height}`,
    );
  }
  // The store and the callers only hold params that passed the schema.
  return tool.render.render(input, params, createRenderContext(seed, design));
}
