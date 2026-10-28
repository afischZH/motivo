/**
 * Pure crop rectangle math for the upload crop dialog. The rectangle is
 * stored in fractions of the source (0 to 1 on both axes), so the same
 * model serves raster pictures (pixels) and SVG files (viewBox units).
 * "Square" means square in source units, not in fractions.
 */

export type CropAspect = "square" | "free";

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SourceSize {
  width: number;
  height: number;
}

/** Smallest crop edge as a share of the source edge. */
export const CROP_MIN = 0.02;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Height fraction that makes a crop of width fraction `w` square in source units. */
function squareHeight(w: number, src: SourceSize): number {
  return (w * src.width) / src.height;
}

/** The whole source, or the largest centred square. */
export function initialCrop(src: SourceSize, aspect: CropAspect): CropRect {
  if (aspect === "free") return { x: 0, y: 0, w: 1, h: 1 };
  const side = Math.min(src.width, src.height);
  const w = side / src.width;
  const h = side / src.height;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** Moves the crop, keeping it inside the source. */
export function moveCrop(c: CropRect, dx: number, dy: number): CropRect {
  return { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) };
}

/**
 * Resizes from the top-left corner. With `square`, the width decides and the
 * height follows (in source units); the result always fits the source.
 */
export function resizeCrop(
  c: CropRect,
  dw: number,
  dh: number,
  aspect: CropAspect,
  src: SourceSize,
): CropRect {
  if (aspect === "square") {
    // Largest width that still fits vertically at this position.
    const maxW = Math.min(1 - c.x, ((1 - c.y) * src.height) / src.width);
    const minW = Math.max(CROP_MIN, (CROP_MIN * src.height) / src.width);
    const w = clamp(c.w + dw, Math.min(minW, maxW), maxW);
    return { ...c, w, h: squareHeight(w, src) };
  }
  return {
    ...c,
    w: clamp(c.w + dw, CROP_MIN, 1 - c.x),
    h: clamp(c.h + dh, CROP_MIN, 1 - c.y),
  };
}

/** Switches the aspect: square keeps the centre and the shorter side. */
export function withAspect(c: CropRect, aspect: CropAspect, src: SourceSize): CropRect {
  if (aspect === "free") return c;
  const side = Math.min(c.w * src.width, c.h * src.height);
  const w = side / src.width;
  const h = side / src.height;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
}

/** Sets one edge value from a form field (percent), keeping the crop valid. */
export function setCropField(
  c: CropRect,
  field: keyof CropRect,
  percent: number,
  aspect: CropAspect,
  src: SourceSize,
): CropRect {
  const v = clamp(percent / 100, 0, 1);
  if (field === "x" || field === "y") {
    return moveCrop(c, field === "x" ? v - c.x : 0, field === "y" ? v - c.y : 0);
  }
  if (aspect === "square") {
    const w = field === "w" ? v : (v * src.height) / src.width;
    return resizeCrop(c, w - c.w, 0, aspect, src);
  }
  return resizeCrop(c, field === "w" ? v - c.w : 0, field === "h" ? v - c.h : 0, aspect, src);
}

/** The crop in source units, offset by the source origin (an SVG viewBox may not start at 0). */
export function cropToSource(
  c: CropRect,
  src: SourceSize & { x?: number; y?: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: (src.x ?? 0) + c.x * src.width,
    y: (src.y ?? 0) + c.y * src.height,
    width: c.w * src.width,
    height: c.h * src.height,
  };
}
