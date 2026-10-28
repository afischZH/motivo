/**
 * Bento layout (docs/TOOLS.md J3): fills a `columns` × `rows` grid with
 * rectangular tiles, without gaps or overlaps, deterministically per rng.
 *
 * Main algorithm: repeated guillotine cuts along cell boundaries. A cut
 * splits one rectangle into two along a random axis (the longer side is
 * more likely, weighted by aspect ratio) at a random cell line that keeps
 * both parts at least `minSpan` cells wide on that axis. Rectangles wider or
 * taller than `maxSpan` are always cut first; then cuts continue, preferring
 * large rectangles, until the target tile count is reached or no cut keeps
 * `minSpan`. Guillotine cuts tile the grid by construction.
 *
 * When the spans cannot be met by cuts (e.g. 3 cells with minSpan 2 and
 * maxSpan 2), a fallback places the largest fitting tile at every free cell
 * in reading order and fills what is left with 1 × 1 tiles: `maxSpan` always
 * holds, `minSpan` wherever the free space allows.
 */
import type { Rng } from "../../rng";

/** One tile, zero-based cell coordinates; spans in cells. */
export interface BentoTile {
  readonly col: number;
  readonly row: number;
  readonly colSpan: number;
  readonly rowSpan: number;
}

export interface BentoLayoutOptions {
  readonly columns: number;
  readonly rows: number;
  /** Target number of tiles; the result may have fewer (spans) or more (maxSpan). */
  readonly tiles: number;
  /** Smallest tile edge in cells (both axes). */
  readonly minSpan: number;
  /** Largest tile edge in cells (both axes). */
  readonly maxSpan: number;
}

export interface BentoLayout {
  /** Tiles in reading order (row, then column of the top-left cell). */
  readonly tiles: readonly BentoTile[];
  /** Which algorithm produced the layout. */
  readonly method: "guillotine" | "fallback";
}

export const BENTO_GRID_MIN = 1;
export const BENTO_GRID_MAX = 12;

interface Rect {
  col: number;
  row: number;
  w: number;
  h: number;
}

const clampInt = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));

/** Options clamped to a valid, finite range (maxSpan never below minSpan). */
export function normalizeBentoOptions(o: BentoLayoutOptions): BentoLayoutOptions {
  const columns = clampInt(o.columns, BENTO_GRID_MIN, BENTO_GRID_MAX);
  const rows = clampInt(o.rows, BENTO_GRID_MIN, BENTO_GRID_MAX);
  const minSpan = clampInt(o.minSpan, 1, BENTO_GRID_MAX);
  const maxSpan = clampInt(o.maxSpan, minSpan, BENTO_GRID_MAX);
  const tiles = clampInt(o.tiles, 1, columns * rows);
  return { columns, rows, tiles, minSpan, maxSpan };
}

/** Cut positions (cells from the start) on an edge of `length` that keep both parts >= min. */
function cutRange(length: number, min: number): [number, number] | null {
  const lo = min;
  const hi = length - min;
  return lo <= hi ? [lo, hi] : null;
}

type Axis = "col" | "row";

function split(r: Rect, axis: Axis, at: number): [Rect, Rect] {
  return axis === "col"
    ? [
        { col: r.col, row: r.row, w: at, h: r.h },
        { col: r.col + at, row: r.row, w: r.w - at, h: r.h },
      ]
    : [
        { col: r.col, row: r.row, w: r.w, h: at },
        { col: r.col, row: r.row + at, w: r.w, h: r.h - at },
      ];
}

/**
 * Picks the axis of a cut, weighted by aspect ratio: a rectangle twice as
 * wide as tall is cut vertically (along columns) with probability 2/3.
 */
function pickAxis(rng: Rng, r: Rect, canCol: boolean, canRow: boolean): Axis {
  if (canCol && !canRow) return "col";
  if (canRow && !canCol) return "row";
  return rng.next() < r.w / (r.w + r.h) ? "col" : "row";
}

/** Weighted pick (weights > 0). */
function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += weight(item);
  let x = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    x -= weight(items[i] as T);
    if (x < 0) return i;
  }
  return items.length - 1;
}

