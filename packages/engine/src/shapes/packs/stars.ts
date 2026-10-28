/** Stars and sparkles: pointed stars, bursts, seals and twinkles. */
import {
  movePts,
  poly,
  polar,
  pt,
  radial,
  radialPts,
  rotatePts,
  roundedPoly,
  star,
  type Pt,
} from "../geometry";
import type { PackBuilders } from "../types";

/** Four points joined by inward curves (control points at ±c), around (cx, cy). */
function sparkleAt(cx: number, cy: number, p: number, c: number): string {
  const q = (x: number, y: number) => pt(cx + x, cy + y);
  return (
    `M${q(0, -p)}Q${q(c, -c)} ${q(p, 0)}Q${q(c, c)} ${q(0, p)}` +
    `Q${q(-c, c)} ${q(-p, 0)}Q${q(-c, -c)} ${q(0, -p)}Z`
  );
}

/** Points at alternating radii joined by inward curves through a small inner radius. */
function curvedStar(radii: readonly number[], inner: number): string {
  const n = radii.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const deg = -90 + (360 * i) / n;
    const [x, y] = polar(radii[i] as number, deg);
    const [cx, cy] = polar(inner, deg + 180 / n);
    const [nx, ny] = polar(radii[(i + 1) % n] as number, deg + 360 / n);
    d += `${i === 0 ? `M${pt(x, y)}` : ""}Q${pt(cx, cy)} ${pt(nx, ny)}`;
  }
  return `${d}Z`;
}

export const stars = {
  star: () => radial(5, 50, 21, -90),
  sparkle: () => {
    // Four points joined by inward curves.
    const p = 50;
    const c = 9;
    return (
      `M0 ${-p}Q${pt(c, -c)} ${pt(p, 0)}Q${pt(c, c)} ${pt(0, p)}` +
      `Q${pt(-c, c)} ${pt(-p, 0)}Q${pt(-c, -c)} 0 ${-p}Z`
    );
  },
  "star-4": () => star(4, 50, 16),
  "star-6": () => star(6, 50, 26),
  "star-8": () => star(8, 50, 24),
  burst: () => star(12, 50, 36),
  seal: () => star(24, 50, 42),
  "sparkle-slim": () => sparkleAt(0, 0, 50, 3),
  sparkles: () => sparkleAt(-8, 8, 38, 7) + sparkleAt(30, -30, 16, 3) + sparkleAt(32, 32, 10, 2),
  asterisk: () => {
    const bar: Pt[] = [
      [-7, -48],
      [7, -48],
      [7, 48],
      [-7, 48],
    ];
    return [0, 60, 120].map((deg) => roundedPoly(rotatePts(bar, deg), 6)).join("");
  },
  "star-round": () => roundedPoly(radialPts(5, 52, 24), 7),
  "star-ring": () => `${star(5, 50, 21)}${star(5, 28, 11.76, -90, true)}`,
  twinkle: () => curvedStar([50, 24, 50, 24, 50, 24, 50, 24], 7),
  "star-trio": () =>
    [
      [-24, -20],
      [24, -14],
      [0, 26],
    ]
      .map(([x, y]) => poly(movePts(radialPts(5, 20, 8.4), x as number, y as number)))
      .join(""),
  "shooting-star": () =>
    poly(movePts(radialPts(5, 24, 10), 22, -22)) +
    poly([
      [6, -20],
      [18, -6],
      [-46, 46],
    ]),
} satisfies PackBuilders;
