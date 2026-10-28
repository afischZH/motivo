/**
 * Seamless Patterns draws its motifs from the shape library (../../shapes,
 * M4-AP01). The 24 shapes of the first version (M3-AP12) live on there
 * under the same ids with the same path data, so saved designs and share
 * links render exactly as before.
 */
import { SHAPE_IDS, shapePath, type ShapeId } from "../../shapes";

/** Every shape Seamless Patterns can draw: the whole library. */
export const SEAMLESS_SHAPES = SHAPE_IDS;

export type SeamlessShape = ShapeId;

/** Path data of a library shape (100 × 100 box centred on the origin, both layers). */
export function seamlessShapePath(shape: SeamlessShape): string {
  return shapePath(shape);
}