function guillotine(rng: Rng, o: BentoLayoutOptions): Rect[] | null {
  const rects: Rect[] = [{ col: 0, row: 0, w: o.columns, h: o.rows }];
  // Each cut adds one tile; the grid has at most columns * rows cells.
  const maxCuts = o.columns * o.rows;
  for (let step = 0; step < maxCuts; step++) {
    // 1) Rectangles above maxSpan must be cut.
    const oversized = rects
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.w > o.maxSpan || r.h > o.maxSpan);
    if (oversized.length > 0) {
      const { r, i } = oversized[pickWeighted(rng, oversized, ({ r: x }) => x.w * x.h)] as {
        r: Rect;
        i: number;
      };
      const needCol = r.w > o.maxSpan;
      const needRow = r.h > o.maxSpan;
      const colRange = needCol ? cutRange(r.w, o.minSpan) : null;
      const rowRange = needRow ? cutRange(r.h, o.minSpan) : null;
      if (!colRange && !rowRange) return null;
      const axis = pickAxis(rng, r, colRange !== null, rowRange !== null);
      const range = (axis === "col" ? colRange : rowRange) as [number, number];
      rects.splice(i, 1, ...split(r, axis, rng.int(range[0], range[1])));
      continue;
    }
    // 2) Optional cuts towards the target count.
    if (rects.length >= o.tiles) break;
    const cuttable = rects
      .map((r, i) => ({ r, i, col: cutRange(r.w, o.minSpan), row: cutRange(r.h, o.minSpan) }))
      .filter((c) => c.col !== null || c.row !== null);
    if (cuttable.length === 0) break;
    // Area squared favours big rectangles, which keeps tile sizes varied but bounded.
    const c = cuttable[pickWeighted(rng, cuttable, ({ r }) => (r.w * r.h) ** 2)] as {
      r: Rect;
      i: number;
      col: [number, number] | null;
      row: [number, number] | null;
    };
    const axis = pickAxis(rng, c.r, c.col !== null, c.row !== null);
    const range = (axis === "col" ? c.col : c.row) as [number, number];
    rects.splice(c.i, 1, ...split(c.r, axis, rng.int(range[0], range[1])));
  }
  return rects;
}

/** Largest fitting tiles first (random within the allowed spans), then 1 × 1 cells. */
function fallback(rng: Rng, o: BentoLayoutOptions): Rect[] {
  const used = new Uint8Array(o.columns * o.rows);
  const free = (c: number, r: number) =>
    c < o.columns && r < o.rows && used[r * o.columns + c] === 0;
  const rects: Rect[] = [];
  for (let row = 0; row < o.rows; row++) {
    for (let col = 0; col < o.columns; col++) {
      if (!free(col, row)) continue;
      // Widest free run on this row, capped by maxSpan.
      let maxW = 0;
      while (maxW < o.maxSpan && free(col + maxW, row)) maxW++;
      let w = rng.int(Math.min(o.minSpan, maxW), maxW);
      let h = rng.int(Math.min(o.minSpan, o.rows - row), Math.min(o.maxSpan, o.rows - row));
      // Shrink until the whole block is free.
      const fits = (ww: number, hh: number) => {
        for (let y = row; y < row + hh; y++)
          for (let x = col; x < col + ww; x++) if (!free(x, y)) return false;
        return true;
      };
      while (!fits(w, h)) {
        if (h > 1) h--;
        else w--;
      }
      for (let y = row; y < row + h; y++)
        for (let x = col; x < col + w; x++) used[y * o.columns + x] = 1;
      rects.push({ col, row, w, h });
    }
  }
  return rects;
}

/**
 * Computes a bento layout. Pure: the same options and rng state give the
 * same tiles. Every grid cell belongs to exactly one tile.
 */
export function bentoLayout(rng: Rng, options: BentoLayoutOptions): BentoLayout {
  const o = normalizeBentoOptions(options);
  const cut = guillotine(rng, o);
  const method = cut ? "guillotine" : "fallback";
  const rects = cut ?? fallback(rng, o);
  const tiles = rects
    .map((r) => ({ col: r.col, row: r.row, colSpan: r.w, rowSpan: r.h }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  return { tiles, method };
}
