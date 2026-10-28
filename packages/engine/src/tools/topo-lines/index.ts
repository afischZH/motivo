/**
 * Topographic contour lines (docs/TOOLS.md K1). A seeded fBm height field,
 * optionally domain-warped, is sampled on a grid; Marching Squares traces the
 * contour of every level, Ramer-Douglas-Peucker thins the points and the
 * loops are drawn as smooth quadratic B-splines. Bands fill the region above
 * each level (even-odd), stacked from low to high.
 *
 * Work is independent of the canvas size: the grid has at most
 * `TOPO_GRID_CELLS_MAX` cells and the output at most `TOPO_POINTS_MAX`
 * points, so render time and SVG size stay bounded at 8K as well.
 */
import { samplePalette } from "../../color";
import { marchingSquares } from "../../contours";
import { formatNumber } from "../../curves";
import { createNoise2D, fbm2D } from "../../noise2d";
import { pointCount, simplifyPolyline, smoothPathData, subdividePolyline } from "../../polyline";
import type { Rng } from "../../rng";
import { svgBackground, svgDocument } from "../../svg";

export const TOPO_STYLES = ["lines", "bands", "bands-lines"] as const;
/** `lines`: strokes only; `bands`: filled height bands; `bands-lines`: both. */
export type TopoStyle = (typeof TOPO_STYLES)[number];

export const TOPO_COLOR_MODES = ["gradient", "cycle"] as const;
/** `gradient`: colours blend from low to high; `cycle`: palette colours repeat level by level. */
export type TopoColorMode = (typeof TOPO_COLOR_MODES)[number];

/** Grid cells along the shorter edge (finer grids only cost time, the smoothing hides facets). */
export const TOPO_GRID_RESOLUTION = 128;
/** Upper bound of grid cells for any aspect ratio. */
export const TOPO_GRID_CELLS_MAX = 64_000;
/** Upper bound of path points in the output (about 17 bytes each in `Q` curves, so under 1.5 MB of SVG). */
export const TOPO_POINTS_MAX = 50_000;
export const TOPO_LEVELS_MAX = 40;
/** Line width factor of highlighted (index) lines. */
export const TOPO_MAJOR_FACTOR = 2.5;

export interface TopoFieldOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  /** Feature size relative to the shorter edge (1 = one hill across). */
  readonly scale: number;
  readonly octaves: number;
  /** 0 = smooth, 1 = rough (fBm gain 0.35 to 0.7). */
  readonly roughness: number;
  /** Domain warp strength, 0 to 1. */
  readonly warp: number;
}

export interface TopoField {
  /** Samples row-major, including one ring of real samples outside the canvas plus a low pad ring. */
  readonly values: Float64Array;
  readonly cols: number;
  readonly rows: number;
  /** Grid cell size in px. */
  readonly cell: number;
  /** Canvas position of sample (0, 0) in px (negative: outside the canvas). */
  readonly originX: number;
  readonly originY: number;
  /** Lowest and highest sample inside the field (without the pad). */
  readonly min: number;
  readonly max: number;
}

/** Value of the pad ring: below every level, so all contours close. */
const PAD = -1e9;

/**
 * Samples the height field. Consumes the rng draws of one noise permutation
 * plus four offsets, independent of size and params.
 */
