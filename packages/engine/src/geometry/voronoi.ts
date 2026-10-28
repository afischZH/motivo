/**
 * Voronoi cells clipped to a rectangle, by half-plane clipping: each cell
 * starts as the rectangle and is cut by the perpendicular bisector to other
 * sites, nearest first (rings of a uniform grid). A site farther away than
 * twice the cell's current radius cannot cut it any more ("security radius"),
 * which ends the search. No Delaunay step, so there is no hull special case:
 * the cells tile the rectangle exactly (up to floating point).
 */
import { clipPolygonHalfPlane, rectPolygon, type Rect } from "./polygon";
import type { Vec2 } from "../vec";

/**
 * One convex cell per site, vertices clockwise on screen, in site order.
 * Sites outside the rectangle can get an empty cell. Duplicate sites share
 * the cell of the first one (the later ones get an empty list).
 */
export function voronoiCells(sites: readonly Vec2[], bounds: Rect): Vec2[][] {
  const n = sites.length;
  const w = bounds.x1 - bounds.x0;
  const h = bounds.y1 - bounds.y0;
  if (n === 0 || !(w > 0) || !(h > 0)) return sites.map(() => []);

  // Grid of about two sites per cell over the sites' own bounding box.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of sites) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) {
      throw new RangeError("voronoiCells: sites must be finite");
    }
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x);
    maxY = Math.max(maxY, s.y);
  }
  const gw = Math.max(maxX - minX, 1e-9);
  const gh = Math.max(maxY - minY, 1e-9);
  const cell = Math.max(Math.sqrt((gw * gh * 2) / n), 1e-9);
  const cols = Math.max(1, Math.ceil(gw / cell) + 1);
  const rows = Math.max(1, Math.ceil(gh / cell) + 1);
  const buckets: number[][] = Array.from({ length: cols * rows }, () => []);
  const colOf = (x: number): number => Math.min(cols - 1, Math.floor((x - minX) / cell));
  const rowOf = (y: number): number => Math.min(rows - 1, Math.floor((y - minY) / cell));
  sites.forEach((s, i) => buckets[rowOf(s.y) * cols + colOf(s.x)]?.push(i));

  const base = rectPolygon(bounds);
  const cells: Vec2[][] = [];
  for (let i = 0; i < n; i++) {
    const s = sites[i] as Vec2;
    const c0 = colOf(s.x);
    const r0 = rowOf(s.y);
    let poly: Vec2[] = base.slice();
    let empty = false;
    const maxRing = Math.max(cols, rows);
    for (let ring = 0; ring <= maxRing && poly.length > 0; ring++) {
      for (let r = r0 - ring; r <= r0 + ring; r++) {
        if (r < 0 || r >= rows) continue;
        const onEdgeRow = r === r0 - ring || r === r0 + ring;
        for (let c = c0 - ring; c <= c0 + ring; c += onEdgeRow ? 1 : 2 * ring) {
          if (c < 0 || c >= cols) {
            if (ring === 0) break;
            continue;
          }
          for (const j of buckets[r * cols + c] ?? []) {
            if (j === i) continue;
            const o = sites[j] as Vec2;
            const dx = o.x - s.x;
            const dy = o.y - s.y;
            if (dx === 0 && dy === 0) {
              if (j < i) empty = true;
              continue;
            }
            // Keep points closer to s: (p - m)·(o - s) <= 0.
            const mx = (s.x + o.x) / 2;
            const my = (s.y + o.y) / 2;
            poly = clipPolygonHalfPlane(poly, dx, dy, dx * mx + dy * my);
            if (poly.length === 0) break;
          }
          if (ring === 0) break;
        }
      }
      if (empty) {
        poly = [];
        break;
      }
      // Every site in later rings is at least `ring · cell` away.
      let reach = 0;
      for (const p of poly) reach = Math.max(reach, Math.hypot(p.x - s.x, p.y - s.y));
      if (ring * cell >= 2 * reach) break;
    }
    cells.push(poly);
  }
  return cells;
}
