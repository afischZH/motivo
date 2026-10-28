/** Arrows and lines: arrows, chevrons, stripes, zigzags and waves. */
import {
  band,
  f,
  movePts,
  poly,
  polygon,
  rotatePts,
  rrect,
  strokeOutline,
  type Pt,
} from "../geometry";
import type { PackBuilders } from "../types";

/** A thick sine-like band around y0: half thickness `t`, curve amplitude `amp`. */
function waveBand(y0: number, t: number, amp: number): string {
  const a = y0 - t;
  const b = y0 + t;
  return (
    `M-50 ${f(a)}C-30 ${f(a - amp)} -20 ${f(a - amp)} 0 ${f(a)}C20 ${f(a + amp)} 30 ${f(a + amp)} 50 ${f(a)}` +
    `L50 ${f(b)}C30 ${f(b + amp)} 20 ${f(b + amp)} 0 ${f(b)}C-20 ${f(b - amp)} -30 ${f(b - amp)} -50 ${f(b)}Z`
  );
}

const ARROW: Pt[] = [
  [-46, -10],
  [10, -10],
  [10, -30],
  [48, 0],
  [10, 30],
  [10, 10],
  [-46, 10],
];

/** Thin chevron pointing up, `y` = height of its tip. */
const chevronPts = (y: number): Pt[] => [
  [-46, y + 28],
  [0, y],
  [46, y + 28],
  [46, y + 42],
  [0, y + 14],
  [-46, y + 42],
];

export const lines = {
  chevron: () =>
    polygon([
      [-50, -10],
      [0, -40],
      [50, -10],
      [50, 14],
      [0, -16],
      [-50, 14],
    ]),
  wave: () => {
    // A thick sine band: top curve left to right, bottom curve back.
    const t = 12;
    return (
      `M-50 ${f(-t)}C-30 ${f(-t - 30)} -20 ${f(-t - 30)} 0 ${f(-t)}C20 ${f(-t + 30)} 30 ${f(-t + 30)} 50 ${f(-t)}` +
      `L50 ${f(t)}C30 ${f(t + 30)} 20 ${f(t + 30)} 0 ${f(t)}C-20 ${f(t - 30)} -30 ${f(t - 30)} -50 ${f(t)}Z`
    );
  },
  arrow: () => poly(ARROW),
  "arrow-diagonal": () => poly(rotatePts(ARROW, -45)),
  "arrow-double": () =>
    poly([
      [-48, 0],
      [-20, -28],
      [-20, -10],
      [20, -10],
      [20, -28],
      [48, 0],
      [20, 28],
      [20, 10],
      [-20, 10],
      [-20, 28],
    ]),
  "arrow-turn": () =>
    band(-8, 8, 22, 38, 180, 360) +
    poly([
      [2, 6],
      [42, 6],
      [22, 36],
    ]),
  "double-chevron": () => `${poly(chevronPts(-38))}${poly(chevronPts(-4))}`,
  caret: () =>
    poly([
      [-20, -46],
      [-4, -46],
      [30, 0],
      [-4, 46],
      [-20, 46],
      [14, 0],
    ]),
  stripes: () => [-40, -8, 24].map((y) => rrect(-48, y, 96, 16, 8)).join(""),
  slashes: () =>
    [-26, 0, 26]
      .map((o) =>
        poly([
          [o - 22, 46],
          [o + 8, -46],
          [o + 20, -46],
          [o - 10, 46],
        ]),
      )
      .join(""),
  zigzag: () => {
    const zig: Pt[] = [
      [-48, 10],
      [-24, -14],
      [0, 10],
      [24, -14],
      [48, 10],
    ];
    return poly([...movePts(zig, 0, -9), ...movePts(zig, 0, 9).reverse()]);
  },
  "wave-double": () => `${waveBand(-18, 5, 16)}${waveBand(18, 5, 16)}`,
  squiggle: () => {
    const center: Pt[] = [];
    for (let x = -42; x <= 42; x += 3.5) {
      center.push([x, 16 * Math.sin((x / 84) * 3 * 2 * Math.PI)]);
    }
    return strokeOutline(center, 11);
  },
  dashes: () => rrect(-46, -24, 40, 14, 7) + rrect(6, -24, 40, 14, 7) + rrect(-20, 10, 40, 14, 7),
} satisfies PackBuilders;
