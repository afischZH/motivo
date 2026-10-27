/**
 * Poisson-disk sampling in a rectangle using Bridson's algorithm
 * ("Fast Poisson Disk Sampling in Arbitrary Dimensions", 2007).
 */
import type { Rng } from "./rng.js";
import type { Vec2 } from "./vec.js";

export interface PoissonOptions {
  readonly width: number;
  readonly height: number;
  /** Minimum distance between any two points. */
  readonly minDistance: number;
  readonly rng: Rng;
  /** Candidates tried around an active point before it is retired. Default 30. */
  readonly maxAttempts?: number;
}

/**
 * Returns points in [0, width) x [0, height) with pairwise distance of at least
 * `minDistance`. Deterministic for a given rng state.
 */
export function poissonDisk(options: PoissonOptions): Vec2[] {
  const { width, height, minDistance, rng, maxAttempts = 30 } = options;
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return [];
  }
  if (!(minDistance > 0) || !Number.isFinite(minDistance)) {
    throw new RangeError("poissonDisk: minDistance must be a positive finite number");
  }

  const cellSize = minDistance / Math.SQRT2;
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  // Each cell holds at most one point; -1 marks an empty cell.
  const grid = new Int32Array(cols * rows).fill(-1);
  const points: Vec2[] = [];
  const active: number[] = [];
  const minSq = minDistance * minDistance;

  const cellIndex = (p: Vec2): number =>
    Math.floor(p.y / cellSize) * cols + Math.floor(p.x / cellSize);

  const insert = (p: Vec2): void => {
    grid[cellIndex(p)] = points.length;
    active.push(points.length);
    points.push(p);
  };

  const isFarEnough = (p: Vec2): boolean => {
    const cx = Math.floor(p.x / cellSize);
    const cy = Math.floor(p.y / cellSize);
    const x0 = Math.max(cx - 2, 0);
    const x1 = Math.min(cx + 2, cols - 1);
    const y0 = Math.max(cy - 2, 0);
    const y1 = Math.min(cy + 2, rows - 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const idx = grid[y * cols + x] ?? -1;
        if (idx < 0) continue;
        const q = points[idx] as Vec2;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        if (dx * dx + dy * dy < minSq) return false;
      }
    }
    return true;
  };

  insert({ x: rng.float(0, width), y: rng.float(0, height) });

  while (active.length > 0) {
    const slot = rng.int(0, active.length - 1);
    const origin = points[active[slot] as number] as Vec2;
    let found = false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Uniform by area in the annulus [r, 2r].
      const radius = Math.sqrt(rng.float(minSq, 4 * minSq));
      const theta = rng.float(0, 2 * Math.PI);
      const candidate: Vec2 = {
        x: origin.x + Math.cos(theta) * radius,
        y: origin.y + Math.sin(theta) * radius,
      };
      if (candidate.x < 0 || candidate.x >= width || candidate.y < 0 || candidate.y >= height) {
        continue;
      }
      if (isFarEnough(candidate)) {
        insert(candidate);
        found = true;
        break;
      }
    }
    if (!found) {
      // Swap-remove keeps this O(1); order stays deterministic.
      active[slot] = active[active.length - 1] as number;
      active.pop();
    }
  }
  return points;
}
