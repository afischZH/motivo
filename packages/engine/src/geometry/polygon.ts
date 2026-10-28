/**
 * Small polygon helpers shared by the generative tools (Low-Poly, Voronoi,
 * Terrazzo): area, centroid, half-plane and rectangle clipping
 * (Sutherland-Hodgman), inward offset of convex polygons, star-shaped random
 * polygons and compact SVG path data with optional rounded corners.
 *
 * A polygon is a list of vertices without the closing repeat. Orientation is
 * free unless a function says otherwise.
 */
import { tenthsFormatter } from "../polyline";
import type { Rng } from "../rng";
import type { Vec2 } from "../vec";

export type Polygon = readonly Vec2[];

/** Signed area (shoelace). Positive for counter-clockwise in a y-up system (clockwise on screen). */
export function polygonArea(poly: Polygon): number {
  let sum = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i] as Vec2;
    const b = poly[(i + 1) % n] as Vec2;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Area-weighted centroid; the vertex mean for degenerate polygons. */
export function polygonCentroid(poly: Polygon): Vec2 {
  const n = poly.length;
  if (n === 0) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  let twice = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i] as Vec2;
    const b = poly[(i + 1) % n] as Vec2;
    const cross = a.x * b.y - b.x * a.y;
    twice += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(twice) < 1e-12) {
    let sx = 0;
    let sy = 0;
    for (const p of poly) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }
  return { x: cx / (3 * twice), y: cy / (3 * twice) };
}

/**
 * Clips a polygon to the half-plane `a·x + b·y <= c` (Sutherland-Hodgman,
 * one edge). Works for any simple polygon; the result of a convex input is
 * convex. Returns an empty list when nothing is left.
 */
export function clipPolygonHalfPlane(poly: Polygon, a: number, b: number, c: number): Vec2[] {
  const out: Vec2[] = [];
  const n = poly.length;
  if (n === 0) return out;
  let prev = poly[n - 1] as Vec2;
  let prevSide = a * prev.x + b * prev.y - c;
  for (let i = 0; i < n; i++) {
    const cur = poly[i] as Vec2;
    const side = a * cur.x + b * cur.y - c;
    if (side <= 0) {
      if (prevSide > 0) out.push(intersect(prev, cur, prevSide, side));
      out.push(cur);
    } else if (prevSide <= 0) {
      out.push(intersect(prev, cur, prevSide, side));
    }
    prev = cur;
    prevSide = side;
  }
  return out.length >= 3 ? out : [];
}

function intersect(p: Vec2, q: Vec2, sp: number, sq: number): Vec2 {
  const t = sp / (sp - sq);
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}

/** Axis-aligned rectangle. */
export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Clips a polygon to an axis-aligned rectangle. */
export function clipPolygonToRect(poly: Polygon, r: Rect): Vec2[] {
  let out = clipPolygonHalfPlane(poly, -1, 0, -r.x0);
  out = clipPolygonHalfPlane(out, 1, 0, r.x1);
  out = clipPolygonHalfPlane(out, 0, -1, -r.y0);
  return clipPolygonHalfPlane(out, 0, 1, r.y1);
}

