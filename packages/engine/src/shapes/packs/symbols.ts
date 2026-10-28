/** Symbols: simple signs without letters, emoji or brand marks. */
import {
  annulus,
  disc,
  poly,
  polar,
  pt,
  rrect,
  roundedPoly,
  strokeOutline,
  type Pt,
} from "../geometry";
import type { PackBuilders } from "../types";

export const symbols = {
  // Two arcs on top, two cubic curves down to the tip.
  heart: () =>
    "M0 -18C0 -36 -14 -46 -27 -46C-41 -46 -50 -34 -50 -20" +
    "C-50 6 -20 26 0 46C20 26 50 6 50 -20" +
    "C50 -34 41 -46 27 -46C14 -46 0 -36 0 -18Z",
  check: () =>
    poly([
      [-46, 2],
      [-32, -12],
      [-12, 8],
      [32, -36],
      [46, -22],
      [-12, 36],
    ]),
  "double-ring": () => annulus(-22, 0, 11, 25) + annulus(22, 0, 11, 25),
  eye: () => ({
    d: `M-48 0A60 60 0 0 1 48 0A60 60 0 0 1 -48 0Z${disc(0, 0, 17, true)}`,
    accent: disc(0, 0, 10),
  }),
  hourglass: () =>
    poly([
      [-34, -46],
      [34, -46],
      [34, -40],
      [6, 0],
      [34, 40],
      [34, 46],
      [-34, 46],
      [-34, 40],
      [-6, 0],
      [-34, -40],
    ]),
  pin: () =>
    `M0 48C-10 30 -36 8 -36 -12A36 36 0 0 1 36 -12C36 8 10 30 0 48Z${disc(0, -12, 14, true)}`,
  bookmark: () =>
    poly([
      [-28, -48],
      [28, -48],
      [28, 48],
      [0, 26],
      [-28, 48],
    ]),
  shield: () => "M0 -48L40 -36C40 6 28 30 0 48C-28 30 -40 6 -40 -36Z",
  keyhole: () => {
    // Round top and tapered slot as one counter-clockwise hole.
    const [lx, ly] = polar(13, 115, 0, -10);
    const [rx, ry] = polar(13, 65, 0, -10);
    return disc(0, 0, 48) + `M${pt(lx, ly)}L-12 30L12 30L${pt(rx, ry)}A13 13 0 1 0 ${pt(lx, ly)}Z`;
  },
  speech: () =>
    rrect(-46, -42, 92, 64, 16) +
    poly([
      [-24, 16],
      [-2, 16],
      [-30, 46],
    ]),
  play: () =>
    roundedPoly(
      [
        [-38, -44],
        [40, 0],
        [-38, 44],
      ],
      8,
    ),
  house: () =>
    poly([
      [0, -46],
      [46, -6],
      [36, -6],
      [36, 44],
      [10, 44],
      [10, 16],
      [-10, 16],
      [-10, 44],
      [-36, 44],
      [-36, -6],
      [-46, -6],
    ]),
  spiral: () => {
    const center: Pt[] = [];
    for (let deg = 0; deg <= 3.2 * 180; deg += 15) {
      const r = 5 + (12 * deg) / 180;
      center.push(polar(r, deg - 90));
    }
    return strokeOutline(center, 9);
  },
} satisfies PackBuilders;
