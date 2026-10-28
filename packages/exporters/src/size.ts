/**
 * Pure size math for raster exports.
 */
import { CANVAS_EDGE_MAX, type CanvasSize } from "@musterli/tool-registry";

/** What the user asked for. Missing values keep the design's aspect ratio. */
export interface RasterSizeRequest {
  width?: number;
  height?: number;
  /** Multiplier on the design size (e.g. 2 for @2x). Ignored if width or height is set. */
  scale?: number;
}

export interface ResolvedRasterSize extends CanvasSize {
  /** True if the request had to be shrunk to fit `maxEdge`. */
  clamped: boolean;
}

const positive = (v: number | undefined): v is number =>
  v !== undefined && Number.isFinite(v) && v > 0;

/**
 * Output pixel size for a design of `source` size. Width only or height
 * only keep the aspect ratio; both set give exactly that size (the SVG is
 * then letterboxed by its viewBox). The result is a whole number of pixels,
 * at least 1, and no edge exceeds `maxEdge` (shrunk proportionally).
 */
export function resolveRasterSize(
  source: CanvasSize,
  request: RasterSizeRequest = {},
  maxEdge: number = CANVAS_EDGE_MAX,
): ResolvedRasterSize {
  const sw = Math.max(source.width, 1);
  const sh = Math.max(source.height, 1);
  let w: number;
  let h: number;
  if (positive(request.width) && positive(request.height)) {
    w = request.width;
    h = request.height;
  } else if (positive(request.width)) {
    w = request.width;
    h = (request.width * sh) / sw;
  } else if (positive(request.height)) {
    h = request.height;
    w = (request.height * sw) / sh;
  } else {
    const scale = positive(request.scale) ? request.scale : 1;
    w = sw * scale;
    h = sh * scale;
  }
  const limit = Math.max(1, Math.floor(maxEdge));
  const fit = Math.min(1, limit / Math.max(w, h));
  const clamped = fit < 1;
  return {
    width: Math.min(limit, Math.max(1, Math.round(w * fit))),
    height: Math.min(limit, Math.max(1, Math.round(h * fit))),
    clamped,
  };
}

/** A horizontal strip of the output: rows `[y, y + height)`. */
export interface Band {
  y: number;
  height: number;
}

/**
 * About 4 megapixels per band keeps one `drawImage` call of a vector image
 * in the low tens of milliseconds on mid-range hardware.
 */
export const DEFAULT_BAND_PIXELS = 4_000_000;

/**
 * Splits an output into horizontal bands of at most `maxPixels` pixels each
 * (at least one row per band), so the main-thread fallback can yield between
 * draw calls.
 */
export function splitIntoBands(
  width: number,
  height: number,
  maxPixels: number = DEFAULT_BAND_PIXELS,
): Band[] {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const rows = Math.max(1, Math.floor(maxPixels / w));
  const bands: Band[] = [];
  for (let y = 0; y < h; y += rows) bands.push({ y, height: Math.min(rows, h - y) });
  return bands;
}
