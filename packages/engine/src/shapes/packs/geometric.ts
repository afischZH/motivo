/** Geometric: outlined polygons, compound stars and faceted solids. */
import { poly, polar, rect, regular, rotatePts, shrinkPts, type Pt } from "../geometry";
import type { PackBuilders } from "../types";

const join = (parts: readonly string[]): string => parts.join("");

/** Isometric cube: three faces with small gaps (top, left, right). */
function cubeFaces(): [Pt[], Pt[], Pt[]] {
  const v = (deg: number): Pt => polar(48, deg);
  const o: Pt = [0, 0];
  const top = [v(-90), v(-30), o, v(210)];
  const left = [v(210), o, v(90), v(150)];
  const right = [o, v(-30), v(30), v(90)];
  return [shrinkPts(top, 0.92), shrinkPts(left, 0.92), shrinkPts(right, 0.92)];
}

export const geometric = {
  "hexagon-ring": () => `${regular(6, 48)}${regular(6, 28, -90, true)}`,
  "triangle-ring": () => `${regular(3, 50)}${regular(3, 24, -90, true)}`,
  "square-ring": () => `${rect(-46, -46, 92, 92)}${rect(-26, -26, 52, 52, true)}`,
  "diamond-ring": () => {
    const outer: Pt[] = [
      [0, -50],
      [40, 0],
      [0, 50],
      [-40, 0],
    ];
    return `${poly(outer)}${poly(shrinkPts(outer, 0.5), true)}`;
  },
  "octagon-ring": () => `${regular(8, 50, -67.5)}${regular(8, 30, -67.5, true)}`,
  hexagram: () => `${regular(3, 50, -90)}${regular(3, 50, 90)}`,
  octagram: () => `${regular(4, 50, -45)}${regular(4, 50, -90)}`,
  cube: () => {
    const [top, left, right] = cubeFaces();
    return { d: `${poly(top)}${poly(left)}`, accent: poly(right) };
  },
  pyramid: () => ({
    d: poly([
      [-1.5, -46],
      [-1.5, 40],
      [-48, 40],
    ]),
    accent: poly([
      [1.5, -46],
      [48, 40],
      [1.5, 40],
    ]),
  }),
  "nested-squares": () =>
    join([
      rect(-48, -48, 96, 96),
      rect(-38, -38, 76, 76, true),
      rect(-28, -28, 56, 56),
      rect(-18, -18, 36, 36, true),
      rect(-8, -8, 16, 16),
    ]),
  sierpinski: () => {
    const top: Pt = [0, -46];
    const bl: Pt = [-50, 40];
    const br: Pt = [50, 40];
    const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ml = mid(top, bl);
    const mr = mid(top, br);
    const mb = mid(bl, br);
    return join(
      [
        [top, mr, ml],
        [ml, mb, bl],
        [mr, br, mb],
      ].map((t) => poly(shrinkPts(t, 0.92))),
    );
  },
  checker: () => ({
    d: `${rect(-48, -48, 46, 46)}${rect(2, 2, 46, 46)}`,
    accent: `${rect(2, -48, 46, 46)}${rect(-48, 2, 46, 46)}`,
  }),
  "hex-cluster": () => {
    const parts = [regular(6, 16, 0)];
    for (let i = 0; i < 6; i++) {
      const [x, y] = polar(30.7, 30 + i * 60);
      parts.push(poly(regularAt(x, y, 16)));
    }
    return join(parts);
  },
  pinwheel: () => {
    const blade: Pt[] = [
      [0, 0],
      [0, -48],
      [30, -48],
    ];
    return join([0, 90, 180, 270].map((deg) => poly(rotatePts(blade, deg))));
  },
  "diamond-quad": () => {
    const diamond = (cx: number, cy: number): Pt[] => [
      [cx, cy - 22],
      [cx + 22, cy],
      [cx, cy + 22],
      [cx - 22, cy],
    ];
    return join(
      [
        [0, -25],
        [25, 0],
        [0, 25],
        [-25, 0],
      ].map(([x, y]) => poly(diamond(x as number, y as number))),
    );
  },
} satisfies PackBuilders;

/** Flat-sided hexagon (corners at 0°, 60°, ...) around (cx, cy). */
function regularAt(cx: number, cy: number, r: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 6; i++) out.push(polar(r, i * 60, cx, cy));
  return out;
}
