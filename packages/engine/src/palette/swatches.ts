/**
 * SVG rendering of colour swatches with value labels, WCAG contrast of the
 * label text and an optional contrast matrix. Shared by the colour tools, so
 * preview and PNG/SVG export show the same thing (one render path).
 *
 * Labels contain no words, only colour values, step numbers and the WCAG
 * levels "AA"/"AAA", so the SVG needs no translation.
 */
import { formatNumber } from "../curves";
import { svgDocument } from "../svg";
import { bestTextColor, contrastRatio, formatRatio, wcagLevel } from "./contrast";
import { formatColor, normalizeHex, type ColorFormat } from "./format";

/** What each swatch shows as its value line. */
export const SWATCH_LABELS = ["none", "hex", "rgb", "hsl", "oklch"] as const;
export type SwatchLabel = (typeof SWATCH_LABELS)[number];

export interface Swatch {
  color: string;
  /** Bold first line, e.g. the Tailwind step "500". */
  title?: string;
  /** Draws a small dot in the top right corner, e.g. on the base colour of a scale. */
  marked?: boolean;
}

export interface SwatchesSvgOptions {
  width: number;
  height: number;
  swatches: readonly Swatch[];
  label: SwatchLabel;
  /** Shows the label colour's contrast ratio (and AA/AAA) on every swatch. */
  contrast: boolean;
  /** Adds an n × n grid with the contrast of every colour on every other colour. */
  matrix?: boolean;
}

/** System UI fonts: available when the SVG is rasterised from an `<img>`. */
const FONT =
  "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
/** Average glyph advance relative to the font size, a conservative estimate for fitting. */
const CHAR_WIDTH = 0.62;

const f = (v: number): string => formatNumber(v, 2);

