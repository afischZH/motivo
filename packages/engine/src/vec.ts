/**
 * Immutable 2D vector helpers. Every function returns a new object and never
 * mutates its arguments.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, factor: number): Vec2 {
  return { x: v.x * factor, y: v.y * factor };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/** Unit vector in the direction of `v`; the zero vector stays `{ x: 0, y: 0 }`. */
export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Linear interpolation: `t = 0` gives `a`, `t = 1` gives `b` (not clamped). */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Rotates `v` by `radians` around the origin (counter-clockwise in a y-up system). */
export function rotate(v: Vec2, radians: number): Vec2 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** Angle of `v` in radians in (-PI, PI], measured from the positive x axis. */
export function angle(v: Vec2): number {
  return Math.atan2(v.y, v.x);
}

/** Vector of the given length (default 1) pointing at `radians`. */
export function fromAngle(radians: number, len = 1): Vec2 {
  return { x: Math.cos(radians) * len, y: Math.sin(radians) * len };
}
