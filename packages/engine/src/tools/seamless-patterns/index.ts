/**
 * Seamless Patterns (docs/TOOLS.md A2): one repeat tile, filled with a motif
 * per cell, that tiles without visible seams.
 *
 * The tile is a block of cells. Every cell gets one element with its own
 * seeded jitter, rotation, size and colour. Elements that reach over the
 * tile edge are repeated at the opposite edges (offset ±tile width/height),
 * so the tile wraps: what leaves on the right comes back on the left.
 *
 * Tiling modes:
 * - `grid`: plain rows and columns;
 * - `brick`: every second row shifted by half a cell (row count even);
 * - `halfDrop`: every second column shifted down by half a cell (column count even);
 * - `mirror`: the cell block is mirrored to the right and down (2 × 2 blocks),
 *   elements flipped with it.
 *
 * Alternation (`alternate`) turns every second row, or every second cell
 * in a checkerboard, by 180°: the classic logo wall. The affected side is
 * made even so the tile still wraps.
 *
 * Several motifs (a list of emoji, for example) are spread over the cells
 * with extra draws after all cell draws, so a single motif keeps the exact
 * output of earlier versions.
 *
 * The full design is an SVG `<pattern>` of that tile on a rect, so the
 * element count does not grow with the canvas size. The same tile markup
 * also builds the standalone tile (CSS background, PNG tile export).
 */
import { formatNumber } from "../../curves";
import { toBase64 } from "../../png";
import type { Rng } from "../../rng";
import { escapeXml, stableId, svgBackground, svgDocument } from "../../svg";

export * from "./shapes";

export const SEAMLESS_TILINGS = ["grid", "brick", "halfDrop", "mirror"] as const;
export type SeamlessTiling = (typeof SEAMLESS_TILINGS)[number];

export const SEAMLESS_ALTERNATES = ["none", "rows", "checker"] as const;
export type SeamlessAlternate = (typeof SEAMLESS_ALTERNATES)[number];

/** Smallest cell edge in px; guards share links with tiny sizes. */
export const SEAMLESS_MIN_CELL = 8;
/** Largest cells per tile side before parity doubling (mirror doubles both sides). */
export const SEAMLESS_MAX_CELLS = 6;
/** Upper bound of elements in one tile including the wrap copies. */
export const SEAMLESS_MAX_ELEMENTS = 2000;

export interface SeamlessLayoutOptions {
  readonly tiling: SeamlessTiling;
  /** Element size in px (the motif's longer side). */
  readonly size: number;
  /** Gap between elements in px. */
  readonly spacingX: number;
  readonly spacingY: number;
  /** Cells per tile side (1 = every cell identical up to parity). */
  readonly cells: number;
  /** Fixed rotation in degrees. */
  readonly rotation: number;
  /** Random rotation in ± degrees around `rotation`. */
  readonly rotationJitter: number;
  /** Random size change, 0 to 1 (± share of `size`). */
  readonly sizeVariance: number;
  /** Random offset in ± share of the cell, 0 to 0.5. */
  readonly jitter: number;
  /** Number of colours to pick from (1 = every element gets colour 0). */
  readonly colorCount: number;
  /** Width / height of the motif (1 for the built-in shapes). */
  readonly aspect: number;
  /** Turn every second row or checkerboard cell by 180°. Default `none`. */
  readonly alternate?: SeamlessAlternate;
  /**
   * Size cells from the motif box instead of a square of `size` (wide words
   * get flat cells). Default false: square cells, as for shapes and uploads.
   */
  readonly cellFromBox?: boolean;
  /** Number of different motifs spread over the cells. Default 1. */
  readonly motifCount?: number;
  readonly rng: Rng;
}

/** One drawn element: centre, transform parts and colour index. */
export interface SeamlessPlacement {
  readonly x: number;
  readonly y: number;
  /** Degrees, applied after the flips. */
  readonly rotation: number;
  /** Multiplier of the element size. */
  readonly scale: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly color: number;
  /** Motif index (0 with a single motif). */
  readonly motif: number;
  /** Index of the base element this is (a copy of). */
  readonly base: number;
}

