/** Decorative: ornaments, rosettes, lace and tile motifs. */
import {
  annulus,
  f,
  pt,
  disc,
  lens,
  poly,
  polar,
  regular,
  roundedPoly,
  smooth,
  star,
  type Pt,
} from "../geometry";
import type { PackBuilders } from "../types";

/** Ring of `n` lens petals from radius r0 to r1, starting at `start` degrees. */
function petals(n: number, r0: number, r1: number, bulge: number, start = -90): string {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = start + (360 * i) / n;
    parts.push(lens(polar(r0, a), polar(r1, a), bulge));
  }
  return parts.join("");
}

export const decorative = {
  quatrefoil: () => [0, 90, 180, 270].map((a) => disc(...polar(22, a), 24)).join(""),
  trefoil: () => [-90, 30, 150].map((a) => disc(...polar(22, a, 0, 6), 24)).join(""),
  rosette: () => petals(12, 6, 48, 7) + disc(0, 0, 16),
  scallop: () => {
    // Shell fan: rounded bumps along the rim, ribs cut out as thin lenses.
    const cy = 34;
    const n = 7;
    const a0 = 215;
    const step = 110 / n;
    const chord = 2 * 52 * Math.sin(((step / 2) * Math.PI) / 180);
    let d = `M${pt(0, cy)}L${pt(...polar(52, a0, 0, cy))}`;
    for (let i = 1; i <= n; i++) {
      d += `A${f(chord / 2)} ${f(chord / 2)} 0 0 1 ${pt(...polar(52, a0 + i * step, 0, cy))}`;
    }
    d += "Z";
    for (let i = 1; i < n; i++) {
      const a = a0 + i * step;
      d += lens(polar(14, a, 0, cy), polar(44, a, 0, cy), 1.6, true);
    }
    return d;
  },
  ogee: () => "M0 -48C6 -30 40 -20 40 10L40 46L-40 46L-40 10C-40 -20 -6 -30 0 -48Z",
  zellige: () => ({
    d: `${star(8, 50, 38.27)}${regular(8, 22, -67.5, true)}`,
    accent: disc(0, 0, 11),
  }),
  medallion: () => {
    const outer: Pt[] = [];
    for (let i = 0; i < 32; i++) outer.push(polar(i % 2 === 0 ? 48 : 43, -90 + i * 11.25));
    return {
      d: smooth(outer) + disc(0, 0, 35, true) + disc(0, 0, 28) + disc(0, 0, 19, true),
      accent: disc(0, 0, 11),
    };
  },
  fleuron: () =>
    lens([0, 18], [0, -48], 12) +
    lens([-4, 18], [-44, -14], 9) +
    lens([4, 18], [44, -14], 9) +
    disc(0, 22, 8) +
    poly([
      [-18, 44],
      [18, 44],
      [8, 26],
      [-8, 26],
    ]),
  paisley: () =>
    smooth([
      [6, 46],
      [-22, 40],
      [-38, 18],
      [-36, -8],
      [-20, -28],
      [2, -40],
      [26, -46],
      [42, -42],
      [32, -34],
      [18, -26],
      [22, -6],
      [28, 18],
      [22, 36],
    ]) + disc(-10, 14, 8, true),
  damask: () =>
    "M0 -48Q8 -8 40 0Q8 8 0 48Q-8 8 -40 0Q-8 -8 0 -48Z" +
    [45, 135, 225, 315].map((a) => disc(...polar(40, a), 6)).join(""),
  "lace-ring": () => {
    const parts = [annulus(0, 0, 25, 32)];
    for (let i = 0; i < 12; i++) parts.push(disc(...polar(38, i * 30), 8));
    return parts.join("");
  },
  bow: () =>
    roundedPoly(
      [
        [-4, 0],
        [-46, -28],
        [-46, 28],
      ],
      6,
    ) +
    roundedPoly(
      [
        [4, 0],
        [46, 28],
        [46, -28],
      ],
      6,
    ) +
    disc(0, 0, 11),
  mandala: () => petals(8, 14, 48, 10) + petals(8, 14, 34, 6, -67.5) + annulus(0, 0, 5, 11),
} satisfies PackBuilders;
