/**
 * Nature: leaves, flowers, weather, trees and animals. Six of them are the
 * original Seamless Patterns shapes (M3-AP12); their path data must not change.
 */
import {
  circle,
  disc,
  ellipse,
  lens,
  movePts,
  poly,
  polar,
  polygon,
  rect,
  rotatePts,
  rrect,
  strokeOutline,
  type Pt,
} from "../geometry";
import type { PackBuilders } from "../types";

/** One arm of the snowflake, pointing up: bar plus two side twigs. */
function snowArmPts(): Pt[][] {
  const bar: Pt[] = [
    [-3.5, 0],
    [3.5, 0],
    [3.5, -46],
    [-3.5, -46],
  ];
  const twig: Pt[] = [
    [-3, 0],
    [3, 0],
    [3, -16],
    [-3, -16],
  ];
  return [bar, movePts(rotatePts(twig, 45), 0, -26), movePts(rotatePts(twig, -45), 0, -26)];
}

export const nature = {
  // Pointed oval along the diagonal with a small stem.
  leaf: () => "M-44 44C-48 4 -20 -44 44 -44C44 20 -4 48 -44 44Z",
  drop: () =>
    "M0 -50C14 -28 36 -6 36 14C36 34 20 48 0 48C-20 48 -36 34 -36 14C-36 -6 -14 -28 0 -50Z",
  flower: () => {
    // Five round petals around a centre.
    const parts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const a = ((-90 + i * 72) * Math.PI) / 180;
      parts.push(circle(Math.cos(a) * 28, Math.sin(a) * 28, 21));
    }
    parts.push(circle(0, 0, 18));
    return parts.join("");
  },
  clover: () => {
    const parts: string[] = [];
    for (let i = 0; i < 4; i++) {
      const a = ((i * 90 + 45) * Math.PI) / 180;
      parts.push(circle(Math.cos(a) * 21, Math.sin(a) * 21, 25));
    }
    return parts.join("");
  },
  // Crescent: circle (9, 0, r 46) minus circle (27, 0, r 38), between their intersections.
  moon: () => "M36.67 -36.75A46 46 0 1 0 36.67 36.75A38 38 0 1 1 36.67 -36.75Z",
  sun: () => {
    const parts = [circle(0, 0, 25)];
    for (let i = 0; i < 8; i++) {
      const a = (i * 45 * Math.PI) / 180;
      const tip = [Math.cos(a) * 50, Math.sin(a) * 50] as const;
      const l = a - 0.2;
      const r = a + 0.2;
      parts.push(
        polygon([[Math.cos(l) * 31, Math.sin(l) * 31], tip, [Math.cos(r) * 31, Math.sin(r) * 31]]),
      );
    }
    return parts.join("");
  },
  cloud: () => disc(-22, 4, 20) + disc(4, -12, 26) + disc(28, 6, 18) + rrect(-46, 4, 92, 26, 13),
  mountains: () => ({
    d:
      poly([
        [-48, 40],
        [-14, -30],
        [20, 40],
      ]) +
      poly([
        [-6, 40],
        [22, -8],
        [48, 40],
      ]),
    accent: disc(30, -32, 10),
  }),
  pine: () => ({
    d:
      poly([
        [0, -48],
        [-22, -14],
        [22, -14],
      ]) +
      poly([
        [0, -32],
        [-32, 8],
        [32, 8],
      ]) +
      poly([
        [0, -12],
        [-42, 30],
        [42, 30],
      ]),
    accent: rect(-7, 30, 14, 16),
  }),
  tulip: () => ({
    d: "M-24 -32L-12 -20L0 -36L12 -20L24 -32C28 -2 18 10 0 10C-18 10 -28 -2 -24 -32Z",
    accent: rect(-3, 10, 6, 38) + lens([-3, 40], [-32, 12], 6) + lens([3, 34], [28, 14], 5),
  }),
  mushroom: () => ({
    d:
      "M-46 0C-46 -30 -24 -46 0 -46C24 -46 46 -30 46 0Z" +
      disc(-20, -18, 6, true) +
      disc(10, -32, 5, true) +
      disc(24, -12, 4, true),
    accent: rrect(-12, 4, 24, 42, 8),
  }),
  snowflake: () => {
    const parts: string[] = [];
    for (let k = 0; k < 6; k++) {
      for (const piece of snowArmPts()) parts.push(poly(rotatePts(piece, k * 60)));
    }
    return parts.join("") + poly(hexPts(9));
  },
  daisy: () => {
    const parts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -90 + i * 36;
      parts.push(lens(polar(16, a), polar(48, a), 7));
    }
    return { d: parts.join(""), accent: disc(0, 0, 13) };
  },
  branch: () => {
    const stem: Pt[] = [];
    for (let t = 0; t <= 1.0001; t += 0.1) {
      stem.push([-40 + 76 * t, 44 - 88 * t + 10 * Math.sin(t * Math.PI)]);
    }
    const leaves: string[] = [];
    const at = [0.25, 0.45, 0.65, 0.85];
    at.forEach((t, i) => {
      const x = -40 + 76 * t;
      const y = 44 - 88 * t + 10 * Math.sin(t * Math.PI);
      const side = i % 2 === 0 ? -1 : 1;
      const tip: Pt = [x + side * 22, y - 10 + side * 8];
      leaves.push(lens([x, y], tip, 6));
    });
    return strokeOutline(stem, 5) + leaves.join("");
  },
  fish: () =>
    ellipse(8, 0, 38, 24) +
    disc(30, -6, 4, true) +
    poly([
      [-22, 0],
      [-48, -24],
      [-48, 24],
    ]),
} satisfies PackBuilders;

function hexPts(r: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 6; i++) out.push(polar(r, -90 + i * 60));
  return out;
}
