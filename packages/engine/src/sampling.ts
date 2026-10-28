/**
 * Adaptive sampling of parametric curves and compact polyline output.
 *
 * Fine line art (guilloche, spirographs) needs many points where a curve
 * bends and few where it is nearly straight. `sampleCurve` starts from an
 * even grid and splits a step while its midpoint is further than
 * `tolerance` from the chord. `polylinePath` writes the points as one SVG
 * subpath with relative coordinates rounded to a fixed grid, so the output
 * stays small and rounding never drifts.
 */
import type { Vec2 } from "./vec";

export interface SampleCurveOptions {
  /** Even steps before refinement, at least 1. */
  readonly steps: number;
  /** Largest allowed distance in px between a step's midpoint and its chord. */
  readonly tolerance: number;
  /** How often one step may be halved, default 5. */
  readonly maxDepth?: number;
}

/** Distance of `p` from the line through `a` and `b` (or from `a` if they meet). */
export function chordDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/**
 * Points of `curve` for t in [t0, t1], both ends included, in order.
 * Deterministic: the result depends only on the curve and the options.
 */
export function sampleCurve(
  curve: (t: number) => Vec2,
  t0: number,
  t1: number,
  options: SampleCurveOptions,
): Vec2[] {
  const steps = Math.max(1, Math.floor(options.steps));
  const tol = Math.max(options.tolerance, 1e-6);
  const maxDepth = Math.max(0, Math.floor(options.maxDepth ?? 5));
  const out: Vec2[] = [];
  let prev = curve(t0);
  out.push(prev);

  const refine = (a: number, pa: Vec2, b: number, pb: Vec2, depth: number): void => {
    if (depth < maxDepth) {
      const m = (a + b) / 2;
      const pm = curve(m);
      if (chordDistance(pm, pa, pb) > tol) {
        refine(a, pa, m, pm, depth + 1);
        refine(m, pm, b, pb, depth + 1);
        return;
      }
    }
    out.push(pb);
  };

  for (let i = 1; i <= steps; i++) {
    const t = i === steps ? t1 : t0 + ((t1 - t0) * i) / steps;
    const p = curve(t);
    refine(t0 + ((t1 - t0) * (i - 1)) / steps, prev, t, p, 0);
    prev = p;
  }
  return out;
}

/** A number of tenths (integer) as compact decimal text: 15 -> "1.5", -3 -> "-.3", 20 -> "2". */
function tenths(n: number): string {
  if (n === 0) return "0";
  const neg = n < 0;
  const a = neg ? -n : n;
  const whole = Math.floor(a / 10);
  const frac = a % 10;
  const body = frac === 0 ? `${whole}` : whole === 0 ? `.${frac}` : `${whole}.${frac}`;
  return neg ? `-${body}` : body;
}

/** Joins numbers with a space, or with nothing before a minus sign. */
function joinNumbers(parts: readonly string[]): string {
  let s = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i] as string;
    s += i === 0 || p.startsWith("-") ? p : ` ${p}`;
  }
  return s;
}

/**
 * One SVG subpath through `points`: `M` with absolute, then `l` with
 * relative coordinates on a 0.1 px grid. Deltas come from rounded absolute
 * positions, so the path never drifts. Steps that round to zero are
 * skipped; `closed` appends `z` (a last point equal to the first is
 * dropped). Fewer than two distinct points give an empty string.
 */
export function polylinePath(points: readonly Vec2[], closed = false): string {
  if (points.length < 2) return "";
  const first = points[0] as Vec2;
  let px = Math.round(first.x * 10);
  let py = Math.round(first.y * 10);
  const x0 = px;
  const y0 = py;
  const rel: string[] = [];
  for (let i = 1; i < points.length; i++) {
    const p = points[i] as Vec2;
    const x = Math.round(p.x * 10);
    const y = Math.round(p.y * 10);
    if (x === px && y === py) continue;
    if (closed && i === points.length - 1 && x === x0 && y === y0) continue;
    rel.push(tenths(x - px), tenths(y - py));
    px = x;
    py = y;
  }
  if (rel.length === 0) return "";
  return `M${joinNumbers([tenths(x0), tenths(y0)])}l${joinNumbers(rel)}${closed ? "z" : ""}`;
}
