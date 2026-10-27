/**
 * Catmull-Rom splines converted to cubic Bezier segments, plus SVG path output.
 *
 * Uses the uniform (non-centripetal) Catmull-Rom parameterisation. For the
 * segment P1 -> P2 with neighbours P0 and P3 the Bezier control points are
 *
 *   c1 = P1 + (P2 - P0) * tension / 3
 *   c2 = P2 - (P3 - P1) * tension / 3
 *
 * `tension = 0.5` is the classic Catmull-Rom spline, `0` yields straight lines
 * and larger values give rounder, more overshooting curves.
 */
import { add, scale, sub, type Vec2 } from "./vec";

export interface CubicSegment {
  readonly c1: Vec2;
  readonly c2: Vec2;
  readonly to: Vec2;
}

export interface CubicPath {
  readonly start: Vec2;
  readonly segments: readonly CubicSegment[];
  readonly closed: boolean;
}

export interface CatmullRomOptions {
  /** Close the curve back to the first point. Default false. */
  readonly closed?: boolean;
  /** Tangent scale, 0.5 = classic Catmull-Rom. Default 0.5. */
  readonly tension?: number;
}

/**
 * Converts a point list into cubic Bezier segments passing through every point.
 * Open curves with n points give n - 1 segments (end tangents use the
 * endpoint itself as missing neighbour); closed curves give n segments.
 * Fewer than two points produce no segments. Throws on an empty list.
 */
export function catmullRomToBezier(
  points: readonly Vec2[],
  options: CatmullRomOptions = {},
): CubicPath {
  const { closed = false, tension = 0.5 } = options;
  const n = points.length;
  const first = points[0];
  if (first === undefined) {
    throw new RangeError("catmullRomToBezier: at least one point is required");
  }
  if (n < 2) return { start: first, segments: [], closed: false };

  const at = (i: number): Vec2 => {
    const index = closed ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1);
    return points[index] as Vec2;
  };

  const k = tension / 3;
  const segmentCount = closed ? n : n - 1;
  const segments: CubicSegment[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    segments.push({
      c1: add(p1, scale(sub(p2, p0), k)),
      c2: sub(p2, scale(sub(p3, p1), k)),
      to: p2,
    });
  }
  return { start: first, segments, closed };
}

/**
 * Formats a number with at most `precision` decimals, trailing zeros removed
 * and negative zero written as "0".
 */
export function formatNumber(value: number, precision = 2): string {
  const fixed = value.toFixed(precision);
  const trimmed = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return trimmed === "-0" ? "0" : trimmed;
}

/** Builds an SVG path `d` string, e.g. `M0 0 C1 2 3 4 5 6 Z`. */
export function cubicPathToSvg(path: CubicPath, precision = 2): string {
  const f = (v: Vec2): string => `${formatNumber(v.x, precision)} ${formatNumber(v.y, precision)}`;
  const parts = [`M${f(path.start)}`];
  for (const s of path.segments) {
    parts.push(`C${f(s.c1)} ${f(s.c2)} ${f(s.to)}`);
  }
  if (path.closed) parts.push("Z");
  return parts.join(" ");
}
