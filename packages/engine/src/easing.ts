/**
 * Easing curves mapping progress t in [0, 1] to [0, 1]. Sine-based, so the
 * curves are gentle enough for colour transitions.
 */

export const EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out"] as const;
export type Easing = (typeof EASINGS)[number];

/** Applies an easing curve. `t` is clamped to [0, 1]; ends map exactly to 0 and 1. */
export function ease(easing: Easing, t: number): number {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  if (x === 0 || x === 1) return x;
  switch (easing) {
    case "linear":
      return x;
    case "ease-in":
      return 1 - Math.cos((x * Math.PI) / 2);
    case "ease-out":
      return Math.sin((x * Math.PI) / 2);
    case "ease-in-out":
      return (1 - Math.cos(x * Math.PI)) / 2;
  }
}

/** CSS timing function keywords (CSS Easing 1), as written in `animation`. */
export const CSS_TIMINGS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out"] as const;
export type CssTiming = (typeof CSS_TIMINGS)[number];

/** Control points `x1 y1 x2 y2` of the keyword curves (CSS Easing 1). */
const CSS_TIMING_CURVES: Readonly<
  Record<Exclude<CssTiming, "linear">, readonly [number, number, number, number]>
> = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/**
 * Evaluates the CSS `cubic-bezier(x1, y1, x2, y2)` timing function at input
 * progress `x` in [0, 1] (clamped): solves the curve's x(s) = x by Newton
 * steps with a bisection fallback, then returns y(s). Ends map exactly.
 */
export function cubicBezierAt(x1: number, y1: number, x2: number, y2: number, x: number): number {
  const t = x <= 0 ? 0 : x >= 1 ? 1 : x;
  if (t === 0 || t === 1) return t;
  // Polynomial coefficients of B(s) = ((a s + b) s + c) s for each axis.
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const curveX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const curveY = (s: number) => ((ay * s + by) * s + cy) * s;
  let s = t;
  for (let i = 0; i < 8; i++) {
    const err = curveX(s) - t;
    if (Math.abs(err) < 1e-7) return curveY(s);
    const slope = (3 * ax * s + 2 * bx) * s + cx;
    if (Math.abs(slope) < 1e-6) break;
    s -= err / slope;
  }
  // Bisection: x(s) is monotonic for control x values in [0, 1].
  let lo = 0;
  let hi = 1;
  s = t;
  for (let i = 0; i < 40; i++) {
    const v = curveX(s);
    if (Math.abs(v - t) < 1e-7) break;
    if (v < t) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return curveY(s);
}

/** Output progress of a CSS timing keyword at input progress `x` in [0, 1] (clamped). */
export function cssTiming(timing: CssTiming, x: number): number {
  if (timing === "linear") return x <= 0 ? 0 : x >= 1 ? 1 : x;
  const [x1, y1, x2, y2] = CSS_TIMING_CURVES[timing];
  return cubicBezierAt(x1, y1, x2, y2, x);
}
