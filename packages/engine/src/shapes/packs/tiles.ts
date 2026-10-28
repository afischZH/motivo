/**
 * Tiles and quarters: shapes that fill the whole box and meet its edges at
 * fixed points (corners, edge midpoints), so quarter turns of neighbouring
 * cells join up (Truchet-style grids). Every shape of this pack is marked
 * `tile` in the library.
 */
import { band, clipHalfPlane, poly, rect, sector, squarePts } from "../geometry";
import type { PackBuilders } from "../types";

const H = 50;

export const tiles = {
  "quarter-circle": () => sector(-H, -H, 100, 0, 90),
  "quarter-cutout": () => "M50 -50L50 50L-50 50A100 100 0 0 0 50 -50Z",
  "truchet-arcs": () => band(-H, -H, 40, 60, 0, 90) + band(H, H, 40, 60, 180, 270),
  "truchet-discs": () => sector(-H, -H, 50, 0, 90) + sector(H, H, 50, 180, 270),
  "arc-band": () => band(H, -H, 38, 62, 90, 180),
  "diagonal-half": () =>
    poly([
      [-H, -H],
      [H, -H],
      [-H, H],
    ]),
  "diagonal-band": () =>
    poly([
      [-H, H],
      [-H, 22],
      [22, -H],
      [H, -H],
      [H, -22],
      [-22, H],
    ]),
  "diagonal-stripes": () =>
    [-50, 50]
      .map((c) => {
        // Band c - 15 <= x + y <= c + 15, clipped to the box.
        const upper = clipHalfPlane(squarePts(H), 1, 1, c + 15);
        return poly(clipHalfPlane(upper, -1, -1, -(c - 15)));
      })
      .join(""),
  "half-rect": () => rect(-H, -H, 100, 50),
  "corner-square": () => rect(-H, -H, 50, 50),
  "checker-tile": () => rect(-H, -H, 50, 50) + rect(0, 0, 50, 50),
  bridge: () => sector(0, H, 50, 180, 360),
  "edge-dots": () =>
    sector(0, -H, 22, 0, 180) +
    sector(H, 0, 22, 90, 270) +
    sector(0, H, 22, 180, 360) +
    sector(-H, 0, 22, 270, 450),
  "corner-dots": () =>
    sector(-H, -H, 26, 0, 90) +
    sector(H, -H, 26, 90, 180) +
    sector(H, H, 26, 180, 270) +
    sector(-H, H, 26, 270, 360),
  "plus-band": () =>
    poly([
      [-12, -H],
      [12, -H],
      [12, -12],
      [H, -12],
      [H, 12],
      [12, 12],
      [12, H],
      [-12, H],
      [-12, 12],
      [-H, 12],
      [-H, -12],
      [-12, -12],
    ]),
  "t-band": () =>
    poly([
      [-H, -12],
      [H, -12],
      [H, 12],
      [12, 12],
      [12, H],
      [-12, H],
      [-12, 12],
      [-H, 12],
    ]),
  "wave-band": () => "M-50 -12C-20 -42 20 18 50 -12L50 12C20 42 -20 -18 -50 12Z",
  "corner-triangle": () =>
    poly([
      [-H, -H],
      [10, -H],
      [-H, 10],
    ]),
} satisfies PackBuilders;
