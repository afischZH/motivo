/**
 * Blob composition: several blobs (the Blob generator's shape, see
 * `../blob`) as layers anchored to corners, edges or the centre of the
 * canvas. Positions and sizes are relative (percent of the canvas edges and
 * of the shorter edge), so a composition keeps its look at any canvas size
 * ("Magic Resize").
 *
 * Each blob's outline depends only on its own `variant`, never on the design
 * seed or its list position: reordering, adding or locking blobs keeps every
 * other shape unchanged.
 */
import { formatNumber } from "../../curves";
import { createRng, deriveSeed } from "../../rng";
import { bboxGradientVector, stableId, svgBackground, svgDocument } from "../../svg";
import { BLOB_FILL_STYLES, type BlobFillStyle, blobPath } from "../blob";

export const BLOB_ANCHORS = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
] as const;
export type BlobAnchor = (typeof BLOB_ANCHORS)[number];

export const BLOB_COMPOSITION_FILL_STYLES = BLOB_FILL_STYLES;
export type BlobCompositionFillStyle = BlobFillStyle;

/** Largest blob variant; variants pick one of this many outlines per complexity. */
export const BLOB_VARIANT_MAX = 9999;

/** Anchor point of each position as a fraction of width and height. */
export const BLOB_ANCHOR_POINTS: Readonly<Record<BlobAnchor, { x: number; y: number }>> = {
  "top-left": { x: 0, y: 0 },
  top: { x: 0.5, y: 0 },
  "top-right": { x: 1, y: 0 },
  left: { x: 0, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
  right: { x: 1, y: 0.5 },
  "bottom-left": { x: 0, y: 1 },
  bottom: { x: 0.5, y: 1 },
  "bottom-right": { x: 1, y: 1 },
};

export interface CompositionBlob {
  readonly anchor: BlobAnchor;
  /** Horizontal shift from the anchor in percent of the canvas width. */
  readonly offsetX: number;
  /** Vertical shift from the anchor in percent of the canvas height. */
  readonly offsetY: number;
  /** Diameter in percent of the shorter canvas edge. */
  readonly size: number;
  /** Points on the circle, at least 3. */
  readonly complexity: number;
  /** 0 = circle, 1 = maximal radial variation. */
  readonly randomness: number;
  /** Picks the outline; same variant and complexity give the same shape. */
  readonly variant: number;
  /** Opacity in percent. */
  readonly opacity: number;
  readonly visible: boolean;
}

export interface BlobCompositionSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly background: string;
  /** Blob i is painted in colour i (cycling); gradients run from colour i to i + 1. */
  readonly colors: readonly string[];
  /** Top blob first, as in a layer list. */
  readonly blobs: readonly CompositionBlob[];
  readonly fillStyle: BlobCompositionFillStyle;
  /** Outline width in px. */
  readonly strokeWidth: number;
  /** Gradient direction in degrees (0 = to top). */
  readonly gradientAngle: number;
}

/** Centre and radius of a blob on a canvas of the given size, in px. */
export function blobPlacement(
  blob: Pick<CompositionBlob, "anchor" | "offsetX" | "offsetY" | "size">,
  width: number,
  height: number,
): { cx: number; cy: number; radius: number } {
  const a = BLOB_ANCHOR_POINTS[blob.anchor];
  return {
    cx: (a.x + blob.offsetX / 100) * width,
    cy: (a.y + blob.offsetY / 100) * height,
    radius: Math.max((Math.min(width, height) * blob.size) / 200, 0.5),
  };
}

/** Path `d` of one blob of the composition, placed on the canvas. */
export function compositionBlobPath(
  blob: CompositionBlob,
  width: number,
  height: number,
  inset = 0,
): string {
  const { cx, cy, radius } = blobPlacement(blob, width, height);
  return blobPath({
    cx,
    cy,
    radius: Math.max(radius - inset, 0.5),
    complexity: blob.complexity,
    randomness: blob.randomness,
    rng: createRng(deriveSeed(Math.trunc(blob.variant), "blob-composition")),
  });
}

const colorAt = (colors: readonly string[], i: number): string =>
  colors[((i % colors.length) + colors.length) % colors.length] ?? "#000000";

/** Renders the composition; hidden blobs are skipped, the first blob is on top. */
export function blobCompositionSvg(o: BlobCompositionSvgOptions): string {
  const { width: w, height: h } = o;
  const outline = o.fillStyle === "outline";
  const inset = outline ? o.strokeWidth / 2 : 0;
  const defs: string[] = [];
  const seen = new Set<string>();
  const paths: string[] = [];

  for (let i = o.blobs.length - 1; i >= 0; i--) {
    const blob = o.blobs[i];
    if (!blob?.visible || blob.opacity <= 0) continue;
    const d = compositionBlobPath(blob, w, h, inset);
    const color = colorAt(o.colors, i);
    let paint: string;
    if (outline) {
      paint = `fill="none" stroke="${color}" stroke-width="${formatNumber(o.strokeWidth)}" stroke-linejoin="round"`;
    } else if (o.fillStyle === "gradient") {
      const inner =
        `${bboxGradientVector(o.gradientAngle)}>` +
        `<stop offset="0" stop-color="${color}"/>` +
        `<stop offset="1" stop-color="${colorAt(o.colors, i + 1)}"/>`;
      const id = stableId("bc", inner);
      if (!seen.has(id)) {
        seen.add(id);
        defs.push(`<linearGradient id="${id}" ${inner}</linearGradient>`);
      }
      paint = `fill="url(#${id})"`;
    } else {
      paint = `fill="${color}"`;
    }
    const opacity = blob.opacity < 100 ? ` opacity="${formatNumber(blob.opacity / 100, 2)}"` : "";
    paths.push(`<path d="${d}" ${paint}${opacity}/>`);
  }

  const defsEl = defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "";
  return svgDocument(w, h, `${defsEl}${svgBackground(o.background, w, h)}${paths.join("")}`);
}
