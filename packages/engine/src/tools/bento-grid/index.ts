/**
 * Bento grid (docs/TOOLS.md J3): a layout from `bentoLayout` drawn as
 * rounded tiles (SVG) and written as CSS Grid plus HTML or Tailwind classes.
 * SVG and code share one geometry: tile rectangles are exactly where the
 * browser places the grid items for the same columns, rows, gap and padding.
 */
import { formatNumber } from "../../curves";
import { bestTextColor } from "../../palette/contrast";
import type { Rng } from "../../rng";
import { svgDocument } from "../../svg";
import type { BentoTile } from "./layout";

export * from "./layout";

export const BENTO_FILLS = ["single", "palette-random", "palette-order"] as const;
export type BentoFill = (typeof BENTO_FILLS)[number];

export const BENTO_CONTENTS = ["empty", "title", "icon", "lines", "mixed"] as const;
export type BentoContent = (typeof BENTO_CONTENTS)[number];

/** Placeholder kinds actually drawn in one tile. */
export type BentoTileContent = "empty" | "title" | "icon" | "lines";

export interface BentoStyle {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  /** Gap between tiles and padding around the grid, in px. */
  readonly gap: number;
  readonly padding: number;
  /** Corner radius of the tiles, in px. */
  readonly radius: number;
  /** Canvas colour (hex) or "transparent". */
  readonly background: string;
}

const MIXED_CONTENTS: readonly BentoTileContent[] = ["title", "icon", "lines", "empty"];

/** A tile with its colour and placeholder, ready to draw or write as code. */
export interface PaintedTile extends BentoTile {
  readonly color: string;
  /** Colour of the placeholder marks (best contrast on `color`). */
  readonly ink: string;
  readonly content: BentoTileContent;
}

/** Pixel rectangle of a tile for the given style (CSS Grid track maths). */
export function tileRect(
  tile: BentoTile,
  s: BentoStyle,
): { x: number; y: number; width: number; height: number } {
  const cellW = Math.max(0, (s.width - 2 * s.padding - (s.columns - 1) * s.gap) / s.columns);
  const cellH = Math.max(0, (s.height - 2 * s.padding - (s.rows - 1) * s.gap) / s.rows);
  return {
    x: s.padding + tile.col * (cellW + s.gap),
    y: s.padding + tile.row * (cellH + s.gap),
    width: tile.colSpan * cellW + (tile.colSpan - 1) * s.gap,
    height: tile.rowSpan * cellH + (tile.rowSpan - 1) * s.gap,
  };
}

/**
 * Colours and placeholders per tile. `single` uses the first palette colour,
 * `palette-order` cycles through the palette in reading order and
 * `palette-random` draws from it without repeating a colour twice in a row.
 */
export function paintTiles(
  rng: Rng,
  tiles: readonly BentoTile[],
  palette: readonly string[],
  fill: BentoFill,
  content: BentoContent,
): PaintedTile[] {
  const first = palette[0] ?? "#888888";
  let previous = -1;
  return tiles.map((tile, i) => {
    let index = 0;
    if (fill === "palette-order") index = i % palette.length;
    else if (fill === "palette-random") {
      index = rng.int(0, palette.length - 1);
      if (palette.length > 1 && index === previous) index = (index + 1) % palette.length;
    }
    previous = index;
    const color = fill === "single" ? first : (palette[index] ?? first);
    const kind: BentoTileContent =
      content === "mixed"
        ? (MIXED_CONTENTS[rng.int(0, MIXED_CONTENTS.length - 1)] ?? "empty")
        : (content as BentoTileContent);
    return { ...tile, color, ink: bestTextColor(color).color, content: kind };
  });
}

const f = (v: number): string => formatNumber(v);

/** Placeholder marks of a tile as SVG elements (fill = ink, low opacity). */
function contentSvg(t: PaintedTile, r: { x: number; y: number; width: number; height: number }) {
  if (t.content === "empty") return "";
  const unit = Math.max(2, Math.min(r.width, r.height));
  const pad = Math.min(unit * 0.14, 32);
  const x = r.x + pad;
  const y = r.y + pad;
  const innerW = Math.max(0, r.width - 2 * pad);
  const bar = Math.max(2, Math.min(unit * 0.07, 18));
  const attrs = `fill="${t.ink}" fill-opacity="0.72"`;
  switch (t.content) {
    case "title":
      return (
        `<rect x="${f(x)}" y="${f(y)}" width="${f(innerW * 0.6)}" height="${f(bar * 1.4)}" rx="${f(bar * 0.7)}" ${attrs}/>` +
        `<rect x="${f(x)}" y="${f(y + bar * 2.4)}" width="${f(innerW * 0.4)}" height="${f(bar)}" rx="${f(bar / 2)}" fill="${t.ink}" fill-opacity="0.4"/>`
      );
    case "icon": {
      const radius = Math.max(2, Math.min(unit * 0.12, 40));
      return `<circle cx="${f(x + radius)}" cy="${f(y + radius)}" r="${f(radius)}" ${attrs}/>`;
    }
    case "lines": {
      const lines: string[] = [];
      const gap = bar * 1.9;
      const count = Math.max(1, Math.min(4, Math.floor((r.height - 2 * pad) / gap)));
      for (let i = 0; i < count; i++) {
        const w = innerW * (i === count - 1 ? 0.55 : 0.9);
        lines.push(
          `<rect x="${f(x)}" y="${f(r.y + r.height - pad - (count - i) * gap + (gap - bar))}" width="${f(w)}" height="${f(bar)}" rx="${f(bar / 2)}" fill="${t.ink}" fill-opacity="0.45"/>`,
        );
      }
      return lines.join("");
    }
  }
}