export function topoField(o: TopoFieldOptions): TopoField {
  const noise = createNoise2D(o.rng);
  const ox = o.rng.float(0, 200);
  const oy = o.rng.float(0, 200);
  const wx = o.rng.float(0, 200);
  const wy = o.rng.float(0, 200);
  const short = Math.max(1, Math.min(o.width, o.height));
  let cell = short / TOPO_GRID_RESOLUTION;
  const inner = (c: number): number => (Math.ceil(o.width / c) + 3) * (Math.ceil(o.height / c) + 3);
  if (inner(cell) > TOPO_GRID_CELLS_MAX) {
    cell *= Math.sqrt(inner(cell) / TOPO_GRID_CELLS_MAX);
    while (inner(cell) > TOPO_GRID_CELLS_MAX) cell *= 1.02;
  }
  // Real samples from one cell before the canvas to one cell after it, plus the pad ring.
  const cols = Math.ceil(o.width / cell) + 3 + 2;
  const rows = Math.ceil(o.height / cell) + 3 + 2;
  const originX = -2 * cell;
  const originY = -2 * cell;
  const freq = 1 / (short * Math.max(o.scale, 0.01));
  const gain = 0.35 + 0.35 * Math.min(Math.max(o.roughness, 0), 1);
  const warp = Math.min(Math.max(o.warp, 0), 1) * 1.6;
  const octaves = Math.max(1, Math.floor(o.octaves));
  const values = new Float64Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (i === 0 || j === 0 || i === cols - 1 || j === rows - 1) {
        values[j * cols + i] = PAD;
        continue;
      }
      let x = (originX + i * cell) * freq + ox;
      let y = (originY + j * cell) * freq + oy;
      if (warp > 0) {
        const qx = fbm2D(noise, x + wx, y + wy, { octaves: 2 });
        const qy = fbm2D(noise, x + wy + 5.2, y + wx + 1.3, { octaves: 2 });
        x += warp * qx;
        y += warp * qy;
      }
      const v = fbm2D(noise, x, y, { octaves, gain });
      values[j * cols + i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { values, cols, rows, cell, originX, originY, min, max };
}

/**
 * Evenly spaced levels strictly between `min` and `max`. `shift` in [0, 1)
 * moves every level up by that share of the spacing (animation); levels
 * beyond the range are dropped. Returns the levels with their position in
 * units of the spacing (for colours that move with the level).
 */
export function topoLevels(
  min: number,
  max: number,
  count: number,
  shift = 0,
): { value: number; position: number }[] {
  const n = Math.max(1, Math.floor(count));
  const spacing = (max - min) / (n + 1);
  if (!(spacing > 0)) return [];
  const out: { value: number; position: number }[] = [];
  for (let k = 0; k <= n; k++) {
    const position = k + shift;
    const value = min + spacing * position;
    if (value > min && value < max) out.push({ value, position });
  }
  return out;
}

interface TracedLevel {
  readonly position: number;
  /** Loops in px, already simplified. */
  readonly loops: number[][];
}

/** RDP tolerance in grid cells (the smooth curve hides the rest of the facets). */
const SIMPLIFY_TOLERANCE = 0.2;
/** Contours with fewer raw points are specks and dropped. */
const SPECK_POINTS = 5;
/**
 * Long segments are split again after simplifying, so the smooth curve cannot
 * cut a corner by more than 3/8 of a cell (pad loops run one cell outside the
 * canvas and must stay there).
 */
const SEGMENT_MAX_CELLS = 3;

/**
 * Traces and simplifies all levels. Over the point budget, the smallest loops
 * are dropped first (one pass, deterministic), so the large shapes survive.
 */
function traceLevels(
  field: TopoField,
  levels: readonly { value: number; position: number }[],
): TracedLevel[] {
  const simplified = levels.map((l) =>
    marchingSquares(field.values, field.cols, field.rows, l.value)
      .filter((c) => pointCount(c.points) >= SPECK_POINTS)
      .map((c) =>
        subdividePolyline(
          simplifyPolyline(c.points, SIMPLIFY_TOLERANCE, c.closed),
          SEGMENT_MAX_CELLS,
          c.closed,
        ),
      ),
  );
  let total = 0;
  for (const loops of simplified) for (const l of loops) total += pointCount(l);
  let keep: ((loop: number[]) => boolean) | undefined;
  if (total > TOPO_POINTS_MAX) {
    const sizes = simplified.flatMap((loops) => loops.map((l) => pointCount(l)));
    sizes.sort((a, b) => b - a);
    let sum = 0;
    let min = Infinity;
    for (const size of sizes) {
      if (sum + size > TOPO_POINTS_MAX) break;
      sum += size;
      min = size;
    }
    // Loops at least as large as the smallest one that fit; the running budget stops ties.
    const threshold = min;
    let budget = TOPO_POINTS_MAX;
    keep = (loop) => {
      const size = pointCount(loop);
      if (size < threshold || size > budget) return false;
      budget -= size;
      return true;
    };
  }
  const toPx = (pts: readonly number[]): number[] => {
    const out = new Array<number>(pts.length);
    for (let i = 0; i < pts.length; i += 2) {
      out[i] = field.originX + (pts[i] ?? 0) * field.cell;
      out[i + 1] = field.originY + (pts[i + 1] ?? 0) * field.cell;
    }
    return out;
  };
  return levels.map((l, i) => ({
    position: l.position,
    loops: (simplified[i] ?? []).filter((loop) => !keep || keep(loop)).map(toPx),
  }));
}

export interface TopoSvgOptions extends TopoFieldOptions {
  readonly background: string;
  readonly colors: readonly string[];
  readonly levels: number;
  readonly style: TopoStyle;
  readonly colorMode: TopoColorMode;
  /** Stroke width in px. */
  readonly lineWidth: number;
  /** Colour of the lines on top of bands (`bands-lines`). */
  readonly lineColor: string;
  /** Every n-th line is drawn wider (index contour); 0 = off. */
  readonly majorEvery: number;
  /** Animation time in [0, 1): moves the levels up by one spacing over the loop. */
  readonly t?: number;
}

export function topoSvg(o: TopoSvgOptions): string {
  const { width: w, height: h } = o;
  const field = topoField(o);
  const count = Math.min(Math.max(Math.floor(o.levels), 1), TOPO_LEVELS_MAX);
  const t = o.t !== undefined && Number.isFinite(o.t) ? o.t - Math.floor(o.t) : 0;
  const levels = topoLevels(field.min, field.max, count, t);
  const traced = traceLevels(field, levels);

  // Colours by continuous level position, so animated levels keep their colour while moving.
  const steps = 64;
  const ramp = o.colorMode === "gradient" ? samplePalette(o.colors, steps + 1) : o.colors.slice();
  const colorAt = (position: number): string => {
    if (o.colorMode === "cycle") {
      const n = ramp.length;
      return ramp[(((Math.round(position) - 1) % n) + n) % n] ?? "#000000";
    }
    const f = Math.min(Math.max((position - 1) / Math.max(count - 1, 1), 0), 1);
    return ramp[Math.round(f * steps)] ?? "#000000";
  };

  const sw = Math.max(o.lineWidth, 0);
  const major = Math.floor(o.majorEvery);
  const isMajor = (position: number): boolean => major > 0 && Math.round(position) % major === 0;
  const fmt = (v: number): string => formatNumber(v, 2);

  let body = svgBackground(o.background, w, h);
  if (o.style !== "lines") {
    let bands = "";
    for (const level of traced) {
      if (level.loops.length === 0) continue;
      const d = level.loops.map((l) => smoothPathData(l, true)).join("");
      bands += `<path d="${d}" fill="${colorAt(level.position)}"/>`;
    }
    if (bands) body += `<g fill-rule="evenodd">${bands}</g>`;
  }
  if (o.style !== "bands" && sw > 0) {
    let lines = "";
    for (const level of traced) {
      if (level.loops.length === 0) continue;
      const d = level.loops.map((l) => smoothPathData(l, true)).join("");
      const stroke = o.style === "lines" ? colorAt(level.position) : o.lineColor;
      const width = isMajor(level.position) ? sw * TOPO_MAJOR_FACTOR : sw;
      lines += `<path d="${d}" stroke="${stroke}"${width !== sw ? ` stroke-width="${fmt(width)}"` : ""}/>`;
    }
    if (lines) {
      body += `<g fill="none" stroke-width="${fmt(sw)}" stroke-linejoin="round">${lines}</g>`;
    }
  }
  return svgDocument(w, h, body);
}
