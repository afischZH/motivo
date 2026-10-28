/**
 * Drawing helpers for the shape library. Every helper returns absolute SVG
 * path data (commands M, L, H, V, C, Q, A, Z) in the centred shape box
 * (x and y from -50 to 50), numbers with at most two decimals.
 *
 * Winding: under the nonzero fill rule a hole must run against its outline.
 * The "solid" helpers (`disc`, `poly`, `rrect`, `sector`, `band`, `smooth`,
 * `ellipse`) run clockwise on screen (y down) and take `hole = true` for the
 * counter-clockwise version. Solid parts of one shape may overlap freely.
 *
 * `polygon`, `circle`, `radial` and `roundedRect` are the original helpers of
 * the 24 Seamless Patterns shapes (M3-AP12). They keep their exact output
 * (and winding), so those shapes render byte for byte as before.
 */
import { catmullRomToBezier, formatNumber } from "../curves";

export type Pt = readonly [number, number];

export const f = (v: number): string => formatNumber(v, 2);
export const pt = (x: number, y: number): string => `${f(x)} ${f(y)}`;

const RAD = Math.PI / 180;

/** Point at `r` and `deg` (0° = right, 90° = down, as on screen). */
export function polar(r: number, deg: number, cx = 0, cy = 0): [number, number] {
  return [cx + Math.cos(deg * RAD) * r, cy + Math.sin(deg * RAD) * r];
}

/** Points rotated by `deg` around (cx, cy). */
export function rotatePts(points: readonly Pt[], deg: number, cx = 0, cy = 0): Pt[] {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return points.map(([x, y]) => [
    cx + (x - cx) * c - (y - cy) * s,
    cy + (x - cx) * s + (y - cy) * c,
  ]);
}

/** Points moved by (dx, dy). */
export function movePts(points: readonly Pt[], dx: number, dy: number): Pt[] {
  return points.map(([x, y]) => [x + dx, y + dy]);
}

/** Points mirrored left to right (x → -x), order reversed so the winding is kept. */
export function mirrorPts(points: readonly Pt[]): Pt[] {
  return points.map(([x, y]): Pt => [-x, y]).reverse();
}

/** Shoelace sum; positive = clockwise on screen (y down). */
export function signedArea(points: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i] as Pt;
    const [x2, y2] = points[(i + 1) % points.length] as Pt;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

// ---------------------------------------------------------------------------
// Original helpers (Seamless Patterns, M3-AP12): output must not change.
// ---------------------------------------------------------------------------

/** Closed polygon through points, in the given order. */
export function polygon(points: readonly (readonly [number, number])[]): string {
  return `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${pt(x, y)}`).join("")}Z`;
}

/** Full circle as two arcs, counter-clockwise; `reverse` runs clockwise. */
export function circle(cx: number, cy: number, r: number, reverse = false): string {
  const sweep = reverse ? 1 : 0;
  const arc = `A${f(r)} ${f(r)} 0 1 ${sweep}`;
  return `M${pt(cx - r, cy)}${arc} ${pt(cx + r, cy)}${arc} ${pt(cx - r, cy)}Z`;
}

/** Regular polygon or star (clockwise): alternating outer and inner radius when `inner` is set. */
export function radial(n: number, outer: number, inner?: number, startDeg = -90): string {
  return polygon(radialPts(n, outer, inner, startDeg));
}

/** Rectangle with rounded corners, clockwise. */
export function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${pt(x + r, y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${pt(x + w, y + r)}` +
    `V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${pt(x + w - r, y + h)}` +
    `H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${pt(x, y + h - r)}` +
    `V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${pt(x + r, y)}Z`
  );
}

// ---------------------------------------------------------------------------
// Helpers with explicit winding (new shapes, M4-AP01).
// ---------------------------------------------------------------------------

/** Corner points of a regular polygon or star, clockwise. */
export function radialPts(n: number, outer: number, inner?: number, startDeg = -90): Pt[] {
  const points: Pt[] = [];
  const steps = inner === undefined ? n : n * 2;
  for (let i = 0; i < steps; i++) {
    const r = inner !== undefined && i % 2 === 1 ? inner : outer;
    points.push(polar(r, startDeg + (360 * i) / steps));
  }
  return points;
}

/** Polygon, clockwise (or counter-clockwise for a hole) whatever the point order. */
export function poly(points: readonly Pt[], hole = false): string {
  const cw = signedArea(points) > 0;
  return polygon(cw === !hole ? points : [...points].reverse());
}

/** Regular polygon, clockwise (`hole` = counter-clockwise). */
export function regular(n: number, r: number, startDeg = -90, hole = false): string {
  return poly(radialPts(n, r, undefined, startDeg), hole);
}