function escapeXml(text: string): string {
  return text.replace(/[<>&"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;",
  );
}

/** Compact value text: `#1e90ff`, `30 144 255`, `210 100% 55.9%`, `62.3% 0.214 259.8`. */
export function swatchValue(hex: string, label: Exclude<SwatchLabel, "none">): string {
  const full = formatColor(hex, label as ColorFormat);
  if (label === "hex") return full;
  return full
    .replace(/^[a-z]+\(/, "")
    .replace(/\)$/, "")
    .replace(/,\s*/g, " ");
}

/** Contrast text, e.g. `4.6:1 AA`; levels below AA show the ratio only. */
export function contrastText(ratio: number): string {
  const level = wcagLevel(ratio);
  const suffix = level === "aaa" ? " AAA" : level === "aa" ? " AA" : "";
  return `${formatRatio(ratio)}:1${suffix}`;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Line {
  text: string;
  bold?: boolean;
  scale: number;
}

const LINE_HEIGHT = 1.3;
const rect = (b: Box, fill: string): string =>
  `<rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" fill="${fill}"/>`;
const padding = (b: Box): number => Math.min(b.w, b.h) * 0.08;

/** Largest font size at which `lines` fit into `box`. */
function fitFont(box: Box, lines: readonly Line[], maxFont: number): number {
  if (lines.length === 0) return maxFont;
  const pad = padding(box);
  const widest = Math.max(...lines.map((l) => l.text.length * l.scale));
  return Math.min(
    maxFont,
    Math.max(1, box.w - 2 * pad) / (widest * CHAR_WIDTH),
    (box.h - 2 * pad) / (lines.length * LINE_HEIGHT),
  );
}

/** Label lines bottom-left in `box`. */
function labelBlock(box: Box, lines: readonly Line[], fill: string, fs: number): string {
  if (lines.length === 0) return "";
  const pad = padding(box);
  let y = box.y + box.h - pad - (lines.length - 1) * fs * LINE_HEIGHT;
  let out = "";
  for (const line of lines) {
    const weight = line.bold ? ' font-weight="700"' : "";
    out += `<text x="${f(box.x + pad)}" y="${f(y)}" font-size="${f(fs * line.scale)}"${weight}>${escapeXml(line.text)}</text>`;
    y += fs * LINE_HEIGHT;
  }
  return `<g fill="${fill}">${out}</g>`;
}

interface Cell {
  box: Box;
  color: string;
  text: string;
  lines: Line[];
  marked: boolean;
}

function swatchCell(box: Box, swatch: Swatch, o: SwatchesSvgOptions, maxFont: number): Cell {
  const color = normalizeHex(swatch.color);
  const text = bestTextColor(color);
  const lines: Line[] = [];
  if (swatch.title !== undefined) lines.push({ text: swatch.title, bold: true, scale: 1.15 });
  if (o.label !== "none") {
    const value = swatchValue(color, o.label);
    // Long values go one component per line when one line would need a much smaller font.
    const tooWide = value.length * CHAR_WIDTH * maxFont * 0.75 > box.w - 2 * padding(box);
    for (const part of tooWide ? value.split(" ") : [value]) lines.push({ text: part, scale: 1 });
  }
  if (o.contrast) lines.push({ text: contrastText(text.ratio), scale: 0.9 });
  return { box, color, text: text.color, lines, marked: swatch.marked === true };
}

/** Rows are background colours, columns text colours; the diagonal stays empty. */
function matrixGrid(box: Box, colors: readonly string[], maxFont: number): string {
  const n = colors.length;
  const cw = box.w / n;
  const ch = box.h / n;
  // One size for the whole grid, fitted to the longest possible text ("21.0:1 AAA").
  const fs = Math.max(1, Math.min(maxFont, (cw * 0.84) / (10 * CHAR_WIDTH), ch * 0.4));
  let rects = "";
  let texts = "";
  for (let row = 0; row < n; row++) {
    const bg = colors[row] as string;
    const y = box.y + row * ch;
    rects += rect({ x: box.x, y, w: box.w, h: ch }, bg);
    for (let col = 0; col < n; col++) {
      if (row === col) continue;
      const fg = colors[col] as string;
      const label = contrastText(contrastRatio(bg, fg));
      texts += `<text x="${f(box.x + col * cw + cw / 2)}" y="${f(y + ch / 2 + fs * 0.35)}" fill="${fg}">${label}</text>`;
    }
  }
  return `<g shape-rendering="crispEdges">${rects}</g><g font-size="${f(fs)}" text-anchor="middle">${texts}</g>`;
}

/**
 * Renders swatches edge to edge: side by side on landscape canvases, stacked
 * on portrait ones. All labels share one font size. With `matrix`, the
 * swatches take the top 40 % and the contrast grid the rest.
 */
export function swatchesSvg(o: SwatchesSvgOptions): string {
  const { width, height, swatches } = o;
  const n = Math.max(1, swatches.length);
  const matrix = o.matrix === true && swatches.length > 1;
  const stripH = matrix ? height * 0.4 : height;
  const columns = width >= stripH;
  const maxFont = Math.min(width, height) * 0.04;
  const cells = swatches.map((swatch, i) =>
    swatchCell(
      columns
        ? { x: (width / n) * i, y: 0, w: width / n, h: stripH }
        : { x: 0, y: (stripH / n) * i, w: width, h: stripH / n },
      swatch,
      o,
      maxFont,
    ),
  );
  const fs = Math.max(1, Math.min(maxFont, ...cells.map((c) => fitFont(c.box, c.lines, maxFont))));
  // Crisp edges: no hairline seams between neighbouring swatches.
  let body = `<g shape-rendering="crispEdges">${cells.map((c) => rect(c.box, c.color)).join("")}</g>`;
  for (const c of cells) {
    body += labelBlock(c.box, c.lines, c.text, fs);
    if (c.marked) {
      const r = Math.max(2, Math.min(c.box.w, c.box.h) * 0.035);
      const inset = padding(c.box) + r;
      body += `<circle cx="${f(c.box.x + c.box.w - inset)}" cy="${f(c.box.y + inset)}" r="${f(r)}" fill="${c.text}"/>`;
    }
  }
  if (matrix) {
    const colors = cells.map((c) => c.color);
    body += matrixGrid({ x: 0, y: stripH, w: width, h: height - stripH }, colors, maxFont * 0.8);
  }
  return svgDocument(width, height, `<g font-family="${FONT}">${body}</g>`);
}
