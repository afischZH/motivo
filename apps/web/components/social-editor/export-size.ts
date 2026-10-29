/**
 * Output size of a scene export. The format may be any custom size up to
 * the canvas limit (an import file can ask for 8192 × 8192), so a 2x export
 * is capped: the longer output edge never exceeds `SCENE_EXPORT_EDGE_MAX`,
 * the limit of every other raster export (browsers draw larger canvases
 * blank or run out of memory).
 */
import { CANVAS_EDGE_MAX } from "@musterli/tool-registry";

export const SCENE_EXPORT_EDGE_MAX = CANVAS_EDGE_MAX;

interface Size {
  width: number;
  height: number;
}

/** The scale actually used for `requested`: lowered so the longer edge fits the limit. */
export function effectiveExportScale(format: Size, requested: number): number {
  const scale = Number.isFinite(requested) && requested > 0 ? requested : 1;
  const edge = Math.max(format.width, format.height, 1);
  return Math.min(scale, SCENE_EXPORT_EDGE_MAX / edge);
}

/** Output pixels for `requested`, never over the limit. */
export function exportOutputSize(format: Size, requested: number): Size {
  const k = effectiveExportScale(format, requested);
  return {
    width: Math.min(SCENE_EXPORT_EDGE_MAX, Math.max(1, Math.round(format.width * k))),
    height: Math.min(SCENE_EXPORT_EDGE_MAX, Math.max(1, Math.round(format.height * k))),
  };
}

/** Whether `scale` fits the limit without being lowered (the size picker offers only those). */
export function exportScaleFits(format: Size, scale: number): boolean {
  return Math.max(format.width, format.height) * scale <= SCENE_EXPORT_EDGE_MAX;
}
