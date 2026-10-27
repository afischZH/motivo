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