/** Star with `n` points, clockwise (`hole` = counter-clockwise). */
export function star(
  n: number,
  outer: number,
  inner: number,
  startDeg = -90,
  hole = false,
): string {
  return poly(radialPts(n, outer, inner, startDeg), hole);
}

/** Circle, clockwise (`hole` = counter-clockwise). */
export function disc(cx: number, cy: number, r: number, hole = false): string {
  return circle(cx, cy, r, !hole);
}

/** Ellipse with radii rx, ry turned by `deg`, clockwise (`hole` = counter-clockwise). */
export function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  deg = 0,
  hole = false,
): string {
  const [x0, y0] = polar(rx, deg, cx, cy);
  const [x1, y1] = polar(-rx, deg, cx, cy);
  const sweep = hole ? 0 : 1;
  const arc = `A${f(rx)} ${f(ry)} ${f(deg)} 1 ${sweep}`;
  return `M${pt(x1, y1)}${arc} ${pt(x0, y0)}${arc} ${pt(x1, y1)}Z`;
}

/** Axis-aligned rectangle, clockwise (`hole` = counter-clockwise). */
export function rect(x: number, y: number, w: number, h: number, hole = false): string {
  return poly(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    hole,
  );
}

/** Rounded rectangle, clockwise (`hole` = counter-clockwise). */
export function rrect(x: number, y: number, w: number, h: number, r: number, hole = false): string {
  const k = Math.min(r, w / 2, h / 2);
  if (!hole) return roundedRect(x, y, w, h, k);
  const a = `A${f(k)} ${f(k)} 0 0 0`;
  return (
    `M${pt(x + k, y)}${a} ${pt(x, y + k)}V${f(y + h - k)}${a} ${pt(x + k, y + h)}` +
    `H${f(x + w - k)}${a} ${pt(x + w, y + h - k)}V${f(y + k)}${a} ${pt(x + w - k, y)}Z`
  );
}

