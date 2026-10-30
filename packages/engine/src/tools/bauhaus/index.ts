/**
 * Bauhaus pattern (docs/TOOLS.md A5): a grid of square tiles, each with a
 * flat background colour and one bold geometric figure (quarter and half
 * circles, circles, rings, lenses, triangles, squares and stripes) in
 * quarter turns, in the spirit of modernist posters.
 *
 * Cells are square: the column count sets the size, rows fill the height.
 * Every cell takes the same number of random draws, so changing the column
 * count or the figure set reshuffles nothing but the cells that change.
 */
import { formatNumber } from "../../curves";
import type { Rng } from "../../rng";
import { stableId, svgBackground, svgDocument } from "../../svg";

export const BAUHAUS_FIGURES = [
  "quarter",
  "half",
  "circle",
  "dot",
  "ring",
  "lens",
  "triangle",
  "square",
  "stripes",
] as const;
export type BauhausFigure = (typeof BAUHAUS_FIGURES)[number];

export const BAUHAUS_SETS = ["mixed", "curves", "angles"] as const;
export type BauhausSet = (typeof BAUHAUS_SETS)[number];

const SET_FIGURES: Readonly<Record<BauhausSet, readonly BauhausFigure[]>> = {
  mixed: BAUHAUS_FIGURES,
  curves: ["quarter", "half", "circle", "dot", "ring", "lens"],
  angles: ["triangle", "square", "stripes", "quarter"],
};

export const BAUHAUS_COLUMNS_MIN = 1;
export const BAUHAUS_COLUMNS_MAX = 32;
/** Hard cap on drawn cells, for very wide or tall canvases. */
const MAX_CELLS = 2400;

export interface BauhausOptions {
  readonly width: number;
  readonly height: number;
  /** Gap colour between the tiles. */
  readonly background: string;
  /** Tile and figure colours (at least two are used). */
  readonly colors: readonly string[];
  readonly set: BauhausSet;
  readonly columns: number;
  /** Gap between tiles as a share of the cell in [0, 0.3]. */
  readonly gap: number;
  /** Share of tiles with a figure in [0, 1]. */
  readonly density: number;
  /** Corner radius of the tiles as a share of the cell in [0, 0.5]. */
  readonly radius: number;
  readonly rng: Rng;
}

export interface BauhausCell {
  readonly col: number;
  readonly row: number;
  readonly tile: string;
  readonly figure: BauhausFigure | null;
  readonly color: string;
  /** Quarter turns 0 to 3. */
  readonly turn: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const f = (v: number): string => formatNumber(v, 2);

export function bauhausGrid(o: Pick<BauhausOptions, "width" | "height" | "columns">): {
  cols: number;
  rows: number;
  cell: number;
} {
  const cols = Math.round(clamp(o.columns, BAUHAUS_COLUMNS_MIN, BAUHAUS_COLUMNS_MAX));
  const cell = o.width / cols;
  const rows = Math.max(1, Math.min(Math.ceil(o.height / cell), Math.floor(MAX_CELLS / cols)));
  return { cols, rows, cell };
}

/** Seeded cells, row by row. Five draws per cell. */
export function bauhausCells(o: BauhausOptions): BauhausCell[] {
  const { cols, rows } = bauhausGrid(o);
  const colors = o.colors.length >= 2 ? o.colors : [...o.colors, "#111111", "#f5f0e6"];
  const figures = SET_FIGURES[o.set];
  const density = clamp(o.density, 0, 1);
  const cells: BauhausCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tileIndex = Math.floor(o.rng.next() * colors.length);
      // The figure colour skips the tile colour, so every figure shows.
      const offset = 1 + Math.floor(o.rng.next() * (colors.length - 1));
      const pick = o.rng.next();
      const show = o.rng.next() < density;
      const turn = Math.floor(o.rng.next() * 4);
      cells.push({
        col,
        row,
        tile: colors[tileIndex] as string,
        figure: show ? (figures[Math.floor(pick * figures.length)] as BauhausFigure) : null,
        color: colors[(tileIndex + offset) % colors.length] as string,
        turn,
      });
    }
  }
  return cells;
}

/**
 * Figure in a unit cell from (0, 0) to (s, s), before the quarter turn.
 * Corner figures sit in the top left corner.
 */
export function bauhausFigurePath(figure: BauhausFigure, s: number): string {
  const h = s / 2;
  switch (figure) {
    case "quarter":
      return `M0 0H${f(s)}A${f(s)} ${f(s)} 0 0 1 0 ${f(s)}Z`;
    case "half":
      return `M0 0H${f(s)}A${f(h)} ${f(h)} 0 0 1 0 0Z`;
    case "circle":
      return circle(h, h, h * 0.92);
    case "dot":
      return circle(h, h, h * 0.42);
    case "ring":
      // Even-odd: outer circle minus inner circle.
      return `${circle(h, h, h * 0.92)}${circle(h, h, h * 0.5)}`;
    case "lens":
      return `M${f(s)} 0A${f(s)} ${f(s)} 0 0 0 0 ${f(s)}A${f(s)} ${f(s)} 0 0 0 ${f(s)} 0Z`;
    case "triangle":
      return `M0 0H${f(s)}L0 ${f(s)}Z`;
    case "square":
      return `M${f(s * 0.2)} ${f(s * 0.2)}H${f(s * 0.8)}V${f(s * 0.8)}H${f(s * 0.2)}Z`;
    case "stripes": {
      let d = "";
      for (let k = 0; k < 3; k++) {
        const y = (s / 3) * k + s / 12;
        d += `M0 ${f(y)}H${f(s)}V${f(y + s / 6)}H0Z`;
      }
      return d;
    }
  }
}

function circle(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
}

/**
 * Bauhaus pattern as SVG. Figures are clipped to their tile. Cells are drawn
 * in reading order, tile then figure; without a gap every cell reaches half a
 * pixel into its right and lower neighbour, which are drawn later and cover
 * it, so anti-aliasing leaves no seams between the tiles.
 */
export function bauhausSvg(o: BauhausOptions): string {
  const { width: w, height: h } = o;
  const { cell } = bauhausGrid(o);
  const gap = cell * clamp(o.gap, 0, 0.3);
  const s = gap > 0 ? cell - gap : cell + 0.5;
  const rx = s * clamp(o.radius, 0, 0.5);
  const parts: string[] = [svgBackground(o.background, w, h)];
  // One clip path for every tile (the same rounded square), placed by the group transform.
  const clipId = stableId("bh", `${f(s)} ${f(rx)}`);
  parts.push(
    `<defs><clipPath id="${clipId}"><rect width="${f(s)}" height="${f(s)}" rx="${f(rx)}"/></clipPath></defs>`,
  );
  const tile = `<rect width="${f(s)}" height="${f(s)}"${rx > 0 ? ` rx="${f(rx)}"` : ""}`;
  for (const c of bauhausCells(o)) {
    const x = c.col * cell + gap / 2;
    const y = c.row * cell + gap / 2;
    let figure = "";
    if (c.figure) {
      const turn = c.turn * 90;
      figure = `<path d="${bauhausFigurePath(c.figure, s)}"${turn ? ` transform="rotate(${turn} ${f(s / 2)} ${f(s / 2)})"` : ""} fill="${c.color}" fill-rule="evenodd" clip-path="url(#${clipId})"/>`;
    }
    parts.push(`<g transform="translate(${f(x)} ${f(y)})">${tile} fill="${c.tile}"/>${figure}</g>`);
  }
  return svgDocument(w, h, parts.join(""));
}
