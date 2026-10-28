/**
 * Basics: plain geometric forms. Eleven of them are the original Seamless
 * Patterns shapes (M3-AP12); their path data must not change.
 */
import { circle, ellipse, polygon, radial, rect, regular, roundedRect } from "../geometry";
import type { PackBuilders } from "../types";

export const basics = {
  circle: () => circle(0, 0, 48),
  ring: () => `${circle(0, 0, 48)}${circle(0, 0, 28, true)}`,
  square: () => roundedRect(-42, -42, 84, 84, 10),
  block: () => rect(-44, -44, 88, 88),
  diamond: () =>
    polygon([
      [0, -50],
      [38, 0],
      [0, 50],
      [-38, 0],
    ]),
  // Equilateral, centred on its centroid.
  triangle: () => radial(3, 50, undefined, -90),
  pentagon: () => regular(5, 50),
  hexagon: () => radial(6, 48, undefined, -90),
  octagon: () => regular(8, 50, -67.5),
  oval: () => ellipse(0, 0, 48, 32),
  semicircle: () => "M-50 22A50 50 0 0 1 50 22Z",
  pill: () => roundedRect(-50, -20, 100, 40, 20),
  plus: () =>
    polygon([
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
    ]),
  cross: () => {
    // The plus turned by 45 degrees.
    const s = Math.SQRT1_2;
    const rot = ([x, y]: readonly [number, number]): [number, number] => [(x - y) * s, (x + y) * s];
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
  },
  dots: () => `${circle(0, -26, 16)}${circle(-24, 18, 16)}${circle(24, 18, 16)}`,
} satisfies PackBuilders;
