/**
 * Geometric Patterns (docs/TOOLS.md A1, M4-AP02): a grid of tiles, each
 * with one shape of the library (`../../shapes`), a colour and a rotation.
 *
 * Grid:
 * - `uniform`: `columns` tiles across; the row count follows the aspect
 *   ratio and the cells stretch a little so whole cells fill the canvas
 *   exactly. The design is therefore always its own seamless repeat tile.
 * - `dynamic`: the same grid of root cells, each split recursively into
 *   four quadrants with probability `splitChance`, at most `depth` levels
 *   and never below `GEOMETRIC_MIN_TILE` px (quadtree).
 *
 * Cell ids (stable, used by tile overrides): `<row>-<col>` of the root cell,
 * plus one `.<quadrant>` (0 top left, 1 top right, 2 bottom left,
 * 3 bottom right) per split level, e.g. `3-5.2.0`. They depend only on the
 * grid position, so colours, shapes, rotation, padding, gap and outline
 * changes never move them. In `uniform` mode they also survive new seeds.
 *
 * Randomness: one value is drawn from the render rng; every split decision
 * and every tile's look comes from its own sub-stream derived from that
 * value and the cell id (`deriveSeed`). Changing one cell, the shape list or
 * the palette therefore never reshuffles other cells, and the subdivision
 * does not depend on any style option.
 *
 * Limits: at most `GEOMETRIC_MAX_TILES` tiles per design (columns and the
 * effective depth are lowered to fit), so the SVG and the preview stay
 * small whatever a share link asks for.
 */
import { formatNumber } from "../../curves";
import { createRng, deriveSeed, toUint32, type Rng } from "../../rng";
import { shapeLayers } from "../../shapes";
import { svgBackground, svgDocument } from "../../svg";

export const GEOMETRIC_GRID_MODES = ["uniform", "dynamic"] as const;
export type GeometricGridMode = (typeof GEOMETRIC_GRID_MODES)[number];

export const GEOMETRIC_ROTATION_MODES = ["none", "quarter", "free"] as const;
export type GeometricRotationMode = (typeof GEOMETRIC_ROTATION_MODES)[number];

/** `tile`: colours drawn per tile; `layer`: one colour per shape layer for all tiles. */
export const GEOMETRIC_COLOR_MODES = ["tile", "layer"] as const;
export type GeometricColorMode = (typeof GEOMETRIC_COLOR_MODES)[number];

/** Most tiles in one design (preview, export and click regions). */
export const GEOMETRIC_MAX_TILES = 1600;
/** Smallest tile edge in px. */
export const GEOMETRIC_MIN_TILE = 8;
export const GEOMETRIC_MAX_COLUMNS = 40;
export const GEOMETRIC_MAX_DEPTH = 4;

/** Valid cell ids: root row and column (0 to 999) plus up to four quadrant digits. */
export const GEOMETRIC_CELL_ID_PATTERN = /^\d{1,3}-\d{1,3}(?:\.[0-3]){0,4}$/;