export interface SeamlessLayout {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly cols: number;
  readonly rows: number;
  /** Width and height of the motif box at scale 1 (longer side = size). */
  readonly boxWidth: number;
  readonly boxHeight: number;
  /** One element per cell, before wrapping. */
  readonly base: readonly SeamlessPlacement[];
  /** Everything drawn in the tile: base elements plus their wrap copies. */
  readonly placements: readonly SeamlessPlacement[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Random values of one cell. Always five draws, so options never shift other cells. */
interface CellRandom {
  dx: number;
  dy: number;
  rot: number;
  scale: number;
  color: number;
}

function drawCell(rng: Rng): CellRandom {
  return {
    dx: rng.next() * 2 - 1,
    dy: rng.next() * 2 - 1,
    rot: rng.next() * 2 - 1,
    scale: rng.next() * 2 - 1,
    color: rng.next(),
  };
}

/** Half the diagonal of the (rotated) element box: a safe bounding radius. */
function radiusOf(layout: Pick<SeamlessLayout, "boxWidth" | "boxHeight">, scale: number): number {
  return (Math.hypot(layout.boxWidth, layout.boxHeight) / 2) * scale;
}

/** Tile offsets k·period where an element at `c` with radius `r` touches [0, period]. */
function wrapOffsets(c: number, r: number, period: number): number[] {
  const out: number[] = [];
  const lo = Math.ceil((-r - c) / period - 1e-9);
  const hi = Math.floor((period + r - c) / period + 1e-9);
  for (let k = lo; k <= hi; k++) {
    const p = c + k * period;
    // Strict overlap: an element exactly touching an edge draws nothing there.
    if (p + r > 1e-9 && p - r < period - 1e-9) out.push(k * period);
  }
  return out;
}

/** Computes the repeat tile and every element in it. Pure, seeded only by `rng`. */
export function seamlessLayout(o: SeamlessLayoutOptions): SeamlessLayout {
  const size = Math.max(1, o.size);
  const aspect = Number.isFinite(o.aspect) && o.aspect > 0 ? o.aspect : 1;
  const boxWidth = aspect >= 1 ? size : size * aspect;
  const boxHeight = aspect >= 1 ? size / aspect : size;
  const cellWidth = Math.max(
    SEAMLESS_MIN_CELL,
    (o.cellFromBox ? boxWidth : size) + Math.max(0, o.spacingX),
  );
  const cellHeight = Math.max(
    SEAMLESS_MIN_CELL,
    (o.cellFromBox ? boxHeight : size) + Math.max(0, o.spacingY),
  );
  const n = clamp(Math.round(o.cells), 1, SEAMLESS_MAX_CELLS);
  const even = (v: number): number => (v % 2 === 0 ? v : v * 2);
  let cols = n;
  let rows = n;
  if (o.tiling === "brick") rows = even(n);
  if (o.tiling === "halfDrop") cols = even(n);
  if (o.tiling === "mirror") {
    cols = 2 * n;
    rows = 2 * n;
  }
  const alternate = o.alternate ?? "none";
  if (alternate !== "none") rows = even(rows);
  if (alternate === "checker") cols = even(cols);
  const tileWidth = cols * cellWidth;
  const tileHeight = rows * cellHeight;
  const jitter = clamp(o.jitter, 0, 0.5);
  const variance = clamp(o.sizeVariance, 0, 1);
  const colors = Math.max(1, Math.floor(o.colorCount));

  // Mirror draws one block of n × n cells and reflects it; other modes draw every cell.
  const drawCols = o.tiling === "mirror" ? n : cols;
  const drawRows = o.tiling === "mirror" ? n : rows;
  const random: CellRandom[] = [];
  for (let i = 0; i < drawCols * drawRows; i++) random.push(drawCell(o.rng));
  // Drawn after every cell, only with several motifs: one motif keeps older output.
  const motifs = Math.max(1, Math.floor(o.motifCount ?? 1));
  const motifOf: number[] = [];
  if (motifs > 1) for (let i = 0; i < random.length; i++) motifOf.push(o.rng.int(0, motifs - 1));

  const base: SeamlessPlacement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mirrorX = o.tiling === "mirror" && c >= n;
      const mirrorY = o.tiling === "mirror" && r >= n;
      const bc = mirrorX ? 2 * n - 1 - c : c;
      const br = mirrorY ? 2 * n - 1 - r : r;
      const cellIndex = (br % drawRows) * drawCols + (bc % drawCols);
      const cell = random[cellIndex] as CellRandom;
      const turned =
        (alternate === "rows" && r % 2 === 1) || (alternate === "checker" && (r + c) % 2 === 1);
      let x = (c + 0.5) * cellWidth;
      let y = (r + 0.5) * cellHeight;
      if (o.tiling === "brick" && r % 2 === 1) x += cellWidth / 2;
      if (o.tiling === "halfDrop" && c % 2 === 1) y += cellHeight / 2;
      x += (mirrorX ? -cell.dx : cell.dx) * jitter * cellWidth;
      y += (mirrorY ? -cell.dy : cell.dy) * jitter * cellHeight;
      base.push({
        x,
        y,
        rotation: o.rotation + cell.rot * o.rotationJitter + (turned ? 180 : 0),
        scale: Math.max(0.05, 1 + cell.scale * variance),
        flipX: mirrorX,
        flipY: mirrorY,
        color: colors === 1 ? 0 : Math.min(colors - 1, Math.floor(cell.color * colors)),
        motif: motifOf[cellIndex] ?? 0,
        base: base.length,
      });
    }
  }