/** The rectangle as a polygon (clockwise on screen). */
export function rectPolygon(r: Rect): Vec2[] {
  return [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
}

/**
 * Moves every edge of a convex polygon inward by `d` and returns what is
 * left (clipping by each shifted edge, so edges that vanish are handled).
 * Empty when the polygon is narrower than `2·d`. `d <= 0` returns a copy.
 */
export function insetConvexPolygon(poly: Polygon, d: number): Vec2[] {
  if (!(d > 0)) return poly.slice();
  const sign = polygonArea(poly) >= 0 ? 1 : -1;
  let out: Vec2[] = poly.slice();
  const n = poly.length;
  for (let i = 0; i < n && out.length >= 3; i++) {
    const p = poly[i] as Vec2;
    const q = poly[(i + 1) % n] as Vec2;
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const len = Math.hypot(ex, ey);
    if (len < 1e-12) continue;
    // Inward normal: left of the edge for positive area, right otherwise.
    const nx = (-ey / len) * sign;
    const ny = (ex / len) * sign;
    // Keep n·x >= n·p + d  <=>  -n·x <= -(n·p) - d.
    out = clipPolygonHalfPlane(out, -nx, -ny, -(nx * p.x + ny * p.y) - d);
  }
  return out.length >= 3 ? out : [];
}

export interface StarPolygonOptions {
  readonly center: Vec2;
  /** Bounding radius: every vertex lies within this distance of `center`. */
  readonly radius: number;
  /** Number of vertices, at least 3. */
  readonly vertices: number;
  /** 0 = regular polygon, 1 = vertex radii down to 45 % (concave notches). */
  readonly irregularity: number;
  /** Rotation of the first vertex in radians. */
  readonly rotation: number;
}

/**
 * A random star-shaped polygon around `center`: vertex angles jittered but
 * strictly increasing (so the outline never self-intersects), vertex radii
 * in `[radius·(1 - 0.55·irregularity), radius]`. Draws exactly
 * `2·vertices` values from `rng`.
 */
export function starPolygon(rng: Rng, o: StarPolygonOptions): Vec2[] {
  const k = Math.max(3, Math.round(o.vertices));
  const step = (2 * Math.PI) / k;
  const irr = Math.min(1, Math.max(0, o.irregularity));
  const out: Vec2[] = [];
  for (let i = 0; i < k; i++) {
    // Jitter below half a step keeps the angles in order.
    const a = o.rotation + (i + (rng.next() - 0.5) * 0.7) * step;
    const r = o.radius * (1 - 0.55 * irr * rng.next());
    out.push({ x: o.center.x + Math.cos(a) * r, y: o.center.y + Math.sin(a) * r });
  }
  return out;
}

/**
 * Fast coordinate formatting for long path lists: rounds to `precision`
 * decimals and prints the shortest form ("12.5", "3", never "-0"). Same as
 * `formatNumber` except at exact half steps, where the binary value decides.
 */
export function formatCoord(v: number, precision = 1): string {
  return precision === 1 ? coordTenths(v) : roundedText(v, precision);
}

function roundedText(v: number, precision: number): string {
  const k = 10 ** precision;
  const r = Math.round(v * k) / k;
  return r === 0 ? "0" : String(r);
}

/** One decimal through cached digit strings (same text, about twice as fast; M4b-AP05). */
const coordTenths = tenthsFormatter((v) => roundedText(v, 1));

const pt = (p: Vec2, precision: number): string =>
  `${formatCoord(p.x, precision)} ${formatCoord(p.y, precision)}`;

/** `M…L…Z` path data of a polygon, coordinates rounded to `precision` decimals. */
export function polygonPathData(poly: Polygon, precision = 1): string {
  if (poly.length === 0) return "";
  return `M${poly.map((p) => pt(p, precision)).join("L")}Z`;
}

/**
 * Path data with rounded corners: each corner is cut `radius` px along both
 * edges (at most half of each edge) and replaced by a quadratic curve through
 * the corner. `radius <= 0` gives the plain polygon. The curve stays inside
 * the polygon's convex hull.
 */
export function roundedPolygonPathData(poly: Polygon, radius: number, precision = 1): string {
  const n = poly.length;
  if (!(radius > 0) || n < 3) return polygonPathData(poly, precision);
  let d = "";
  for (let i = 0; i < n; i++) {
    const v = poly[i] as Vec2;
    const p = poly[(i + n - 1) % n] as Vec2;
    const q = poly[(i + 1) % n] as Vec2;
    const lp = Math.hypot(p.x - v.x, p.y - v.y);
    const lq = Math.hypot(q.x - v.x, q.y - v.y);
    const cut = Math.min(radius, lp / 2, lq / 2);
    const a = lp > 0 ? { x: v.x + ((p.x - v.x) * cut) / lp, y: v.y + ((p.y - v.y) * cut) / lp } : v;
    const b = lq > 0 ? { x: v.x + ((q.x - v.x) * cut) / lq, y: v.y + ((q.y - v.y) * cut) / lq } : v;
    d += `${i === 0 ? "M" : "L"}${pt(a, precision)}Q${pt(v, precision)} ${pt(b, precision)}`;
  }
  return `${d}Z`;
}

/**
 * Smooth closed outline through the edge midpoints of a polygon (quadratic
 * curves with the vertices as control points), like a pebble. Stays inside
 * the polygon's convex hull.
 */
export function smoothPolygonPathData(poly: Polygon, precision = 1): string {
  const n = poly.length;
  if (n < 3) return polygonPathData(poly, precision);
  const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  let d = `M${pt(mid(poly[n - 1] as Vec2, poly[0] as Vec2), precision)}`;
  for (let i = 0; i < n; i++) {
    const v = poly[i] as Vec2;
    d += `Q${pt(v, precision)} ${pt(mid(v, poly[(i + 1) % n] as Vec2), precision)}`;
  }
  return `${d}Z`;
}