/** One cell of the grid, in px of the design. */
export interface GeometricCell {
  readonly id: string;
  /** Row and column of the root cell (0-based). */
  readonly row: number;
  readonly col: number;
  /** Split level, 0 for a root cell. */
  readonly level: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GeometricGridOptions {
  readonly width: number;
  readonly height: number;
  readonly gridMode: GeometricGridMode;
  /** Root cells across (uniform: tiles across). */
  readonly columns: number;
  /** Most split levels in dynamic mode. */
  readonly depth: number;
  /** Chance that a cell splits into four, 0 to 1 (dynamic mode). */
  readonly splitChance: number;
  /** Structure seed (see `geometricSeed`). */
  readonly seed: number;
}

export interface GeometricGrid {
  /** Root columns and rows actually used (after the caps). */
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  /** Cells in reading order of the root cells, quadrants depth first. */
  readonly cells: readonly GeometricCell[];
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/**
 * The structure seed of a render: the first value of the render rng. Every
 * sub-stream (splits, tiles) derives from it, see the module comment.
 */
export function geometricSeed(rng: Rng): number {
  return toUint32(Math.floor(rng.next() * 4294967296));
}

/** Root grid: whole cells that fill the canvas, within the tile caps. */
function rootGrid(width: number, height: number, wanted: number) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  let cols = Math.round(clamp(wanted, 1, GEOMETRIC_MAX_COLUMNS));
  cols = Math.max(1, Math.min(cols, Math.floor(w / GEOMETRIC_MIN_TILE)));
  const rowsFor = (c: number) =>
    Math.max(1, Math.min(Math.round(h / (w / c)), Math.floor(h / GEOMETRIC_MIN_TILE) || 1));
  let rows = rowsFor(cols);
  while (cols > 1 && cols * rows > GEOMETRIC_MAX_TILES) {
    cols--;
    rows = rowsFor(cols);
  }
  // A very tall canvas with one column can still have too many rows.
  rows = Math.min(rows, GEOMETRIC_MAX_TILES);
  return { cols, rows, cellWidth: w / cols, cellHeight: h / rows };
}

/** Computes the cells. Pure; the only randomness comes from `seed`. */
export function geometricGrid(o: GeometricGridOptions): GeometricGrid {
  const { cols, rows, cellWidth, cellHeight } = rootGrid(o.width, o.height, o.columns);
  const roots = cols * rows;
  let depth = o.gridMode === "dynamic" ? Math.round(clamp(o.depth, 0, GEOMETRIC_MAX_DEPTH)) : 0;
  // Worst case every cell splits: keep 4^depth root cells under the cap.
  while (depth > 0 && roots * 4 ** depth > GEOMETRIC_MAX_TILES) depth--;
  const chance = clamp(o.splitChance, 0, 1);
  const cells: GeometricCell[] = [];

  const visit = (
    id: string,
    row: number,
    col: number,
    level: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    const canSplit =
      level < depth && Math.min(w, h) / 2 >= GEOMETRIC_MIN_TILE && chance > 0 && depth > 0;
    if (canSplit && createRng(deriveSeed(o.seed, `split:${id}`)).next() < chance) {
      const hw = w / 2;
      const hh = h / 2;
      visit(`${id}.0`, row, col, level + 1, x, y, hw, hh);
      visit(`${id}.1`, row, col, level + 1, x + hw, y, hw, hh);
      visit(`${id}.2`, row, col, level + 1, x, y + hh, hw, hh);
      visit(`${id}.3`, row, col, level + 1, x + hw, y + hh, hw, hh);
      return;
    }
    cells.push({ id, row, col, level, x, y, width: w, height: h });
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      visit(`${r}-${c}`, r, c, 0, c * cellWidth, r * cellHeight, cellWidth, cellHeight);
    }
  }
  return { columns: cols, rows, cellWidth, cellHeight, cells };
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

/** What a tile override may change (all optional). */
export interface GeometricTileOverride {
  readonly shape?: string | undefined;
  /** Hex colour of the shape (primary layer; the accent follows in `tile` mode). */
  readonly color?: string | undefined;
  /** Degrees, 0 to 359. */
  readonly rotation?: number | undefined;
}

/** A styled tile: cell plus look. */
export interface GeometricTile extends GeometricCell {
  readonly shape: string;
  /** Degrees. */
  readonly rotation: number;
  /** Primary layer colour. */
  readonly color: string;
  /** Accent layer colour (drawn with the duotone opacity). */
  readonly accent: string;
  /** Tile background, or `null` without tile fills. */
  readonly fill: string | null;
  /** Whether an override changed this tile. */
  readonly edited: boolean;
}

export interface GeometricTilesOptions {
  readonly cells: readonly GeometricCell[];
  readonly seed: number;
  /** Shape ids to pick from (unknown ids render as a circle). */
  readonly shapes: readonly string[];
  /** At least one colour. */
  readonly palette: readonly string[];
  readonly colorMode: GeometricColorMode;
  readonly rotationMode: GeometricRotationMode;
  /** Every tile gets a background colour from the palette. */
  readonly tileFill: boolean;
  readonly overrides?: Readonly<Record<string, GeometricTileOverride>>;
}

const FALLBACK_SHAPE = "circle";
const FALLBACK_COLOR = "#000000";

/** The generated look of every cell, with overrides applied. Six draws per tile. */
export function geometricTiles(o: GeometricTilesOptions): GeometricTile[] {
  const shapes = o.shapes.length > 0 ? o.shapes : [FALLBACK_SHAPE];
  const palette = o.palette.length > 0 ? o.palette : [FALLBACK_COLOR];
  const n = palette.length;
  const color = (i: number): string => palette[((i % n) + n) % n] ?? FALLBACK_COLOR;
  const overrides = o.overrides ?? {};
  return o.cells.map((cell) => {
    const rng = createRng(deriveSeed(o.seed, `tile:${cell.id}`));
    const shapeU = rng.next();
    const quarterU = rng.next();
    const freeU = rng.next();
    const colorU = rng.next();
    const fillU = rng.next();
    const accentU = rng.next();
    void accentU; // reserved: keeps the draw count fixed for later options

    let rotation = 0;
    if (o.rotationMode === "quarter") rotation = Math.floor(quarterU * 4) * 90;
    else if (o.rotationMode === "free") rotation = Math.floor(freeU * 360);

    let primary: string;
    let accent: string;
    let fill: string | null = null;
    if (o.colorMode === "layer") {
      // One colour per layer; the fill takes the last colour, the shape layers the first ones.
      const shapeColors = o.tileFill && n > 1 ? n - 1 : n;
      primary = color(0);
      accent = color(1 % shapeColors);
      if (o.tileFill) fill = color(n - 1);
    } else {
      const ci = Math.min(n - 1, Math.floor(colorU * n));
      primary = color(ci);
      accent = primary;
      if (o.tileFill) fill = n > 1 ? color(ci + 1 + Math.floor(fillU * (n - 1))) : color(ci);
    }

    let shape =
      shapes[Math.min(shapes.length - 1, Math.floor(shapeU * shapes.length))] ?? FALLBACK_SHAPE;
    const ov = Object.prototype.hasOwnProperty.call(overrides, cell.id)
      ? overrides[cell.id]
      : undefined;
    let edited = false;
    if (ov) {
      if (ov.shape !== undefined) {
        shape = ov.shape;
        edited = true;
      }
      if (ov.rotation !== undefined && Number.isFinite(ov.rotation)) {
        rotation = ((Math.round(ov.rotation) % 360) + 360) % 360;
        edited = true;
      }
      if (ov.color !== undefined) {
        if (o.colorMode === "tile") accent = ov.color;
        primary = ov.color;
        edited = true;
      }
    }
    return { ...cell, shape, rotation, color: primary, accent, fill, edited };
  });
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

export interface GeometricSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly GeometricTile[];
  /** Solid colour or `"transparent"`. */
  readonly background: string;
  /** Inner margin of the shape, share of the tile (0 to 0.45). */
  readonly padding: number;
  /** Space between tiles in px (half on each side, so the design still repeats). */
  readonly gap: number;
  /** Opacity of accent layers (duotone). */
  readonly duotoneOpacity: number;
  /** Outlines instead of filled shapes. */
  readonly strokeOnly: boolean;
  /** Outline width in units of the 100-unit shape box. */
  readonly strokeWidth: number;
}

const n2 = (v: number): string => formatNumber(v, 2);

/** Shapes turned by an angle that is not a quarter turn shrink so they stay inside the tile. */
export const GEOMETRIC_FREE_FIT = Math.SQRT1_2;

/** Inner box of a tile after gap and padding, in px. */
export function geometricInnerBox(
  cell: Pick<GeometricCell, "x" | "y" | "width" | "height">,
  gap: number,
  padding: number,
): { x: number; y: number; width: number; height: number } {
  const g = Math.max(0, gap) / 2;
  const gw = Math.max(0, cell.width - 2 * g);
  const gh = Math.max(0, cell.height - 2 * g);
  const p = clamp(padding, 0, 0.45);
  const w = gw * (1 - 2 * p);
  const h = gh * (1 - 2 * p);
  return {
    x: cell.x + (cell.width - w) / 2,
    y: cell.y + (cell.height - h) / 2,
    width: w,
    height: h,
  };
}

function transformOf(tile: GeometricTile, box: ReturnType<typeof geometricInnerBox>): string {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const parts = [`translate(${n2(cx)} ${n2(cy)})`];
  const sx = box.width / 100;
  const sy = box.height / 100;
  parts.push(
    Math.abs(sx - sy) < 1e-6
      ? `scale(${formatNumber(sx, 4)})`
      : `scale(${formatNumber(sx, 4)} ${formatNumber(sy, 4)})`,
  );
  const rot = ((tile.rotation % 360) + 360) % 360;
  if (rot !== 0) parts.push(`rotate(${n2(rot)})`);
  if (rot % 90 !== 0) parts.push(`scale(${formatNumber(GEOMETRIC_FREE_FIT, 4)})`);
  return parts.join("");
}

/** Keeps the insertion order of keys (colour groups in first-use order). */
function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** SVG id of a shape layer (`a` = accent). Shape ids are kebab-case, safe in ids. */
const layerId = (shape: string, layer: "p" | "a"): string =>
  `gp-${shape.replace(/[^a-z0-9-]/gi, "")}-${layer}`;

/** The whole design as an SVG document. Pure. */
export function geometricPatternSvg(o: GeometricSvgOptions): string {
  const fills = new Map<string, string[]>();
  const primaries = new Map<string, string[]>();
  const accents = new Map<string, string[]>();
  const defs = new Map<string, string>();
  const g = Math.max(0, o.gap) / 2;
  const opacity = clamp(o.duotoneOpacity, 0, 1);

  for (const tile of o.tiles) {
    if (tile.fill !== null) {
      const w = tile.width - 2 * g;
      const h = tile.height - 2 * g;
      if (w > 0 && h > 0) {
        push(fills, tile.fill, `M${n2(tile.x + g)} ${n2(tile.y + g)}h${n2(w)}v${n2(h)}h${n2(-w)}Z`);
      }
    }
    const box = geometricInnerBox(tile, o.gap, o.padding);
    if (box.width <= 0 || box.height <= 0) continue;
    const layers = shapeLayers(tile.shape);
    const pid = layerId(tile.shape, "p");
    if (!defs.has(pid)) defs.set(pid, layers.primary);
    const transform = transformOf(tile, box);
    push(primaries, tile.color, `<use href="#${pid}" transform="${transform}"/>`);
    if (layers.accent !== undefined && opacity > 0) {
      const aid = layerId(tile.shape, "a");
      if (!defs.has(aid)) defs.set(aid, layers.accent);
      push(accents, tile.accent, `<use href="#${aid}" transform="${transform}"/>`);
    }
  }

  const paint = (color: string): string =>
    o.strokeOnly
      ? `fill="none" stroke="${color}" stroke-width="${n2(clamp(o.strokeWidth, 0.5, 20))}" stroke-linejoin="round"`
      : `fill="${color}"`;
  const accentOpacity =
    opacity >= 1
      ? ""
      : o.strokeOnly
        ? ` stroke-opacity="${n2(opacity)}"`
        : ` fill-opacity="${n2(opacity)}"`;

  let body = "";
  for (const [color, d] of fills) body += `<path fill="${color}" d="${d.join("")}"/>`;
  for (const [color, uses] of primaries) body += `<g ${paint(color)}>${uses.join("")}</g>`;
  for (const [color, uses] of accents) {
    body += `<g ${paint(color)}${accentOpacity}>${uses.join("")}</g>`;
  }
  const defMarkup = [...defs].map(([id, d]) => `<path id="${id}" d="${d}"/>`).join("");
  return svgDocument(
    o.width,
    o.height,
    `${defMarkup ? `<defs>${defMarkup}</defs>` : ""}${svgBackground(o.background, o.width, o.height)}${body}`,
  );
}
