/** Organic: soft hand-drawn looking forms, pebbles, cells and seeds. */
import { disc, radialSmooth, smooth, strokeOutline, type Pt } from "../geometry";
import type { PackBuilders } from "../types";

const RAD = Math.PI / 180;

export const organic = {
  // A soft, slightly irregular closed curve.
  pebble: () =>
    "M-6 -44C22 -48 46 -32 46 -6C46 22 28 44 0 44C-30 44 -48 26 -46 2C-44 -24 -30 -40 -6 -44Z",
  bean: () =>
    smooth([
      [-44, -6],
      [-32, -32],
      [0, -40],
      [32, -32],
      [46, -6],
      [36, 22],
      [14, 30],
      [0, 20],
      [-14, 30],
      [-36, 22],
    ]),
  egg: () => radialSmooth(12, (deg) => 1 + 0.16 * Math.cos(deg * RAD), 34, 42),
  cell: () =>
    radialSmooth(10, (deg) => 46 + 3 * Math.sin(deg * 3 * RAD)) +
    radialSmooth(9, (deg) => 32 + 3 * Math.cos(deg * 2 * RAD), 1, 1, 0, 0, true) +
    disc(8, -6, 11),
  worm: () =>
    strokeOutline(
      [
        [-38, 34],
        [-30, 10],
        [-10, 2],
        [8, 8],
        [26, 2],
        [32, -20],
        [24, -38],
      ],
      18,
    ),
  puddle: () =>
    radialSmooth(
      14,
      (deg) => 41 + 5 * Math.sin(deg * 3 * RAD) + 3 * Math.cos(deg * 5 * RAD),
      1.02,
      0.7,
    ),
  petal: () => "M0 -48Q56 0 0 48Q-56 0 0 -48Z",
  seed: () => "M0 -48C36 -30 34 30 0 48C-20 30 -22 -20 0 -48Z",
  comma: () =>
    smooth([
      [-6, -44],
      [18, -42],
      [32, -24],
      [30, 0],
      [16, 22],
      [-8, 38],
      [-34, 46],
      [-18, 28],
      [-12, 10],
      [-24, -8],
      [-22, -32],
    ]),
  spots: () =>
    radialSmooth(7, (deg) => 1 + 0.12 * Math.sin(deg * 2 * RAD), 22, 18, -20, -20) +
    radialSmooth(7, (deg) => 1 + 0.15 * Math.cos(deg * 3 * RAD), 15, 13, 26, -8) +
    radialSmooth(7, (deg) => 1 + 0.1 * Math.sin(deg * 3 * RAD), 13, 15, -4, 30),
  "twin-pebbles": () =>
    radialSmooth(8, (deg) => 1 + 0.08 * Math.sin(deg * 2 * RAD), 22, 30, -22, -14) +
    radialSmooth(8, (deg) => 1 + 0.08 * Math.cos(deg * 2 * RAD), 20, 24, 24, 20),
  "wobble-ring": () =>
    radialSmooth(15, (deg) => 46 + 2.5 * Math.sin(deg * 5 * RAD)) +
    radialSmooth(12, (deg) => 25 + 3 * Math.sin(deg * 4 * RAD + 1), 1, 1, 0, 0, true),
  splat: () => {
    const pts: Pt[] = [];
    for (let i = 0; i < 16; i++) {
      const deg = -90 + i * 22.5;
      const r = i % 2 === 0 ? 46 - (i % 4) * 2 : 32;
      pts.push([Math.cos(deg * RAD) * r, Math.sin(deg * RAD) * r]);
    }
    return smooth(pts);
  },
} satisfies PackBuilders;