/** The grid as an SVG document: background, rounded tiles, placeholder marks. */
export function bentoSvg(tiles: readonly PaintedTile[], s: BentoStyle): string {
  const parts: string[] = [];
  if (s.background !== "transparent") {
    parts.push(`<rect width="${f(s.width)}" height="${f(s.height)}" fill="${s.background}"/>`);
  }
  for (const t of tiles) {
    const r = tileRect(t, s);
    const rx = Math.min(s.radius, r.width / 2, r.height / 2);
    parts.push(
      `<rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.width)}" height="${f(r.height)}" rx="${f(rx)}" fill="${t.color}"/>`,
    );
    parts.push(contentSvg(t, r));
  }
  return svgDocument(s.width, s.height, parts.join(""));
}

// ---------------------------------------------------------------------------
// Code
// ---------------------------------------------------------------------------

/** Options of the code exports beyond the drawing style. */
export interface BentoCodeOptions extends BentoStyle {
  /** Columns below the breakpoint (tiles then follow in reading order). */
  readonly breakpointColumns: number;
  /** Viewport width in px below which the narrow layout applies. */
  readonly breakpoint: number;
}

/** Span of a tile in the narrow layout. */
const narrowSpan = (t: BentoTile, columns: number) => Math.min(t.colSpan, columns);

/** Height of one row track in the narrow layout, in px (cell height of the canvas, at least 80). */
function narrowRowHeight(s: BentoStyle): number {
  return Math.round(
    Math.max(80, (s.height - 2 * s.padding - (s.rows - 1) * s.gap) / Math.max(1, s.rows)),
  );
}

/**
 * Stylesheet plus HTML skeleton: the grid has the canvas aspect ratio, each
 * tile its explicit area; below the breakpoint the grid has
 * `breakpointColumns` columns and fixed row heights, tiles in reading order.
 */
export function bentoHtml(tiles: readonly PaintedTile[], o: BentoCodeOptions): string {
  const narrow = Math.max(1, Math.min(o.breakpointColumns, o.columns));
  const bg = o.background === "transparent" ? "" : `\n  background: ${o.background};`;
  const css = [
    ".bento {",
    "  display: grid;",
    `  grid-template-columns: repeat(${o.columns}, minmax(0, 1fr));`,
    `  grid-template-rows: repeat(${o.rows}, minmax(0, 1fr));`,
    `  gap: ${f(o.gap)}px;`,
    `  padding: ${f(o.padding)}px;`,
    `  aspect-ratio: ${f(o.width)} / ${f(o.height)};${bg}`,
    "}",
    ".bento > * {",
    `  border-radius: ${f(o.radius)}px;`,
    "  grid-column: var(--col) / span var(--col-span);",
    "  grid-row: var(--row) / span var(--row-span);",
    "}",
    `@media (max-width: ${f(o.breakpoint - 0.02)}px) {`,
    "  .bento {",
    `    grid-template-columns: repeat(${narrow}, minmax(0, 1fr));`,
    "    grid-template-rows: none;",
    `    grid-auto-rows: ${narrowRowHeight(o)}px;`,
    "    aspect-ratio: auto;",
    "  }",
    "  .bento > * {",
    "    grid-column: auto / span var(--narrow-span);",
    "    grid-row: auto / span 1;",
    "  }",
    "}",
  ].join("\n");
  const items = tiles.map(
    (t) =>
      `  <div style="--col: ${t.col + 1}; --row: ${t.row + 1}; --col-span: ${t.colSpan}; --row-span: ${t.rowSpan}; --narrow-span: ${narrowSpan(t, narrow)}; background: ${t.color}; color: ${t.ink};"></div>`,
  );
  return `<style>\n${css}\n</style>\n<div class="bento">\n${items.join("\n")}\n</div>\n`;
}

/** Breakpoint prefix of the Tailwind classes (`md` = 768 px by default). */
export const BENTO_TAILWIND_BREAKPOINT = "md";

/**
 * Tailwind markup (v3 and v4): narrow layout as base classes, the full
 * layout from `md:` on, arbitrary values for spans and sizes.
 */
export function bentoTailwind(tiles: readonly PaintedTile[], o: BentoCodeOptions): string {
  const narrow = Math.max(1, Math.min(o.breakpointColumns, o.columns));
  const bp = BENTO_TAILWIND_BREAKPOINT;
  const bg = o.background === "transparent" ? "" : ` bg-[${o.background}]`;
  const grid = [
    "grid",
    `grid-cols-[repeat(${narrow},minmax(0,1fr))]`,
    `auto-rows-[${narrowRowHeight(o)}px]`,
    `${bp}:grid-cols-[repeat(${o.columns},minmax(0,1fr))]`,
    `${bp}:grid-rows-[repeat(${o.rows},minmax(0,1fr))]`,
    `${bp}:auto-rows-auto`,
    `${bp}:aspect-[${f(o.width)}/${f(o.height)}]`,
    `gap-[${f(o.gap)}px]`,
    `p-[${f(o.padding)}px]`,
  ].join(" ");
  const items = tiles.map((t) => {
    const cls = [
      `col-span-${narrowSpan(t, narrow)}`,
      `${bp}:col-[${t.col + 1}/span_${t.colSpan}]`,
      `${bp}:row-[${t.row + 1}/span_${t.rowSpan}]`,
      `rounded-[${f(o.radius)}px]`,
      `bg-[${t.color}]`,
    ].join(" ");
    return `  <div class="${cls}"></div>`;
  });
  return `<div class="${grid}${bg}">\n${items.join("\n")}\n</div>\n`;
}
