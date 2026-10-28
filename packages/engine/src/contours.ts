/**
 * Contour lines (isolines) of a scalar grid with Marching Squares: every
 * cell is classified by which corners lie at or above the level, the
 * crossings on its edges are placed by linear interpolation, and the
 * segments are joined into polylines through their shared edges. Saddle
 * cells are resolved with the mean of the four corners.
 */
import type { FlatPoints } from "./polyline";

export interface Contour {
  /** Points in grid units (x = column, y = row), interleaved `[x0, y0, ...]`. */
  readonly points: FlatPoints;
  /** True when the line is a loop (the last point connects to the first). */
  readonly closed: boolean;
}

/**
 * Edges of each case as pairs of edge ids (0 top, 1 right, 2 bottom, 3 left).
 * Corner bits: 8 top-left, 4 top-right, 2 bottom-right, 1 bottom-left.
 * Saddles (5, 10) are listed for "centre below the level"; the centre-above
 * variant is in `SADDLE_HIGH`.
 */
const CASES: readonly (readonly number[])[] = [
  [],
  [3, 2],
  [2, 1],
  [3, 1],
  [0, 1],
  [0, 1, 3, 2],
  [0, 2],
  [3, 0],
  [3, 0],
  [0, 2],
  [3, 0, 2, 1],
  [0, 1],
  [3, 1],
  [2, 1],
  [3, 2],
  [],
];
const SADDLE_HIGH: Readonly<Record<number, readonly number[]>> = {
  5: [3, 0, 2, 1],
  10: [0, 1, 3, 2],
};

interface Workspace {
  linkA: Int32Array;
  linkB: Int32Array;
  visited: Uint8Array;
}
let scratch: Workspace | undefined;

/** Zeroed scratch buffers of at least `size` entries (grown on demand, reset by the caller). */
function workspace(size: number): Workspace {
  if (!scratch || scratch.linkA.length < size) {
    scratch = {
      linkA: new Int32Array(size),
      linkB: new Int32Array(size),
      visited: new Uint8Array(size),
    };
  }
  return scratch;
}

/**
 * Traces all contour lines of `values` (row-major, `cols` × `rows` samples)
 * at `level`. A sample belongs to the inside when it is `>= level`. Lines
 * that reach the border of the grid are open; pad the grid with a low value
 * to get only loops. Non-finite samples count as outside.
 */
export function marchingSquares(
  values: ArrayLike<number>,
  cols: number,
  rows: number,
  level: number,
): Contour[] {
  if (cols < 2 || rows < 2 || values.length < cols * rows) return [];
  const at = (i: number, j: number): number => values[j * cols + i] ?? Number.NaN;

  // Edge keys: horizontal edge (i, j)-(i + 1, j) = 2 (j cols + i), vertical (i, j)-(i, j + 1) = +1.
  // Links are stored as key + 1 (0 = none) in scratch buffers shared between calls; only the
  // touched entries are reset afterwards, so a call costs O(cells + crossings), not O(allocation).
  const ws = workspace(2 * cols * rows);
  const linkA = ws.linkA;
  const linkB = ws.linkB;
  const visited = ws.visited;
  const used: number[] = [];

  const crossing = (va: number, vb: number): number => {
    const d = vb - va;
    const t = d !== 0 && Number.isFinite(d) ? (level - va) / d : 0.5;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  };
  const edgeKey = (i: number, j: number, edge: number): number => {
    switch (edge) {
      case 0:
        return 2 * (j * cols + i);
      case 1:
        return 2 * (j * cols + i + 1) + 1;
      case 2:
        return 2 * ((j + 1) * cols + i);
      default:
        return 2 * (j * cols + i) + 1;
    }
  };
  const pushPoint = (key: number, out: number[]): void => {
    const cell = key >> 1;
    const i = cell % cols;
    const j = (cell - i) / cols;
    if ((key & 1) === 0) out.push(i + crossing(at(i, j), at(i + 1, j)), j);
    else out.push(i, j + crossing(at(i, j), at(i, j + 1)));
  };
  const link = (a: number, b: number): void => {
    if (linkA[a] === 0) {
      linkA[a] = b + 1;
      used.push(a);
    } else linkB[a] = b + 1;
  };

  for (let j = 0; j < rows - 1; j++) {
    const row = j * cols;
    for (let i = 0; i < cols - 1; i++) {
      const a = values[row + i] ?? Number.NaN;
      const b = values[row + i + 1] ?? Number.NaN;
      const c = values[row + cols + i + 1] ?? Number.NaN;
      const d = values[row + cols + i] ?? Number.NaN;
      const index =
        (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
      if (index === 0 || index === 15) continue;
      let edges = CASES[index] ?? [];
      if ((index === 5 || index === 10) && (a + b + c + d) / 4 >= level) {
        edges = SADDLE_HIGH[index] ?? edges;
      }
      for (let k = 0; k < edges.length; k += 2) {
        const e1 = edgeKey(i, j, edges[k] ?? 0);
        const e2 = edgeKey(i, j, edges[k + 1] ?? 0);
        link(e1, e2);
        link(e2, e1);
      }
    }
  }

  const contours: Contour[] = [];
  const walk = (start: number): Contour => {
    const pts: number[] = [];
    let prev = -1;
    let cur = start;
    for (;;) {
      visited[cur] = 1;
      pushPoint(cur, pts);
      const a = (linkA[cur] ?? 0) - 1;
      const b = (linkB[cur] ?? 0) - 1;
      const next = a !== prev && a !== -1 && !visited[a] ? a : b !== -1 && !visited[b] ? b : -1;
      if (next === -1) {
        const closed = (a === start || b === start) && pts.length > 4;
        return { points: pts, closed };
      }
      prev = cur;
      cur = next;
    }
  };
  // Open lines first, from one of their ends, then the loops.
  for (const key of used) if (!visited[key] && linkB[key] === 0) contours.push(walk(key));
  for (const key of used) if (!visited[key]) contours.push(walk(key));
  for (const key of used) {
    linkA[key] = 0;
    linkB[key] = 0;
    visited[key] = 0;
  }
  return contours;
}
