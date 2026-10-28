/**
 * Motivo's own starter shape library for Seamless Patterns: 24 simple
 * geometric and organic motifs, drawn here from basic geometry (circles,
 * arcs, regular polygons, Bezier curves). No shapes are taken from other
 * products or icon sets.
 *
 * Every shape is a filled path in a 100 × 100 box centred on the origin
 * (x and y from -50 to 50), so the generator can place, rotate and scale it
 * with one transform. All paths fill correctly with the default nonzero
 * rule (holes run in the opposite direction).
 */
import { formatNumber } from "../../curves";

export const SEAMLESS_SHAPES = [
  "circle",
  "ring",
  "square",
  "diamond",
  "triangle",
  "hexagon",
  "star",
  "sparkle",
  "heart",
  "leaf",
  "drop",
  "wave",
  "plus",
  "cross",
  "arch",
  "flower",
  "clover",
  "moon",
  "semicircle",
  "pill",
  "chevron",
  "sun",
  "pebble",
  "dots",
] as const;

export type SeamlessShape = (typeof SEAMLESS_SHAPES)[number];

const f = (v: number): string => formatNumber(v, 2);
const pt = (x: number, y: number): string => `${f(x)} ${f(y)}`;

/** Closed polygon through points. */
function polygon(points: readonly (readonly [number, number])[]): string {
  return `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${pt(x, y)}`).join("")}Z`;
}

/** Full circle as two arcs; `reverse` runs the other way (a hole under nonzero). */
function circle(cx: number, cy: number, r: number, reverse = false): string {
  const sweep = reverse ? 1 : 0;
  const arc = `A${f(r)} ${f(r)} 0 1 ${sweep}`;
  return `M${pt(cx - r, cy)}${arc} ${pt(cx + r, cy)}${arc} ${pt(cx - r, cy)}Z`;
}

/** Regular polygon or star: alternating outer and inner radius when `inner` is set. */
function radial(n: number, outer: number, inner?: number, startDeg = -90): string {
  const points: [number, number][] = [];
  const steps = inner === undefined ? n : n * 2;
  for (let i = 0; i < steps; i++) {
    const a = ((startDeg + (360 * i) / steps) * Math.PI) / 180;
    const r = inner !== undefined && i % 2 === 1 ? inner : outer;
    points.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return polygon(points);
}

/** Rectangle with rounded corners. */
function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${pt(x + r, y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${pt(x + w, y + r)}` +
    `V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${pt(x + w - r, y + h)}` +
    `H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${pt(x, y + h - r)}` +
    `V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${pt(x + r, y)}Z`
  );
}

