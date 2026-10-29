/**
 * Default constraints for a layer from where it sits: the third of the
 * canvas its centre falls into picks the anchor (left third `start`, middle
 * `center`, right third `end`); a box spanning at least 80 % of an axis
 * stretches along it. Sizes follow the short side. The editor applies this
 * when a layer is added and offers the constraints in the side panel.
 */
import type { Box } from "./geometry";
import type { Anchor, Constraints, SceneFormat } from "./schema";

const STRETCH_SHARE = 0.8;

function anchorFor(start: number, size: number, extent: number): Anchor {
  if (size >= extent * STRETCH_SHARE) return "stretch";
  const c = (start + size / 2) / extent;
  if (c < 1 / 3) return "start";
  if (c > 2 / 3) return "end";
  return "center";
}

export function inferConstraints(
  box: Box,
  format: Pick<SceneFormat, "width" | "height">,
  bleed = false,
): Constraints {
  return {
    h: anchorFor(box.x, box.width, format.width),
    v: anchorFor(box.y, box.height, format.height),
    size: "short",
    bleed,
  };
}

/** Constraints that keep a layer centred and scaling with the short side. */
export const CENTERED: Constraints = { h: "center", v: "center", size: "short", bleed: false };
