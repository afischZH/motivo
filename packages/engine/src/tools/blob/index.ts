/**
 * Blob generator: `complexity` points evenly spaced on a circle, each with a
 * seeded radial offset, joined by a closed Catmull-Rom spline converted to
 * cubic Bezier segments.
 */
import { catmullRomToBezier, cubicPathToSvg, formatNumber } from "../../curves";
import type { Rng } from "../../rng";
import { bboxGradientVector, stableId, svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";

export const BLOB_FILL_STYLES = ["solid", "outline", "gradient"] as const;
export type BlobFillStyle = (typeof BLOB_FILL_STYLES)[number];

/** Largest radial deviation (fraction of the base radius) at `randomness = 1`. */
export const MAX_DEVIATION = 0.6;

export interface BlobShapeOptions {
  readonly cx: number;
  readonly cy: number;
  /** Largest possible radius; no point lies further from the centre. */
  readonly radius: number;
  /** Number of points on the circle, at least 3. */
  readonly complexity: number;
  /** 0 = circle, 1 = maximal radial variation. */
  readonly randomness: number;
  readonly rng: Rng;
}

/**
 * Catmull-Rom tension that makes n evenly spaced points on a circle give the
 * best cubic approximation of that circle (handle length 4/3 tan(pi / 2n) r).
 * The classic 0.5 would make blobs with few points look pointy.
 */
export function circleTension(n: number): number {
  return (2 * Math.tan(Math.PI / (2 * n))) / Math.sin((2 * Math.PI) / n);
}

/** The blob's control points (before smoothing). Consumes 1 + complexity rng draws. */
export function blobPoints(o: BlobShapeOptions): Vec2[] {
  const n = Math.max(3, Math.floor(o.complexity));
  const amp = Math.min(Math.max(o.randomness, 0), 1) * MAX_DEVIATION;
  const base = o.radius / (1 + amp);
  const phase = o.rng.float(0, (2 * Math.PI) / n);
  const points: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * 2 * Math.PI;
    const r = base * (1 + amp * o.rng.float(-1, 1));
    points.push({ x: o.cx + Math.cos(a) * r, y: o.cy + Math.sin(a) * r });
  }
  return points;
}

/** Closed SVG path `d` of a blob. */
export function blobPath(o: BlobShapeOptions, precision = 2): string {
  const points = blobPoints(o);
  const path = catmullRomToBezier(points, { closed: true, tension: circleTension(points.length) });
  return cubicPathToSvg(path, precision);
}

export interface BlobSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  readonly background: string;
  /** Fill colours; solid and outline use the first, gradient uses all of them. */
  readonly colors: readonly string[];
  readonly complexity: number;
  readonly randomness: number;
  /** Blob diameter relative to the shorter canvas edge, (0, 1]. */
  readonly size: number;
  readonly fillStyle: BlobFillStyle;
  /** Outline width in px. */
  readonly strokeWidth: number;
  /** Gradient direction in degrees (0 = to top). */
  readonly gradientAngle: number;
}

/** Path `d` of the blob exactly as `blobSvg` places it on the canvas. */
export function blobSvgPath(
  o: Pick<
    BlobSvgOptions,
    "width" | "height" | "rng" | "complexity" | "randomness" | "size" | "fillStyle" | "strokeWidth"
  >,
): string {
  const inset = o.fillStyle === "outline" ? o.strokeWidth / 2 : 0;
  const radius = Math.max((Math.min(o.width, o.height) * o.size) / 2 - inset, 1);
  return blobPath({
    cx: o.width / 2,
    cy: o.height / 2,
    radius,
    complexity: o.complexity,
    randomness: o.randomness,
    rng: o.rng,
  });
}

/**
 * CSS declarations that cut an element of the canvas size to the blob shape
 * (`clip-path: path()`; px units, so the element keeps the canvas size).
 */
export function blobClipPathCss(o: Parameters<typeof blobSvgPath>[0]): string {
  const d = blobSvgPath(o);
  return [
    `width: ${formatNumber(o.width)}px;`,
    `height: ${formatNumber(o.height)}px;`,
    `clip-path: path("${d}");`,
  ].join("\n");
}

export function blobSvg(o: BlobSvgOptions): string {
  const color = o.colors[0] ?? "#000000";
  const outline = o.fillStyle === "outline";
  const d = blobSvgPath(o);

  let defs = "";
  let paint: string;
  if (outline) {
    paint = `fill="none" stroke="${color}" stroke-width="${formatNumber(o.strokeWidth)}" stroke-linejoin="round"`;
  } else if (o.fillStyle === "gradient") {
    const n = o.colors.length;
    const stops = o.colors
      .map(
        (c, i) => `<stop offset="${formatNumber(n > 1 ? i / (n - 1) : 0, 4)}" stop-color="${c}"/>`,
      )
      .join("");
    const inner = `${bboxGradientVector(o.gradientAngle)}>${stops}`;
    const id = stableId("bg", inner);
    defs = `<defs><linearGradient id="${id}" ${inner}</linearGradient></defs>`;
    paint = `fill="url(#${id})"`;
  } else {
    paint = `fill="${color}"`;
  }
  return svgDocument(
    o.width,
    o.height,
    `${defs}${svgBackground(o.background, o.width, o.height)}<path d="${d}" ${paint}/>`,
  );
}
