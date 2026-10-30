/**
 * Clip-path shapes (docs/TOOLS.md M4): a shape in the unit square that cuts
 * an element, written as a CSS `clip-path` value in percent (so it follows
 * the element's size) and as a path for an SVG `<clipPath>` in
 * `objectBoundingBox` units. Polygons, stars and blobs are stretched to fill
 * the box, like the element they will cut.
 *
 * Shapes with an edge (wave, slant, chevron, bubble) are built for the
 * bottom side and mirrored or swapped onto the chosen side.
 */
import { catmullRomToBezier, formatNumber, type CubicPath } from "../../curves";
import type { Rng } from "../../rng";
import { bboxGradientVector, escapeXml, stableId, svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";
import { blobPoints, circleTension } from "../blob";

export const CLIP_SHAPES = [
  "polygon",
  "star",
  "blob",
  "ellipse",
  "wave",
  "slant",
  "chevron",
  "notch",
  "bubble",
] as const;
export type ClipShapeKind = (typeof CLIP_SHAPES)[number];

export const CLIP_SIDES = ["bottom", "top", "left", "right"] as const;
export type ClipSide = (typeof CLIP_SIDES)[number];

/** Shapes that take `sides` (corners, star points or blob points). */
export const CLIP_COUNTED: ReadonlySet<ClipShapeKind> = new Set(["polygon", "star", "blob"]);
/** Shapes that take `rotation`. */
export const CLIP_ROTATED: ReadonlySet<ClipShapeKind> = new Set(["polygon", "star"]);
/** Shapes with an edge on one side (`side`). */
export const CLIP_SIDED: ReadonlySet<ClipShapeKind> = new Set([
  "wave",
  "slant",
  "chevron",
  "bubble",
]);
/** Shapes that take `depth`. */
export const CLIP_DEPTHED: ReadonlySet<ClipShapeKind> = new Set([
  "wave",
  "slant",
  "chevron",
  "notch",
  "bubble",
]);

export const CLIP_SIDES_MIN = 3;
export const CLIP_SIDES_MAX = 12;
export const CLIP_WAVES_MAX = 12;
/** Largest `depth` in percent of the box. */
export const CLIP_DEPTH_MAX = 50;

export interface ClipShapeOptions {
  readonly shape: ClipShapeKind;
  /** Corners (polygon), points (star) or control points (blob), 3 to 12. */
  readonly sides: number;
  /** Inner radius of a star in percent of the outer one. */
  readonly innerRadius: number;
  /** Rotation of polygon and star in degrees (0 = a corner at the top). */
  readonly rotation: number;
  /** Blob variation, 0 (circle) to 100. */
  readonly randomness: number;
  /** Waves along the edge. */
  readonly waves: number;
  /** Size of the edge feature (wave height, slant, chevron depth, corner cut, bubble tail) in percent. */
  readonly depth: number;
  readonly side: ClipSide;
  /** Only used by the blob. */
  readonly rng: Rng;
}

/** A shape in unit coordinates: the outline for CSS and the path for SVG. */
export interface ClipShape {
  /** Outline as a polygon (curves sampled), each point in [0, 1]². */
  readonly polygon: readonly Vec2[];
  /** Smooth outline where the shape is curved, else the polygon itself. */
  readonly curve: CubicPath | null;
  /** True for the ellipse, which CSS writes as `ellipse()`. */
  readonly ellipse: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const v = (x: number, y: number): Vec2 => ({ x, y });

/** Maps a point of the bottom-side layout onto `side`. */
function onSide(p: Vec2, side: ClipSide): Vec2 {
  switch (side) {
    case "bottom":
      return p;
    case "top":
      return v(p.x, 1 - p.y);
    case "right":
      return v(p.y, p.x);
    case "left":
      return v(1 - p.y, p.x);
  }
}

/** Stretches points (and an optional curve) so their bounds are exactly [0, 1]². */
function fitToBox(points: readonly Vec2[], curve: CubicPath | null): ClipShape {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const sx = maxX - minX > 1e-9 ? 1 / (maxX - minX) : 1;
  const sy = maxY - minY > 1e-9 ? 1 / (maxY - minY) : 1;
  const t = (p: Vec2) => v(clamp01((p.x - minX) * sx), clamp01((p.y - minY) * sy));
  // Curve handles may poke out slightly; they are not clamped, the sampled bounds rule.
  const tc = (p: Vec2) => v((p.x - minX) * sx, (p.y - minY) * sy);
  return {
    polygon: points.map(t),
    curve: curve
      ? {
          start: tc(curve.start),
          closed: curve.closed,
          segments: curve.segments.map((s) => ({ c1: tc(s.c1), c2: tc(s.c2), to: tc(s.to) })),
        }
      : null,
    ellipse: false,
  };
}

/** Points along a cubic path, `perSegment` per segment, without repeating the start. */
export function sampleCubicPath(path: CubicPath, perSegment: number): Vec2[] {
  const out: Vec2[] = [path.start];
  let from = path.start;
  for (const s of path.segments) {
    for (let i = 1; i <= perSegment; i++) {
      const t = i / perSegment;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      out.push(
        v(
          a * from.x + b * s.c1.x + c * s.c2.x + d * s.to.x,
          a * from.y + b * s.c1.y + c * s.c2.y + d * s.to.y,
        ),
      );
    }
    from = s.to;
  }
  // A closed path ends where it started.
  if (path.closed) out.pop();
  return out;
}

function regular(n: number, rotation: number, inner: number | null): Vec2[] {
  const count = inner === null ? n : n * 2;
  const start = -Math.PI / 2 + (rotation * Math.PI) / 180;
  const points: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const r = inner !== null && i % 2 === 1 ? inner : 1;
    const a = start + (i / count) * 2 * Math.PI;
    points.push(v(0.5 + 0.5 * r * Math.cos(a), 0.5 + 0.5 * r * Math.sin(a)));
  }
  return points;
}

/** Ellipse filling the box as four cubic arcs (handle 0.5523 of the radius). */
function ellipseCurve(): CubicPath {
  const k = 0.5 * 0.5522847498;
  return {
    start: v(1, 0.5),
    closed: true,
    segments: [
      { c1: v(1, 0.5 + k), c2: v(0.5 + k, 1), to: v(0.5, 1) },
      { c1: v(0.5 - k, 1), c2: v(0, 0.5 + k), to: v(0, 0.5) },
      { c1: v(0, 0.5 - k), c2: v(0.5 - k, 0), to: v(0.5, 0) },
      { c1: v(0.5 + k, 0), c2: v(1, 0.5 - k), to: v(1, 0.5) },
    ],
  };
}

/** Points of the bottom-side layout for the edged shapes (clockwise from top left). */
function edgedPoints(o: ClipShapeOptions): Vec2[] {
  const d = Math.min(Math.max(o.depth, 0), CLIP_DEPTH_MAX) / 100;
  switch (o.shape) {
    case "slant":
      return [v(0, 0), v(1, 0), v(1, 1 - d), v(0, 1)];
    case "chevron":
      return [v(0, 0), v(0.5, d), v(1, 0), v(1, 1 - d), v(0.5, 1), v(0, 1 - d)];
    case "bubble": {
      const body = 1 - d;
      return [v(0, 0), v(1, 0), v(1, body), v(0.4, body), v(0.22, 1), v(0.22, body), v(0, body)];
    }
    case "wave": {
      const waves = Math.max(1, Math.round(o.waves));
      const steps = Math.max(32, waves * 16);
      const points: Vec2[] = [v(0, 0), v(1, 0)];
      // From the right corner back to the left one; troughs reach 1, crests 1 - depth.
      for (let i = 0; i <= steps; i++) {
        const x = 1 - i / steps;
        const y = 1 - (d * (1 - Math.cos(2 * Math.PI * waves * x))) / 2;
        points.push(v(x, y));
      }
      return points;
    }
    default:
      return [];
  }
}

/** Builds the shape in unit coordinates. Only the blob draws from `rng`. */
export function clipShape(o: ClipShapeOptions): ClipShape {
  const n = Math.min(Math.max(Math.round(o.sides), CLIP_SIDES_MIN), CLIP_SIDES_MAX);
  switch (o.shape) {
    case "polygon":
      return fitToBox(regular(n, o.rotation, null), null);
    case "star":
      return fitToBox(regular(n, o.rotation, Math.min(Math.max(o.innerRadius, 5), 95) / 100), null);
    case "blob": {
      const points = blobPoints({
        cx: 0.5,
        cy: 0.5,
        radius: 0.5,
        complexity: n,
        randomness: Math.min(Math.max(o.randomness, 0), 100) / 100,
        rng: o.rng,
      });
      const curve = catmullRomToBezier(points, { closed: true, tension: circleTension(n) });
      return fitToBox(sampleCubicPath(curve, 8), curve);
    }
    case "ellipse": {
      const curve = ellipseCurve();
      return { polygon: sampleCubicPath(curve, 12), curve, ellipse: true };
    }
    case "notch": {
      const d = Math.min(Math.max(o.depth, 0), CLIP_DEPTH_MAX) / 100;
      const polygon =
        d === 0
          ? [v(0, 0), v(1, 0), v(1, 1), v(0, 1)]
          : [
              v(d, 0),
              v(1 - d, 0),
              v(1, d),
              v(1, 1 - d),
              v(1 - d, 1),
              v(d, 1),
              v(0, 1 - d),
              v(0, d),
            ];
      return { polygon, curve: null, ellipse: false };
    }
    default:
      return {
        polygon: edgedPoints(o).map((p) => onSide(p, o.side)),
        curve: null,
        ellipse: false,
      };
  }
}

const pct = (value: number) => `${formatNumber(value * 100, 2)}%`;

/** The CSS `clip-path` value, in percent of the element. */
export function clipPathCss(shape: ClipShape): string {
  if (shape.ellipse) return "ellipse(50% 50% at 50% 50%)";
  return `polygon(${shape.polygon.map((p) => `${pct(p.x)} ${pct(p.y)}`).join(", ")})`;
}

/** Path `d` of the shape scaled to `width` × `height` (1 × 1 gives `objectBoundingBox` units). */
export function clipPathD(shape: ClipShape, width = 1, height = 1, precision = 4): string {
  const f = (p: Vec2) =>
    `${formatNumber(p.x * width, precision)} ${formatNumber(p.y * height, precision)}`;
  if (shape.curve) {
    const parts = [`M${f(shape.curve.start)}`];
    for (const s of shape.curve.segments) parts.push(`C${f(s.c1)} ${f(s.c2)} ${f(s.to)}`);
    return `${parts.join(" ")} Z`;
  }
  return `M${shape.polygon.map(f).join(" L")} Z`;
}

/** A hidden inline SVG with the `<clipPath>`, for `clip-path: url(#id)`. */
export function clipPathSvgSnippet(shape: ClipShape, id: string): string {
  return (
    `<svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">` +
    `<clipPath id="${escapeXml(id)}" clipPathUnits="objectBoundingBox">` +
    `<path d="${clipPathD(shape)}"/></clipPath></svg>`
  );
}

export interface ClipPathSvgOptions extends ClipShapeOptions {
  readonly width: number;
  readonly height: number;
  /** Fill colours of the cut element (a gradient from the first to the last). */
  readonly colors: readonly string[];
  readonly gradientAngle: number;
  readonly background: string;
  /** Show the uncut element faintly behind the shape. */
  readonly showBox: boolean;
  /** Picture inside the shape (data or blob URI); replaces the gradient. */
  readonly imageHref: string | null;
}

/** Preview and image export: the element cut to the shape. */
export function clipPathSvg(o: ClipPathSvgOptions): string {
  const { width: w, height: h } = o;
  const shape = clipShape(o);
  const d = clipPathD(shape, w, h, 2);
  const colors = o.colors.length > 0 ? o.colors : ["#000000"];
  const n = colors.length;
  const stops = colors
    .map((c, i) => `<stop offset="${formatNumber(n > 1 ? i / (n - 1) : 0, 4)}" stop-color="${c}"/>`)
    .join("");
  const gradient = `${bboxGradientVector(o.gradientAngle)}>${stops}`;
  const gid = stableId("cg", gradient);
  const cid = stableId("cp", d);
  const W = formatNumber(w);
  const H = formatNumber(h);

  const ghost = o.showBox
    ? `<rect width="${W}" height="${H}" fill="url(#${gid})" opacity="0.14"/>`
    : "";
  const content = o.imageHref
    ? `<image href="${escapeXml(o.imageHref)}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`
    : `<path d="${d}" fill="url(#${gid})"/>`;
  const ghostImage =
    o.showBox && o.imageHref
      ? `<image href="${escapeXml(o.imageHref)}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity="0.18"/>`
      : ghost;

  return svgDocument(
    w,
    h,
    `<defs><linearGradient id="${gid}" ${gradient}</linearGradient>` +
      `<clipPath id="${cid}"><path d="${d}"/></clipPath></defs>` +
      svgBackground(o.background, w, h) +
      ghostImage +
      content,
  );
}
