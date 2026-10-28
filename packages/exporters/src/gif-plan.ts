/**
 * Pure limits and size math of GIF exports (M4-AP04). GIF is a palette
 * format for short loops: the edge is capped at 1024 px and all frames
 * together at `GIF_PIXEL_BUDGET` pixels, which keeps an export to a few
 * seconds and the file to a size that is still useful.
 */
import type { CanvasSize } from "@musterli/tool-registry";

export const GIF_FRAMES_MIN = 2;
export const GIF_FRAMES_MAX = 60;
export const GIF_FRAMES_DEFAULT = 12;

/** Frame delay in milliseconds. Browsers slow down delays under 20 ms to 100 ms. */
export const GIF_DELAY_MIN = 20;
export const GIF_DELAY_MAX = 2000;
export const GIF_DELAY_STEP = 10;
export const GIF_DELAY_DEFAULT = 100;

/** Longest edge of a GIF in pixels. */
export const GIF_MAX_EDGE = 1024;
/** Edge lengths offered in the export dialog. */
export const GIF_EDGES = [320, 480, 640, 800, 1024] as const;
export const GIF_EDGE_DEFAULT = 640;

/** Frames × width × height of one GIF export (about 28 frames at 1024 × 1024). */
export const GIF_PIXEL_BUDGET = 30_000_000;

export interface GifPlanRequest {
  /** Longest edge of the output in pixels (clamped to 1..`GIF_MAX_EDGE`). */
  edge: number;
  /** Number of frames (clamped to `GIF_FRAMES_MIN`..`GIF_FRAMES_MAX`). */
  frames: number;
  /** Frame delay in ms (clamped and rounded to `GIF_DELAY_STEP`). Default `GIF_DELAY_DEFAULT`. */
  delay?: number;
}

export interface GifPlan {
  width: number;
  height: number;
  frames: number;
  delay: number;
  /** frames × width × height. */
  pixels: number;
  /** `pixels` exceeds `GIF_PIXEL_BUDGET`: the export is refused. */
  overBudget: boolean;
  /** Largest frame count that fits the budget at this size. */
  maxFrames: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/** Clamps a frame count to the allowed range. */
export function clampGifFrames(frames: number): number {
  return Math.round(clamp(frames, GIF_FRAMES_MIN, GIF_FRAMES_MAX));
}

/** Clamps a delay to the allowed range, rounded to whole hundredths of a second. */
export function clampGifDelay(delay: number): number {
  return clamp(Math.round(delay / GIF_DELAY_STEP) * GIF_DELAY_STEP, GIF_DELAY_MIN, GIF_DELAY_MAX);
}

/** Output size with the design's aspect ratio and the given longest edge. */
export function gifSize(design: CanvasSize, edge: number): CanvasSize {
  const e = Math.round(clamp(edge, 1, GIF_MAX_EDGE));
  const long = Math.max(design.width, design.height, 1);
  const scale = e / long;
  return {
    width: Math.max(1, Math.round(design.width * scale)),
    height: Math.max(1, Math.round(design.height * scale)),
  };
}

/** Size, frame count and budget check of a GIF export. */
export function planGif(design: CanvasSize, request: GifPlanRequest): GifPlan {
  const { width, height } = gifSize(design, request.edge);
  const frames = clampGifFrames(request.frames);
  const pixels = frames * width * height;
  return {
    width,
    height,
    frames,
    delay: clampGifDelay(request.delay ?? GIF_DELAY_DEFAULT),
    pixels,
    overBudget: pixels > GIF_PIXEL_BUDGET,
    maxFrames: Math.floor(GIF_PIXEL_BUDGET / (width * height)),
  };
}
