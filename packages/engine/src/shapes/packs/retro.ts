/** Retro: rainbows, sunsets, flower power, records and other 60s/70s forms. */
import {
  band,
  circleSlice,
  disc,
  ellipse,
  poly,
  polar,
  radialPts,
  rect,
  roundedPoly,
  rrect,
  smooth,
  type Pt,
} from "../geometry";
import type { PackBuilders } from "../types";

export const retro = {
  // Rainbow arch: outer half ring standing on its feet.
  arch: () => "M-50 20A50 50 0 0 1 50 20L50 30L26 30L26 20A26 26 0 0 0 -26 20L-26 30L-50 30Z",
  rainbow: () => ({
    d: band(0, 25, 38, 50, 180, 360) + band(0, 25, 12, 22, 180, 360),
    accent: band(0, 25, 25, 35, 180, 360),
  }),
  sunrise: () => {
    const rays: string[] = [];
    for (let i = 0; i < 7; i++) {
      const a = 202.5 + 22.5 * i;
      rays.push(poly([polar(32, a - 5, 0, 22), polar(48, a, 0, 22), polar(32, a + 5, 0, 22)]));
    }
    // Horizon bar under a half sun.
    return `M-26 22A26 26 0 0 1 26 22Z${rays.join("")}${rect(-48, 26, 96, 8)}`;
  },
  sunset: () =>
    [
      [-46, -14],
      [-8, 12],
      [18, 31],
      [37, 45],
    ]
      .map(([a, b]) => circleSlice(46, a as number, b as number))
      .join(""),
  "flower-power": () => {
    const parts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const [x, y] = polar(30, -90 + i * 60);
      parts.push(disc(x, y, 17));
    }
    return `${parts.join("")}${disc(0, 0, 16)}${disc(0, 0, 10, true)}${disc(0, 0, 5)}`;
  },
  "groovy-star": () => roundedPoly(radialPts(6, 52, 24), 10),
  bolt: () =>
    poly([
      [10, -48],
      [-26, 4],
      [-2, 4],
      [-10, 48],
      [28, -10],
      [4, -10],
      [20, -48],
    ]),
  tv: () =>
    rrect(-48, -36, 96, 72, 14) +
    rrect(-38, -26, 60, 52, 10, true) +
    disc(35, -10, 5, true) +
    disc(35, 8, 5, true),
  boomerang: () =>
    smooth([
      [-44, -34],
      [-30, -42],
      [0, -14],
      [30, -42],
      [44, -34],
      [10, 24],
      [0, 30],
      [-10, 24],
    ]),
  orbit: () =>
    ellipse(0, 0, 48, 18, 30) +
    ellipse(0, 0, 40, 10, 30, true) +
    ellipse(0, 0, 48, 18, -30) +
    ellipse(0, 0, 40, 10, -30, true) +
    disc(0, 0, 9),
  "pill-stack": () =>
    rrect(-46, -40, 70, 22, 11) + rrect(-24, -11, 70, 22, 11) + rrect(-46, 18, 70, 22, 11),
  record: () => ({
    d:
      disc(0, 0, 48) +
      disc(0, 0, 39, true) +
      disc(0, 0, 36) +
      disc(0, 0, 29, true) +
      disc(0, 0, 26) +
      disc(0, 0, 15, true),
    accent: disc(0, 0, 11),
  }),
  "wavy-circle": () => {
    const pts: Pt[] = [];
    for (let i = 0; i < 24; i++) pts.push(polar(i % 2 === 0 ? 47 : 41, -90 + i * 15));
    return smooth(pts);
  },
} satisfies PackBuilders;
