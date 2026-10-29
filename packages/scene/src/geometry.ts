/**
 * Frames and bounding boxes. A layer's frame is the top-left corner of its
 * unrotated box plus size; rotation turns the box around its centre.
 */
import type { Layer, Scene, SceneFormat } from "./schema";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Frame extends Box {
  rotation: number;
}

export function frameOf(layer: Pick<Layer, "x" | "y" | "width" | "height" | "rotation">): Frame {
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
  };
}

/** Axis-aligned bounding box of a frame after rotation around its centre. */
export function boundsOf(frame: Frame): Box {
  const rad = (frame.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = frame.width * cos + frame.height * sin;
  const h = frame.width * sin + frame.height * cos;
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

/** Smallest box around all boxes; `null` for none. */
export function unionBoxes(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Canvas box of a format. */
export function canvasBox(format: Pick<SceneFormat, "width" | "height">): Box {
  return { x: 0, y: 0, width: format.width, height: format.height };
}

/** True if `inner` lies inside `outer`, allowing `tolerance` pixels. */
export function boxInside(inner: Box, outer: Box, tolerance = 0.5): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

/** Rotated bounds of a layer. */
export function layerBounds(layer: Layer): Box {
  return boundsOf(frameOf(layer));
}

/** The layers of a group, in scene order. */
export function groupMembers(scene: Scene, groupId: string): Layer[] {
  return scene.layers.filter((l) => l.groupId === groupId);
}