/** Pie slice from `a0` to `a1` degrees (a1 > a0), clockwise. */
export function sector(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(r, a0, cx, cy);
  const [x1, y1] = polar(r, a1, cx, cy);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${pt(cx, cy)}L${pt(x0, y0)}A${f(r)} ${f(r)} 0 ${large} 1 ${pt(x1, y1)}Z`;
}

/** Ring segment between radii r0 < r1, from `a0` to `a1` degrees (a1 > a0, below 360), clockwise. */
export function band(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [ox0, oy0] = polar(r1, a0, cx, cy);
  const [ox1, oy1] = polar(r1, a1, cx, cy);
  const [ix1, iy1] = polar(r0, a1, cx, cy);
  const [ix0, iy0] = polar(r0, a0, cx, cy);
  return (
    `M${pt(ox0, oy0)}A${f(r1)} ${f(r1)} 0 ${large} 1 ${pt(ox1, oy1)}` +
    `L${pt(ix1, iy1)}A${f(r0)} ${f(r0)} 0 ${large} 0 ${pt(ix0, iy0)}Z`
  );
}

/** Full ring (annulus) between radii r0 < r1. */
export function annulus(cx: number, cy: number, r0: number, r1: number): string {
  return `${disc(cx, cy, r1)}${disc(cx, cy, r0, true)}`;
}

/** Closed smooth curve through points (Catmull-Rom), clockwise (`hole` = counter-clockwise). */
export function smooth(points: readonly Pt[], tension = 0.5, hole = false): string {
  const cw = signedArea(points) > 0;
  const ordered = cw === !hole ? points : [...points].reverse();
  const path = catmullRomToBezier(
    ordered.map(([x, y]) => ({ x, y })),
    { closed: true, tension },
  );
  let d = `M${pt(path.start.x, path.start.y)}`;
  for (const s of path.segments) {
    d += `C${pt(s.c1.x, s.c1.y)} ${pt(s.c2.x, s.c2.y)} ${pt(s.to.x, s.to.y)}`;
  }
  return `${d}Z`;
}

/** Polygon with corners rounded by quadratic curves of size `r` (clamped to half an edge). */
export function roundedPoly(points: readonly Pt[], r: number, hole = false): string {
  const cw = signedArea(points) > 0;
  const p = cw === !hole ? points : [...points].reverse();
  const n = p.length;
  const toward = (a: Pt, b: Pt, d: number): Pt => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.min(d, len / 2) / len;
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = p[(i + n - 1) % n] as Pt;
    const cur = p[i] as Pt;
    const next = p[(i + 1) % n] as Pt;
    const a = toward(cur, prev, r);
    const b = toward(cur, next, r);
    d += `${i === 0 ? "M" : "L"}${pt(a[0], a[1])}Q${pt(cur[0], cur[1])} ${pt(b[0], b[1])}`;
  }
  return `${d}Z`;
}

/**
 * Outline of a thick line along `center` (open polyline, at least two
 * points) with round ends: offset points on both sides joined by a smooth
 * closed curve. `width` may be a function of the position 0..1 along the
 * line (tapered strokes).
 */
export function strokeOutline(
  center: readonly Pt[],
  width: number | ((t: number) => number),
  tension = 0.5,
): string {
  const n = center.length;
  const w = typeof width === "number" ? () => width : width;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = center[Math.max(0, i - 1)] as Pt;
    const b = center[Math.min(n - 1, i + 1)] as Pt;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const half = w(i / (n - 1)) / 2;
    const [cx, cy] = center[i] as Pt;
    left.push([cx + (dy / len) * half, cy - (dx / len) * half]);
    right.push([cx - (dy / len) * half, cy + (dx / len) * half]);
  }
  // Round caps: one point beyond each end.
  const cap = (i: number, j: number): Pt => {
    const [x0, y0] = center[i] as Pt;
    const [x1, y1] = center[j] as Pt;
    const len = Math.hypot(x0 - x1, y0 - y1) || 1;
    const half = w(i === 0 ? 0 : 1) / 2;
    return [x0 + ((x0 - x1) / len) * half * 0.9, y0 + ((y0 - y1) / len) * half * 0.9];
  };
  const ring = [cap(0, 1), ...left, cap(n - 1, n - 2), ...right.reverse()];
  return smooth(ring, tension);
}

/** Clips a convex or concave polygon to the half plane a·x + b·y <= c (Sutherland-Hodgman). */
export function clipHalfPlane(points: readonly Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = [];
  const inside = (p: Pt) => a * p[0] + b * p[1] <= c + 1e-9;
  for (let i = 0; i < points.length; i++) {
    const cur = points[i] as Pt;
    const prev = points[(i + points.length - 1) % points.length] as Pt;
    const ci = inside(cur);
    const pi = inside(prev);
    if (ci !== pi) {
      const dp = a * prev[0] + b * prev[1] - c;
      const dc = a * cur[0] + b * cur[1] - c;
      const t = dp / (dp - dc);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (ci) out.push(cur);
  }
  return out;
}

/** Square of half edge `h` around the origin, clockwise points. */
export function squarePts(h: number): Pt[] {
  return [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
}

/**
 * Horizontal slice of a circle between y0 < y1 (both inside the circle),
 * clockwise.
 */
export function circleSlice(r: number, y0: number, y1: number, cx = 0, cy = 0): string {
  const x0 = Math.sqrt(Math.max(0, r * r - y0 * y0));
  const x1 = Math.sqrt(Math.max(0, r * r - y1 * y1));
  const arc = `A${f(r)} ${f(r)} 0 0 1`;
  return (
    `M${pt(cx - x0, cy + y0)}L${pt(cx + x0, cy + y0)}${arc} ${pt(cx + x1, cy + y1)}` +
    `L${pt(cx - x1, cy + y1)}${arc} ${pt(cx - x0, cy + y0)}Z`
  );
}

/**
 * Lens (two quadratic curves) from p0 to p1 bulging `bulge` units to each
 * side at the middle: petals, leaves, eyes. Clockwise (`hole` = counter-clockwise).
 */
export function lens(p0: Pt, p1: Pt, bulge: number, hole = false): string {
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  // A quadratic reaches half its control offset at the middle.
  const nx = (-(y1 - y0) / len) * bulge * 2;
  const ny = ((x1 - x0) / len) * bulge * 2;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  let a: Pt = [mx + nx, my + ny];
  let b: Pt = [mx - nx, my - ny];
  if (signedArea([p0, a, p1, b]) > 0 === hole) [a, b] = [b, a];
  return `M${pt(x0, y0)}Q${pt(a[0], a[1])} ${pt(x1, y1)}Q${pt(b[0], b[1])} ${pt(x0, y0)}Z`;
}

/** Points scaled by `k` towards their average (leaves even gaps between touching faces). */
export function shrinkPts(points: readonly Pt[], k: number): Pt[] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

/** Closed smooth curve through `n` points at radius `r(angle)` (degrees, 0 = up), scaled by sx, sy. */
export function radialSmooth(
  n: number,
  r: (deg: number, i: number) => number,
  sx = 1,
  sy = 1,
  cx = 0,
  cy = 0,
  hole = false,
): string {
  const points: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const deg = -90 + (360 * i) / n;
    const [x, y] = polar(r(deg + 90, i), deg);
    points.push([cx + x * sx, cy + y * sy]);
  }
  return smooth(points, 0.5, hole);
}
