import { describe, expect, it } from "vitest";
import {
  add,
  angle,
  distance,
  dot,
  fromAngle,
  length,
  lerp,
  normalize,
  rotate,
  scale,
  sub,
  vec2,
} from "./vec.js";

describe("vec", () => {
  const a = vec2(3, 4);
  const b = vec2(-1, 2);

  it("does basic arithmetic without mutating inputs", () => {
    expect(add(a, b)).toEqual({ x: 2, y: 6 });
    expect(sub(a, b)).toEqual({ x: 4, y: 2 });
    expect(scale(a, 2)).toEqual({ x: 6, y: 8 });
    expect(dot(a, b)).toBe(5);
    expect(a).toEqual({ x: 3, y: 4 });
    expect(b).toEqual({ x: -1, y: 2 });
  });

  it("computes length and distance", () => {
    expect(length(a)).toBe(5);
    expect(distance(a, vec2(0, 0))).toBe(5);
    expect(distance(a, a)).toBe(0);
  });

  it("normalizes and handles the zero vector", () => {
    expect(normalize(a)).toEqual({ x: 0.6, y: 0.8 });
    expect(normalize(vec2(0, 0))).toEqual({ x: 0, y: 0 });
  });

  it("interpolates linearly", () => {
    expect(lerp(vec2(0, 0), vec2(10, -10), 0)).toEqual({ x: 0, y: 0 });
    expect(lerp(vec2(0, 0), vec2(10, -10), 0.25)).toEqual({ x: 2.5, y: -2.5 });
    expect(lerp(vec2(0, 0), vec2(10, -10), 1)).toEqual({ x: 10, y: -10 });
  });

  it("rotates around the origin", () => {
    const r = rotate(vec2(1, 0), Math.PI / 2);
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(1, 12);
    expect(length(rotate(a, 1.234))).toBeCloseTo(5, 12);
  });

  it("converts between angles and vectors", () => {
    expect(angle(vec2(0, 1))).toBeCloseTo(Math.PI / 2, 12);
    expect(angle(vec2(-1, 0))).toBeCloseTo(Math.PI, 12);
    const v = fromAngle(Math.PI / 3, 2);
    expect(length(v)).toBeCloseTo(2, 12);
    expect(angle(v)).toBeCloseTo(Math.PI / 3, 12);
    expect(length(fromAngle(0.5))).toBeCloseTo(1, 12);
  });
});
