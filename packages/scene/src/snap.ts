/**
 * Snapping while moving: the moving box's left edge, centre and right edge
 * (top, middle, bottom) snap to the canvas edges and centre and to the same
 * lines of the other visible layers, within a threshold. Returns the
 * correction and the guide lines to draw.
 */
import { boundsOf, frameOf, type Box } from "./geometry";
import type { Scene } from "./schema";

export interface SnapTargets {
  x: readonly number[];
  y: readonly number[];
}

export interface SnapGuide {
  /** `x`: a vertical line at `position`; `y`: a horizontal one. */
  axis: "x" | "y";
  position: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

/** Snap lines of the canvas and of every visible layer not in `exclude`. */
export function snapTargets(scene: Scene, exclude: ReadonlySet<string>): SnapTargets {
  const { width, height } = scene.format;
  const x = [0, width / 2, width];
  const y = [0, height / 2, height];
  for (const layer of scene.layers) {
    if (layer.kind === "background" || !layer.visible || exclude.has(layer.id)) continue;
    const b = boundsOf(frameOf(layer));
    x.push(b.x, b.x + b.width / 2, b.x + b.width);
    y.push(b.y, b.y + b.height / 2, b.y + b.height);
  }
  return { x, y };
}

function snapAxis(
  lines: readonly number[],
  targets: readonly number[],
  threshold: number,
): { delta: number; position: number } | null {
  let best: { delta: number; position: number } | null = null;
  for (const line of lines) {
    for (const target of targets) {
      const delta = target - line;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, position: target };
      }
    }
  }
  return best;
}

export function snapBox(box: Box, targets: SnapTargets, threshold: number): SnapResult {
  const sx = snapAxis([box.x, box.x + box.width / 2, box.x + box.width], targets.x, threshold);
  const sy = snapAxis([box.y, box.y + box.height / 2, box.y + box.height], targets.y, threshold);
  const guides: SnapGuide[] = [];
  if (sx) guides.push({ axis: "x", position: sx.position });
  if (sy) guides.push({ axis: "y", position: sy.position });
  return { dx: sx?.delta ?? 0, dy: sy?.delta ?? 0, guides };
}
