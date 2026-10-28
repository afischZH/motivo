/**
 * Non-overlapping disks of several size classes by dart throwing (random
 * candidates, rejected when they touch an earlier disk), largest class first,
 * with a uniform grid for the neighbour checks. Optionally on a torus, so a
 * disk that crosses an edge continues on the opposite side (seamless tiles).
 */
import type { Rng } from "../rng";

/** Upper bound of grid cells (memory and set-up time stay small). */
const MAX_GRID_CELLS = 65_536;

export interface DiskClass {
  /** Largest radius of the class in px. */
  readonly radius: number;
  /** Radii are drawn from `[radius·(1 - variance), radius]`, variance in [0, 1). */
  readonly variance: number;
  /** Target number of disks; fewer when the space runs out. */
  readonly count: number;
}

export interface ScatterDisksOptions {
  readonly width: number;
  readonly height: number;
  /** Size classes, placed in this order (put the largest first). */
  readonly classes: readonly DiskClass[];
  /** Minimum free space between two disks in px. */
  readonly gap: number;
  /**
   * Torus: positions in [0, width) × [0, height), distances wrap around.
   * Otherwise centres lie in the rectangle grown by the disk's radius, so
   * disks are cut by the edges like a slab cut from a larger one.
   */
  readonly wrap: boolean;
  readonly rng: Rng;
  /** Candidates per requested disk. Default 12. */
  readonly attempts?: number;
}

export interface Disk {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** Index into `classes`. */
  readonly cls: number;
}

/**
 * Places the disks. Every pair keeps `r1 + r2 + gap` between centres
 * (toroidal distance with `wrap`). Each candidate draws exactly three values
 * from `rng`. Deterministic for a given rng state.
 */
export function scatterDisks(o: ScatterDisksOptions): Disk[] {
  const { width: w, height: h, gap, wrap, rng } = o;
  const out: Disk[] = [];
  if (!(w > 0) || !(h > 0)) return out;
  const rMax = Math.max(0, ...o.classes.map((c) => c.radius));
  if (!(rMax > 0)) return out;
  const g = Math.max(0, gap);

  // Grid over the sampling area, cells about the size of the smaller disks.
  // Each disk is registered in every cell its bounding box touches, so a
  // candidate only checks the cells under its own box (grown by the gap).
  const pad = wrap ? 0 : rMax;
  const areaW = w + 2 * pad;
  const areaH = h + 2 * pad;
  const rMin = Math.min(...o.classes.filter((c) => c.radius > 0).map((c) => c.radius));
  // Not below half the largest radius, so large disks touch only a few cells.
  const target = Math.max(rMin * 2, rMax / 2, Math.sqrt((areaW * areaH) / MAX_GRID_CELLS), 1e-6);
  const cols = Math.max(1, Math.floor(areaW / target));
  const rows = Math.max(1, Math.floor(areaH / target));
  const cw = areaW / cols;
  const ch = areaH / rows;
  const grid: number[][] = Array.from({ length: cols * rows }, () => []);
  const attempts = o.attempts ?? 12;

  const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
    let dx = Math.abs(ax - bx);
    let dy = Math.abs(ay - by);
    if (wrap) {
      dx = Math.min(dx, w - dx);
      dy = Math.min(dy, h - dy);
    }
    return dx * dx + dy * dy;
  };

  /** Calls `visit` with every grid cell index under the box around (x, y) of half size `reach`. */
  const cellsAround = (x: number, y: number, reach: number, visit: (cell: number) => boolean) => {
    let c0 = Math.floor((x - reach + pad) / cw);
    let c1 = Math.floor((x + reach + pad) / cw);
    let r0 = Math.floor((y - reach + pad) / ch);
    let r1 = Math.floor((y + reach + pad) / ch);
    if (wrap) {
      // Never visit a column or row twice.
      if (c1 - c0 + 1 >= cols) [c0, c1] = [0, cols - 1];
      if (r1 - r0 + 1 >= rows) [r0, r1] = [0, rows - 1];
    } else {
      c0 = Math.max(c0, 0);
      r0 = Math.max(r0, 0);
      c1 = Math.min(c1, cols - 1);
      r1 = Math.min(r1, rows - 1);
    }
    for (let gy = r0; gy <= r1; gy++) {
      const yy = wrap ? ((gy % rows) + rows) % rows : gy;
      for (let gx = c0; gx <= c1; gx++) {
        const xx = wrap ? ((gx % cols) + cols) % cols : gx;
        if (!visit(yy * cols + xx)) return;
      }
    }
  };

  const fits = (x: number, y: number, r: number): boolean => {
    let ok = true;
    cellsAround(x, y, r + g, (cell) => {
      for (const k of grid[cell] ?? []) {
        const d = out[k] as Disk;
        const min = r + d.r + g;
        if (dist2(x, y, d.x, d.y) < min * min) {
          ok = false;
          return false;
        }
      }
      return true;
    });
    return ok;
  };

  o.classes.forEach((cls, ci) => {
    const variance = Math.min(0.95, Math.max(0, cls.variance));
    let placed = 0;
    const tries = Math.ceil(Math.max(0, cls.count) * attempts);
    for (let t = 0; t < tries && placed < cls.count; t++) {
      const x = rng.float(-pad, w + pad);
      const y = rng.float(-pad, h + pad);
      const r = cls.radius * (1 - variance * rng.next());
      if (!(r > 0) || !fits(x, y, r)) continue;
      const index = out.length;
      cellsAround(x, y, r, (cell) => {
        grid[cell]?.push(index);
        return true;
      });
      out.push({ x, y, r, cls: ci });
      placed++;
    }
  });
  return out;
}

/**
 * Offsets at which a shape of radius `r` around `(x, y)` must be drawn so a
 * tile of `w × h` wraps seamlessly: always `{0, 0}`, plus the copies across
 * every edge it crosses (up to four in total).
 */
export function wrapCopies(
  x: number,
  y: number,
  r: number,
  w: number,
  h: number,
): { dx: number; dy: number }[] {
  const xs = [0];
  if (x - r < 0) xs.push(w);
  if (x + r > w) xs.push(-w);
  const ys = [0];
  if (y - r < 0) ys.push(h);
  if (y + r > h) ys.push(-h);
  const out: { dx: number; dy: number }[] = [];
  for (const dy of ys) for (const dx of xs) out.push({ dx, dy });
  return out;
}
