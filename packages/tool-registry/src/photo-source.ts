/**
 * Helpers around `ToolDefinition.photoSource` and image-effect renderers
 * (docs/ARCHITECTURE.md 4.14), shared by the editor worker, static motifs
 * and tests, so every caller feeds an effect the same way.
 */
import { resizeCover, scaleGrid } from "@musterli/effects";

// The editor worker crops photos exactly like `resizeCover` does.
export { coverRect } from "@musterli/effects";
import { CANVAS_EDGE_MAX, CANVAS_EDGE_MIN } from "./common";
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

/**
 * Design size for a new photo: its pixel size, enlarged when an edge is
 * below `CANVAS_EDGE_MIN` (aspect kept as far as the canvas limits allow).
 * `null` for anything that is not a raster asset.
 */
export function photoDesignSize(value: unknown): CanvasSize | null {
  if (typeof value !== "object" || value === null) return null;
  const asset = value as Record<string, unknown>;
  const { width, height } = asset;
  if (
    asset.kind !== "raster" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !(width > 0) ||
    !(height > 0)
  ) {
    return null;
  }
  const k = Math.max(1, CANVAS_EDGE_MIN / Math.min(width, height));
  const edge = (v: number) =>
    Math.min(CANVAS_EDGE_MAX, Math.max(CANVAS_EDGE_MIN, Math.round(v * k)));
  return { width: edge(width), height: edge(height) };
}

/** Whether the tool renders through a pixel effect (needs the photo pipeline). */
export function isImageEffectTool(
  tool: AnyToolDefinition,
): tool is AnyToolDefinition & { render: ImageEffectRenderer<Values> } {
  return tool.render.kind === "image-effect" && tool.photoSource !== undefined;
}

/** Scaled samples kept (Node: every preset of a tool shares one). */
const SCALED_SAMPLE_CACHE = 4;
const scaledSamples = new Map<string, PixelBuffer>();

/**
 * The tool's sample generated for `design` and scaled to `out`, as the
 * editor worker would draw it. Cached: generating the sample (1500 × 1000
 * px for the default size) dominated static motifs and the contract tests,
 * which render every preset on the same picture. Effects never write to
 * their input (the contract's determinism test would catch it).
 */
function scaledSample(tool: AnyToolDefinition, design: CanvasSize, out: CanvasSize): PixelBuffer {
  const source = tool.photoSource;
  if (!source) throw new TypeError(`Tool "${tool.id}" has no photo source`);
  const s = photoSampleSize(design);
  const key = `${tool.id}@${tool.version}:${s.width}x${s.height}:${out.width}x${out.height}`;
  const hit = scaledSamples.get(key);
  if (hit) return hit;
  const sample = source.sample(s.width, s.height);
  const scaled =
    sample.width === out.width && sample.height === out.height
      ? sample
      : resizeCover(sample, out.width, out.height);
  if (scaledSamples.size >= SCALED_SAMPLE_CACHE) {
    const oldest = scaledSamples.keys().next().value;
    if (oldest !== undefined) scaledSamples.delete(oldest);
  }
  scaledSamples.set(key, scaled);
  return scaled;
}

/**
 * Largest fixed effect grid (`ImageEffectRenderer.grid`): 4096² pixels.
 * Tools scale their grid down to fit (the effective pixel size grows).
 */
export const IMAGE_EFFECT_GRID_MAX_PIXELS = 4096 * 4096;

/** Longest edge of the picture a vector export analyses (photos reach 4096 px). */
export const IMAGE_EFFECT_VECTOR_MAX_EDGE = 4096;

/**
 * Size of the picture fed to the effect's `render` for an output of `out`
 * pixels: the tool's fixed grid if it has one, else the output itself.
 */
export function effectInputSize(
  tool: AnyToolDefinition,
  params: Values,
  design: CanvasSize,
  out: CanvasSize,
): CanvasSize {
  if (!isImageEffectTool(tool) || !tool.render.grid) return out;
  const grid = tool.render.grid(params, design);
  return {
    width: Math.max(1, Math.round(grid.width)),
    height: Math.max(1, Math.round(grid.height)),
  };
}

/**
 * Renders an image-effect tool at `out` pixels for a design of `design`
 * size: `source` is the picture already cropped and scaled to the effect's
 * input size (`effectInputSize`: `out`, or the tool's grid; the editor
 * draws it with a canvas); without it the sample is generated and
 * resampled here (Node, static motifs, tests). A grid result is scaled to
 * `out` with `scaleGrid`. Throws for other tools.
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
  const size = effectInputSize(tool, params, design, out);
  const input = source ?? scaledSample(tool, design, size);
  if (input.width !== size.width || input.height !== size.height) {
    throw new RangeError(
      `Source is ${input.width}x${input.height}, expected ${size.width}x${size.height}`,
    );
  }
  // The store and the callers only hold params that passed the schema.
  const pixels = tool.render.render(input, params, createRenderContext(seed, design));
  return pixels.width === out.width && pixels.height === out.height
    ? pixels
    : scaleGrid(pixels, out.width, out.height);
}

/** Picture size a vector export analyses for a design (`IMAGE_EFFECT_VECTOR_MAX_EDGE`). */
export function effectVectorInputSize(design: CanvasSize): CanvasSize {
  return fitSize(design, IMAGE_EFFECT_VECTOR_MAX_EDGE);
}

/** Shapes of a vector export and the tool's limit, or `null` without vector output. */
export function effectVectorBudget(
  tool: AnyToolDefinition,
  params: Values,
  design: CanvasSize,
): { shapes: number; max: number } | null {
  if (!isImageEffectTool(tool) || !tool.render.vector) return null;
  const { vector } = tool.render;
  return { shapes: Math.ceil(vector.shapes(params, design)), max: vector.maxShapes };
}

/**
 * The SVG of an image effect with vector output: `source` is the picture at
 * `effectVectorInputSize(design)` (the worker draws it); without it the
 * sample is used (Node, tests). Throws for tools without vector output.
 */
export function renderImageEffectSvg(
  tool: AnyToolDefinition,
  params: Values,
  seed: number,
  design: CanvasSize,
  source?: PixelBuffer,
): string {
  if (!isImageEffectTool(tool) || !tool.render.vector) {
    throw new TypeError(`Tool "${tool.id}" has no vector output`);
  }
  const size = effectVectorInputSize(design);
  const input = source ?? scaledSample(tool, design, size);
  if (input.width !== size.width || input.height !== size.height) {
    throw new RangeError(
      `Source is ${input.width}x${input.height}, expected ${size.width}x${size.height}`,
    );
  }
  return tool.render.vector.render(input, params, createRenderContext(seed, design));
}
