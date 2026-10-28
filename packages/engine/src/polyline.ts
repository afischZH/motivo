/**
 * Polylines as flat coordinate arrays (`[x0, y0, x1, y1, ...]`): compact and
 * fast for the thousands of lines of the generative tools (contours, flow
 * lines). Simplification (Ramer-Douglas-Peucker), length and SVG path data.
 */

/**
 * Number formatter with at most `precision` decimals (0 to 6), trailing zeros
 * dropped and "-0" written as "0". Same output as `formatNumber` for the
 * coordinates of these paths, but without `toFixed` and a regex per number,
 * which dominated the render time of paths with tens of thousands of points.
 */
export function numberFormatter(precision: number): (v: number) => string {
  const k = 10 ** Math.min(Math.max(Math.round(precision), 0), 6);
  return (v: number): string => {
    const r = Math.round(v * k) / k;
    return r === 0 || !Number.isFinite(r) ? "0" : String(r);
  };
}

/** Euclidean length of (dx, dy); `Math.hypot` is several times slower in V8 hot loops. */
const len2 = (dx: number, dy: number): number => Math.sqrt(dx * dx + dy * dy);

/** Points as interleaved coordinates `[x0, y0, x1, y1, ...]`. */
export type FlatPoints = readonly number[];

/** Number of points of a flat polyline. */
export function pointCount(points: FlatPoints): number {
  return points.length >> 1;
}

/** Length of the polyline, including the closing segment when `closed`. */
export function polylineLength(points: FlatPoints, closed = false): number {
  const n = pointCount(points);
  let sum = 0;
  for (let i = 1; i < n; i++) {
    sum += len2(
      (points[2 * i] ?? 0) - (points[2 * i - 2] ?? 0),
      (points[2 * i + 1] ?? 0) - (points[2 * i - 1] ?? 0),
    );
  }
  if (closed && n > 2) {
    sum += len2(
      (points[0] ?? 0) - (points[2 * n - 2] ?? 0),
      (points[1] ?? 0) - (points[2 * n - 1] ?? 0),
    );
  }
  return sum;
}

/** Squared distance of point i to the segment a-b (indices into `p`). */
function segmentDistanceSq(p: FlatPoints, i: number, a: number, b: number): number {
  const px = p[2 * i] ?? 0;
  const py = p[2 * i + 1] ?? 0;
  const ax = p[2 * a] ?? 0;
  const ay = p[2 * a + 1] ?? 0;
  const dx = (p[2 * b] ?? 0) - ax;
  const dy = (p[2 * b + 1] ?? 0) - ay;
  const len = dx * dx + dy * dy;
  let t = len > 0 ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

/** Marks the points RDP keeps between first and last (both kept), iteratively. */
function markRdp(p: FlatPoints, first: number, last: number, tolSq: number, keep: Uint8Array) {
  const stack = [first, last];
  while (stack.length > 0) {
    const b = stack.pop() as number;
    const a = stack.pop() as number;
    let worst = -1;
    let worstDist = tolSq;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistanceSq(p, i, a, b);
      if (d > worstDist) {
        worstDist = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push(a, worst, worst, b);
    }
  }
}

/**
 * Ramer-Douglas-Peucker simplification: drops points that lie within
 * `tolerance` of the simplified line. Open lines keep both ends. Closed
 * lines (the last point connects back to the first) are split at the point
 * farthest from the first one, so the result is the same loop with fewer
 * points. Returns a new array; tolerance 0 or less returns a copy.
 */
export function simplifyPolyline(points: FlatPoints, tolerance: number, closed = false): number[] {
  const n = pointCount(points);
  if (n <= 2 || !(tolerance > 0)) return points.slice(0, n * 2);
  const keep = new Uint8Array(n);
  const tolSq = tolerance * tolerance;
  keep[0] = 1;
  if (closed) {
    let far = 1;
    let farDist = -1;
    for (let i = 1; i < n; i++) {
      const d = len2(
        (points[2 * i] ?? 0) - (points[0] ?? 0),
        (points[2 * i + 1] ?? 0) - (points[1] ?? 0),
      );
      if (d > farDist) {
        farDist = d;
        far = i;
      }
    }
    keep[far] = 1;
    markRdp(points, 0, far, tolSq, keep);
    // Second half: far ... n - 1, then back to 0. Copy it so indices stay simple.
    const tail: number[] = points.slice(far * 2, n * 2);
    tail.push(points[0] ?? 0, points[1] ?? 0);
    const tailKeep = new Uint8Array(n - far + 1);
    tailKeep[0] = 1;
    tailKeep[n - far] = 1;
    markRdp(tail, 0, n - far, tolSq, tailKeep);
    for (let i = 1; i < n - far; i++) if (tailKeep[i]) keep[far + i] = 1;
  } else {
    keep[n - 1] = 1;
    markRdp(points, 0, n - 1, tolSq, keep);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(points[2 * i] ?? 0, points[2 * i + 1] ?? 0);
  }
  return out;
}

/**
 * Inserts evenly spaced points into every segment longer than `maxSegment`,
 * so curves drawn through the points (`smoothPathData`) cannot cut corners
 * by more than about `maxSegment / 8`. Returns a new array.
 */
export function subdividePolyline(
  points: FlatPoints,
  maxSegment: number,
  closed = false,
): number[] {
  const n = pointCount(points);
  if (n < 2 || !(maxSegment > 0)) return points.slice(0, n * 2);
  const out: number[] = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const ax = points[2 * i] ?? 0;
    const ay = points[2 * i + 1] ?? 0;
    const j = (i + 1) % n;
    const bx = points[2 * j] ?? 0;
    const by = points[2 * j + 1] ?? 0;
    const parts = Math.max(1, Math.ceil(len2(bx - ax, by - ay) / maxSegment));
    for (let k = 0; k < parts; k++) {
      out.push(ax + ((bx - ax) * k) / parts, ay + ((by - ay) * k) / parts);
    }
  }
  if (!closed) out.push(points[2 * n - 2] ?? 0, points[2 * n - 1] ?? 0);
  return out;
}