function build(shape: SeamlessShape): string {
  switch (shape) {
    case "circle":
      return circle(0, 0, 48);
    case "ring":
      return `${circle(0, 0, 48)}${circle(0, 0, 28, true)}`;
    case "square":
      return roundedRect(-42, -42, 84, 84, 10);
    case "diamond":
      return polygon([
        [0, -50],
        [38, 0],
        [0, 50],
        [-38, 0],
      ]);
    case "triangle":
      // Equilateral, centred on its centroid.
      return radial(3, 50, undefined, -90);
    case "hexagon":
      return radial(6, 48, undefined, -90);
    case "star":
      return radial(5, 50, 21, -90);
    case "sparkle": {
      // Four points joined by inward curves.
      const p = 50;
      const c = 9;
      return (
        `M0 ${-p}Q${pt(c, -c)} ${pt(p, 0)}Q${pt(c, c)} ${pt(0, p)}` +
        `Q${pt(-c, c)} ${pt(-p, 0)}Q${pt(-c, -c)} 0 ${-p}Z`
      );
    }
    case "heart":
      // Two arcs on top, two cubic curves down to the tip.
      return (
        "M0 -18C0 -36 -14 -46 -27 -46C-41 -46 -50 -34 -50 -20" +
        "C-50 6 -20 26 0 46C20 26 50 6 50 -20" +
        "C50 -34 41 -46 27 -46C14 -46 0 -36 0 -18Z"
      );
    case "leaf":
      // Pointed oval along the diagonal with a small stem.
      return "M-44 44C-48 4 -20 -44 44 -44C44 20 -4 48 -44 44Z";
    case "drop":
      return "M0 -50C14 -28 36 -6 36 14C36 34 20 48 0 48C-20 48 -36 34 -36 14C-36 -6 -14 -28 0 -50Z";
    case "wave": {
      // A thick sine band: top curve left to right, bottom curve back.
      const t = 12;
      return (
        `M-50 ${f(-t)}C-30 ${f(-t - 30)} -20 ${f(-t - 30)} 0 ${f(-t)}C20 ${f(-t + 30)} 30 ${f(-t + 30)} 50 ${f(-t)}` +
        `L50 ${f(t)}C30 ${f(t + 30)} 20 ${f(t + 30)} 0 ${f(t)}C-20 ${f(t - 30)} -30 ${f(t - 30)} -50 ${f(t)}Z`
      );
    }
    case "plus":
      return polygon([
        [-14, -48],
        [14, -48],
        [14, -14],
        [48, -14],
        [48, 14],
        [14, 14],
        [14, 48],
        [-14, 48],
        [-14, 14],
        [-48, 14],
        [-48, -14],
        [-14, -14],
      ]);
    case "cross": {
      // The plus turned by 45 degrees.
      const s = Math.SQRT1_2;
      const rot = ([x, y]: readonly [number, number]): [number, number] => [
        (x - y) * s,
        (x + y) * s,
      ];
      return polygon(
        (
          [
            [-11, -54],
            [11, -54],
            [11, -11],
            [54, -11],
            [54, 11],
            [11, 11],
            [11, 54],
            [-11, 54],
            [-11, 11],
            [-54, 11],
            [-54, -11],
            [-11, -11],
          ] as const
        ).map(rot),
      );
    }
    case "arch":
      // Rainbow arch: outer half ring standing on its feet.
      return "M-50 20A50 50 0 0 1 50 20L50 30L26 30L26 20A26 26 0 0 0 -26 20L-26 30L-50 30Z";
    case "flower": {
      // Five round petals around a centre.
      const parts: string[] = [];
      for (let i = 0; i < 5; i++) {
        const a = ((-90 + i * 72) * Math.PI) / 180;
        parts.push(circle(Math.cos(a) * 28, Math.sin(a) * 28, 21));
      }
      parts.push(circle(0, 0, 18));
      return parts.join("");
    }
    case "clover": {
      const parts: string[] = [];
      for (let i = 0; i < 4; i++) {
        const a = ((i * 90 + 45) * Math.PI) / 180;
        parts.push(circle(Math.cos(a) * 21, Math.sin(a) * 21, 25));
      }
      return parts.join("");
    }
    case "moon":
      // Crescent: circle (9, 0, r 46) minus circle (27, 0, r 38), between their intersections.
      return "M36.67 -36.75A46 46 0 1 0 36.67 36.75A38 38 0 1 1 36.67 -36.75Z";
    case "semicircle":
      return "M-50 22A50 50 0 0 1 50 22Z";
    case "pill":
      return roundedRect(-50, -20, 100, 40, 20);
    case "chevron":
      return polygon([
        [-50, -10],
        [0, -40],
        [50, -10],
        [50, 14],
        [0, -16],
        [-50, 14],
      ]);
    case "sun": {
      const parts = [circle(0, 0, 25)];
      for (let i = 0; i < 8; i++) {
        const a = (i * 45 * Math.PI) / 180;
        const tip = [Math.cos(a) * 50, Math.sin(a) * 50] as const;
        const l = a - 0.2;
        const r = a + 0.2;
        parts.push(
          polygon([
            [Math.cos(l) * 31, Math.sin(l) * 31],
            tip,
            [Math.cos(r) * 31, Math.sin(r) * 31],
          ]),
        );
      }
      return parts.join("");
    }
    case "pebble":
      // A soft, slightly irregular closed curve.
      return "M-6 -44C22 -48 46 -32 46 -6C46 22 28 44 0 44C-30 44 -48 26 -46 2C-44 -24 -30 -40 -6 -44Z";
    case "dots":
      return `${circle(0, -26, 16)}${circle(-24, 18, 16)}${circle(24, 18, 16)}`;
  }
}

const cache = new Map<SeamlessShape, string>();

/** Path data of a built-in shape (100 × 100 box centred on the origin). */
export function seamlessShapePath(shape: SeamlessShape): string {
  let d = cache.get(shape);
  if (d === undefined) {
    d = build(shape);
    cache.set(shape, d);
  }
  return d;
}