  const layout = { boxWidth, boxHeight };
  const placements: SeamlessPlacement[] = [];
  for (const b of base) {
    const radius = radiusOf(layout, b.scale);
    for (const oy of wrapOffsets(b.y, radius, tileHeight)) {
      for (const ox of wrapOffsets(b.x, radius, tileWidth)) {
        if (placements.length >= SEAMLESS_MAX_ELEMENTS) break;
        placements.push({ ...b, x: b.x + ox, y: b.y + oy });
      }
    }
  }

  return {
    tileWidth,
    tileHeight,
    cellWidth,
    cellHeight,
    cols,
    rows,
    boxWidth,
    boxHeight,
    base,
    placements,
  };
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

/**
 * What every element draws: a built-in path (filled per colour) or an
 * image. Images come with one source per colour (a recoloured SVG per
 * palette colour) or one source plus `tint`, which paints the image's
 * silhouette in the element colour (monochrome raster uploads).
 */
export type SeamlessMotif =
  | { readonly kind: "path"; readonly d: string }
  | {
      readonly kind: "image";
      /** `data:` URIs; element colour `i` uses `hrefs[i % hrefs.length]`. */
      readonly hrefs: readonly string[];
      /** Paint the silhouette in the element colour (filter on the colour group). */
      readonly tint: boolean;
    }
  | {
      readonly kind: "glyphs";
      /** One text per motif (an emoji or a word); `placement.motif` indexes into it. */
      readonly glyphs: readonly string[];
      /** CSS font family list (system fonts; the SVG embeds no font). */
      readonly fontFamily: string;
      readonly fontWeight: number;
      /** Font size in the 100-unit motif box (longer side = 100). */
      readonly em: number;
      /**
       * `fill`: glyphs in the element colour (text); `tint`: silhouette in the
       * element colour (monochrome emoji); `original`: the font's own colours.
       */
      readonly paint: "fill" | "tint" | "original";
    };

export interface SeamlessSvgOptions {
  readonly layout: SeamlessLayout;
  readonly motif: SeamlessMotif;
  /** Element colours (`placement.color` indexes into it). */
  readonly colors: readonly string[];
  /** Solid colour or `"transparent"`. */
  readonly background: string;
}

const n2 = (v: number): string => formatNumber(v, 2);

function transformOf(p: SeamlessPlacement, unit: number): string {
  const parts = [`translate(${n2(p.x)} ${n2(p.y)})`];
  if (p.flipX || p.flipY) parts.push(`scale(${p.flipX ? -1 : 1} ${p.flipY ? -1 : 1})`);
  const rot = ((p.rotation % 360) + 360) % 360;
  if (Math.abs(rot) > 1e-6 && Math.abs(rot - 360) > 1e-6) parts.push(`rotate(${n2(rot)})`);
  const s = p.scale * unit;
  if (Math.abs(s - 1) > 1e-6) parts.push(`scale(${formatNumber(s, 4)})`);
  return parts.join("");
}

/** Defs and drawn content of the tile, shared by the pattern and the standalone tile. */
function tileMarkup(o: SeamlessSvgOptions): { defs: string; body: string } {
  const { layout, motif } = o;
  const colors = o.colors.length > 0 ? o.colors : ["#000000"];
  // Elements grouped by colour (compact SVG), groups in colour order.
  const byColor = new Map<number, SeamlessPlacement[]>();
  for (const p of layout.placements) {
    const key = p.color % colors.length;
    const list = byColor.get(key);
    if (list) list.push(p);
    else byColor.set(key, [p]);
  }
  const used = [...byColor.keys()].sort((a, b) => a - b);

  if (motif.kind === "path") {
    const id = stableId("sm", motif.d);
    // Shapes are drawn in a 100-unit box; `unit` scales that box to the element size.
    const unit = Math.max(layout.boxWidth, layout.boxHeight) / 100;
    const defs = `<path id="${id}" d="${motif.d}"/>`;
    const body = used
      .map((c) => {
        const uses = (byColor.get(c) ?? [])
          .map((p) => `<use href="#${id}" transform="${transformOf(p, unit)}"/>`)
          .join("");
        return `<g fill="${colors[c]}">${uses}</g>`;
      })
      .join("");
    return { defs, body };
  }

  if (motif.kind === "glyphs") return glyphMarkup(o, motif, used, byColor, colors);

  // Images: one <image> per distinct source, centred on the origin at box size.
  const w = n2(layout.boxWidth);
  const h = n2(layout.boxHeight);
  const x = n2(-layout.boxWidth / 2);
  const y = n2(-layout.boxHeight / 2);
  const hrefs = motif.hrefs.length > 0 ? motif.hrefs : [""];
  const imageIds = new Map<number, string>();
  let defs = "";
  const imageFor = (color: number): string => {
    const index = motif.tint ? 0 : color % hrefs.length;
    let id = imageIds.get(index);
    if (id === undefined) {
      const href = hrefs[index] ?? "";
      id = stableId("si", `${index}:${href.length}:${href.slice(0, 64)}:${href.slice(-64)}`);
      imageIds.set(index, id);
      defs += `<image id="${id}" href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
    }
    return id;
  };
  let body = "";
  for (const c of used) {
    const id = imageFor(c);
    const uses = (byColor.get(c) ?? [])
      .map((p) => `<use href="#${id}" transform="${transformOf(p, 1)}"/>`)
      .join("");
    if (motif.tint) {
      const f = tintFilter(c, colors[c] ?? "#000000");
      defs += f.markup;
      body += `<g filter="url(#${f.id})">${uses}</g>`;
    } else {
      body += `<g>${uses}</g>`;
    }
  }
  return { defs, body };
}

/** Filter that paints whatever it is applied to in one colour (keeps alpha). */
function tintFilter(c: number, color: string): { id: string; markup: string } {
  const id = stableId("st", `${c}:${color}`);
  return {
    id,
    markup:
      `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
      `<feFlood flood-color="${color}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`,
  };
}

/** Emoji and words: one `<text>` per motif in defs, centred on the origin. */
function glyphMarkup(
  o: SeamlessSvgOptions,
  motif: Extract<SeamlessMotif, { kind: "glyphs" }>,
  used: readonly number[],
  byColor: ReadonlyMap<number, SeamlessPlacement[]>,
  colors: readonly string[],
): { defs: string; body: string } {
  const glyphs = motif.glyphs.length > 0 ? motif.glyphs : [""];
  const unit = Math.max(o.layout.boxWidth, o.layout.boxHeight) / 100;
  const font = escapeXml(motif.fontFamily);
  const ids = glyphs.map((g, i) => stableId("sg", `${i}:${g}:${motif.fontFamily}`));
  // Font attributes sit on every <text>: a <use> copy inherits from the <use>, not from defs.
  const attrs =
    `font-family="${font}" font-weight="${Math.round(motif.fontWeight)}" ` +
    `font-size="${n2(motif.em)}" text-anchor="middle" dominant-baseline="central"`;
  let defs = glyphs.map((g, i) => `<text id="${ids[i]}" ${attrs}>${escapeXml(g)}</text>`).join("");
  let body = "";
  for (const c of used) {
    const uses = (byColor.get(c) ?? [])
      .map((p) => `<use href="#${ids[p.motif % ids.length]}" transform="${transformOf(p, unit)}"/>`)
      .join("");
    const color = colors[c] ?? "#000000";
    if (motif.paint === "fill") body += `<g fill="${color}">${uses}</g>`;
    else if (motif.paint === "tint") {
      const f = tintFilter(c, color);
      defs += f.markup;
      body += `<g filter="url(#${f.id})">${uses}</g>`;
    } else body += `<g>${uses}</g>`;
  }
  return { defs, body };
}

/** The repeat tile as a standalone SVG (CSS background, PNG tile). */
export function seamlessTileSvg(o: SeamlessSvgOptions): string {
  const { tileWidth: w, tileHeight: h } = o.layout;
  const { defs, body } = tileMarkup(o);
  return svgDocument(
    w,
    h,
    `<defs>${defs}</defs>${svgBackground(o.background, w, h)}<g>${body}</g>`,
  );
}

/** The full design: the tile as an SVG pattern on a canvas of `width` × `height`. */
export function seamlessPatternSvg(
  o: SeamlessSvgOptions & { readonly width: number; readonly height: number },
): string {
  const { tileWidth: tw, tileHeight: th } = o.layout;
  const { defs, body } = tileMarkup(o);
  const pid = stableId("sp", `${tw}x${th}:${body.length}:${body.slice(0, 256)}`);
  const pattern =
    `<pattern id="${pid}" width="${n2(tw)}" height="${n2(th)}" patternUnits="userSpaceOnUse">` +
    `${body}</pattern>`;
  return svgDocument(
    o.width,
    o.height,
    `<defs>${defs}${pattern}</defs>${svgBackground(o.background, o.width, o.height)}` +
      `<rect width="${n2(o.width)}" height="${n2(o.height)}" fill="url(#${pid})"/>`,
  );
}

/** UTF-8 bytes of a string (engine code runs without TextEncoder typings). */
function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0xfffd;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
  }
  return Uint8Array.from(out);
}

/** `data:image/svg+xml;base64,...` of an SVG string (safe inside an attribute). */
export function svgBase64DataUri(svg: string): string {
  return `data:image/svg+xml;base64,${toBase64(utf8(svg))}`;
}