/**
 * The part of an open polyline between the arc lengths `from` and `to`
 * (clamped to the line), with interpolated end points. Returns an empty
 * array when nothing of the line lies in the range.
 */
export function slicePolyline(points: FlatPoints, from: number, to: number): number[] {
  const n = pointCount(points);
  const a = Math.max(from, 0);
  if (n < 2 || !(to > a)) return [];
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    const ax = points[2 * i] ?? 0;
    const ay = points[2 * i + 1] ?? 0;
    const bx = points[2 * i + 2] ?? 0;
    const by = points[2 * i + 3] ?? 0;
    const len = len2(bx - ax, by - ay);
    const end = s + len;
    if (end > a && s < to && len > 0) {
      if (out.length === 0) {
        const f = Math.max(a - s, 0) / len;
        out.push(ax + (bx - ax) * f, ay + (by - ay) * f);
      }
      const f = Math.min(to - s, len) / len;
      out.push(ax + (bx - ax) * f, ay + (by - ay) * f);
    }
    if (end >= to) break;
    s = end;
  }
  return out.length >= 4 ? out : [];
}

/** SVG path data of straight segments: `M x y x y ...` (implicit lineto), `Z` when closed. */
export function polylinePathData(points: FlatPoints, closed = false, precision = 1): string {
  const n = pointCount(points);
  if (n === 0) return "";
  const fmt = numberFormatter(precision);
  const f = (v: number | undefined): string => fmt(v ?? 0);
  let d = `M${f(points[0])} ${f(points[1])}`;
  for (let i = 1; i < n; i++) d += ` ${f(points[2 * i])} ${f(points[2 * i + 1])}`;
  return closed ? `${d}Z` : d;
}

/**
 * SVG path data of a smooth curve through the polyline: a uniform quadratic
 * B-spline (the limit of Chaikin's corner cutting), written as quadratic
 * Béziers from edge midpoint to edge midpoint with the vertices as control
 * points. Open lines start and end at their end points; closed loops are
 * smooth all around. Lines with fewer than three points stay straight.
 */
export function smoothPathData(points: FlatPoints, closed = false, precision = 1): string {
  const n = pointCount(points);
  if (n < 3) return polylinePathData(points, closed && n > 2, precision);
  const f = numberFormatter(precision);
  const x = (i: number): number => points[2 * (((i % n) + n) % n)] ?? 0;
  const y = (i: number): number => points[2 * (((i % n) + n) % n) + 1] ?? 0;
  const mid = (i: number): string => `${f((x(i) + x(i + 1)) / 2)} ${f((y(i) + y(i + 1)) / 2)}`;
  if (closed) {
    let d = `M${mid(n - 1)}`;
    for (let i = 0; i < n; i++) d += `Q${f(x(i))} ${f(y(i))} ${mid(i)}`;
    return `${d}Z`;
  }
  let d = `M${f(x(0))} ${f(y(0))}L${mid(0)}`;
  for (let i = 1; i < n - 1; i++) d += `Q${f(x(i))} ${f(y(i))} ${mid(i)}`;
  return `${d}L${f(x(n - 1))} ${f(y(n - 1))}`;
}
