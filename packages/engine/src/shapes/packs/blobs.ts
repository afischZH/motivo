/**
 * Abstract blobs: smooth closed curves through points at seeded random
 * radii (fixed seeds, so every blob is the same on every run), scaled to
 * fill the box.
 */
import { createRng } from "../../rng";
import { smooth, type Pt } from "../geometry";
import { pathBounds } from "../path-data";
import type { PackBuilders } from "../types";

/** Unit blob: `n` points at radius 0.6..1 around (cx, cy) times `scale`. */
function blobPts(seed: number, n: number, scale = 1, cx = 0, cy = 0): Pt[] {
  const rng = createRng(seed);
  const pts: Pt[] = [];
  const turn = rng.next() * 360;
  for (let i = 0; i < n; i++) {
    const deg = ((turn + (360 * (i + (rng.next() - 0.5) * 0.4)) / n) * Math.PI) / 180;
    const r = (0.6 + rng.next() * 0.4) * scale;
    pts.push([cx + Math.cos(deg) * r, cy + Math.sin(deg) * r]);
  }
  return pts;
}

/**
 * Scales and moves all point groups together so their curves fill the box
 * (longer side 94 units, centred). Catmull-Rom curves follow
 * their points under such a transform, so the result is exact.
 */
function fit(groups: readonly { pts: Pt[]; hole?: boolean }[]): string {
  const outline = groups.map((g) => smooth(g.pts, 0.5, g.hole)).join("");
  const b = pathBounds(outline);
  const k = 94 / Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return groups
    .map((g) =>
      smooth(
        g.pts.map(([x, y]): Pt => [(x - cx) * k, (y - cy) * k]),
        0.5,
        g.hole,
      ),
    )
    .join("");
}

const single = (seed: number, n: number) => () => fit([{ pts: blobPts(seed, n) }]);

export const blobs = {
  "blob-1": single(101, 5),
  "blob-2": single(202, 6),
  "blob-3": single(303, 7),
  "blob-4": single(404, 8),
  "blob-5": single(505, 6),
  "blob-6": single(606, 9),
  "blob-7": single(707, 5),
  "blob-8": single(808, 7),
  "blob-9": single(909, 8),
  "blob-10": single(1010, 6),
  "blob-11": () =>
    fit([{ pts: blobPts(1111, 8) }, { pts: blobPts(1112, 7, 0.34, 0.02, -0.02), hole: true }]),
  "blob-12": () =>
    fit([
      { pts: blobPts(1212, 7, 0.62, -0.18, -0.14) },
      { pts: blobPts(1213, 6, 0.36, 0.5, 0.42) },
    ]),
} satisfies PackBuilders;
