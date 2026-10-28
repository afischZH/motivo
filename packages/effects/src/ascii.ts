/**
 * ASCII and dot-matrix art (docs/TOOLS.md L5). A picture is condensed into a
 * small grid of cells (`buildAsciiGrid`, mean luminance and colour per
 * cell); the grid is drawn as characters, braille or dots in SVG, plain
 * text or an HTML `<pre>`. Pure and deterministic; the grid is the only
 * part that needs pixels, so it runs in the image worker and travels as a
 * compact string param (`encodeAsciiGrid`).
 */
import { escapeXml, toBase64 } from "@musterli/engine";
import type { PixelBuffer } from "./buffer";
import { bayerMatrix } from "./dither";
import { LUMA_WEIGHTS } from "./luminance";
import { toneCurve, type ToneOptions } from "./tone";

/** Character ramps from empty (light on a light ground) to dense. */
export const ASCII_RAMPS = {
  standard: " .:-=+*#%@",
  detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: " ░▒▓█",
  minimal: " .oO@",
  binary: " 01",
} as const;

export type AsciiRampId = keyof typeof ASCII_RAMPS;

export const ASCII_MODES = ["ascii", "dots", "braille"] as const;
export type AsciiMode = (typeof ASCII_MODES)[number];

/** Most grid cells (dots for braille): bounds analysis, params, SVG and text size. */
export const ASCII_CELLS_MAX = 32_000;

/** Longest custom ramp in characters (code points). */
export const ASCII_CUSTOM_RAMP_MAX = 64;

/** System monospace stack: no web font is loaded or embedded. */
export const MONOSPACE_STACK =
  "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

/** Cells of luminance and colour: 4 bytes per cell (luma, r, g, b), row-major. */
export interface AsciiGrid {
  readonly cols: number;
  readonly rows: number;
  readonly data: Uint8Array;
}

/**
 * Grid size for a picture of `width` × `height`: `columns` character cells
 * of aspect `aspect` (cell width / height) across, rows to match; braille
 * cells are 2 × 4 dots. Larger grids than `ASCII_CELLS_MAX` shrink evenly.
 */
export function asciiGridSize(
  width: number,
  height: number,
  columns: number,
  aspect: number,
  mode: AsciiMode,
): { cols: number; rows: number } {
  const sub = mode === "braille" ? { x: 2, y: 4 } : { x: 1, y: 1 };
  let chars = Math.max(1, Math.round(columns));
  const rowsFor = (c: number) =>
    Math.max(1, Math.round((height * c * aspect) / Math.max(1, width)));
  let rows = rowsFor(chars);
  const cells = chars * sub.x * rows * sub.y;
  if (cells > ASCII_CELLS_MAX) {
    chars = Math.max(1, Math.floor(chars * Math.sqrt(ASCII_CELLS_MAX / cells)));
    rows = rowsFor(chars);
    while (chars > 1 && chars * sub.x * rows * sub.y > ASCII_CELLS_MAX) {
      chars--;
      rows = rowsFor(chars);
    }
    rows = Math.max(1, Math.min(rows, Math.floor(ASCII_CELLS_MAX / (chars * sub.x * sub.y))));
  }
  return { cols: chars * sub.x, rows: rows * sub.y };
}

/**
 * Mean Rec. 709 luminance and colour of every cell (box filter over the
 * pixels each cell covers; transparency is composited onto white).
 */
export function buildAsciiGrid(pixels: PixelBuffer, cols: number, rows: number): AsciiGrid {
  const c = Math.max(1, Math.round(cols));
  const r = Math.max(1, Math.round(rows));
  const sums = new Float64Array(c * r * 4);
  const counts = new Uint32Array(c * r);
  const { width, height, data } = pixels;
  const colOf = new Uint32Array(width);
  for (let x = 0; x < width; x++) colOf[x] = Math.min(c - 1, Math.floor((x * c) / width));
  for (let y = 0; y < height; y++) {
    const row = Math.min(r - 1, Math.floor((y * r) / height)) * c;
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
      const a = (data[i + 3] ?? 255) / 255;
      const red = (data[i] ?? 0) * a + 255 * (1 - a);
      const green = (data[i + 1] ?? 0) * a + 255 * (1 - a);
      const blue = (data[i + 2] ?? 0) * a + 255 * (1 - a);
      const cell = row + (colOf[x] ?? 0);
      const s = cell * 4;
      sums[s] = (sums[s] ?? 0) + red;
      sums[s + 1] = (sums[s + 1] ?? 0) + green;
      sums[s + 2] = (sums[s + 2] ?? 0) + blue;
      counts[cell] = (counts[cell] ?? 0) + 1;
    }
  }
  const w = LUMA_WEIGHTS.rec709;
  const out = new Uint8Array(c * r * 4);
  for (let cell = 0; cell < c * r; cell++) {
    const n = counts[cell] || 1;
    const red = (sums[cell * 4] ?? 255) / n;
    const green = (sums[cell * 4 + 1] ?? 255) / n;
    const blue = (sums[cell * 4 + 2] ?? 255) / n;
    out[cell * 4] = Math.round(red * w.r + green * w.g + blue * w.b);
    out[cell * 4 + 1] = Math.round(red);
    out[cell * 4 + 2] = Math.round(green);
    out[cell * 4 + 3] = Math.round(blue);
  }
  return { cols: c, rows: r, data: out };
}

const GRID_PREFIX = "v1:";
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_INDEX = new Int16Array(128).fill(-1);
for (let i = 0; i < BASE64.length; i++) BASE64_INDEX[BASE64.charCodeAt(i)] = i;

/** Longest encoded grid (`ASCII_CELLS_MAX` cells of 4 bytes in base64 plus the header). */
export const ASCII_GRID_MAX_LENGTH = 32 + Math.ceil((ASCII_CELLS_MAX * 4) / 3) * 4;

/** Pattern of an encoded grid (checked by the tool schema). */
export const ASCII_GRID_PATTERN = /^(?:v1:\d{1,5}x\d{1,5}:[A-Za-z0-9+/]+={0,2})?$/;

/** `v1:<cols>x<rows>:<base64 of the cell bytes>`. */
export function encodeAsciiGrid(grid: AsciiGrid): string {
  return `${GRID_PREFIX}${grid.cols}x${grid.rows}:${toBase64(grid.data)}`;
}

function fromBase64(text: string): Uint8Array | null {
  const clean = text.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const v = code < 128 ? (BASE64_INDEX[code] ?? -1) : -1;
    if (v < 0) return null;
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 255;
    }
  }
  return out;
}

/** Parses an encoded grid; `null` for the empty string or anything malformed. */
export function decodeAsciiGrid(text: string): AsciiGrid | null {
  if (!text.startsWith(GRID_PREFIX)) return null;
  const match = /^v1:(\d{1,5})x(\d{1,5}):([A-Za-z0-9+/]+={0,2})$/.exec(text);
  if (!match) return null;
  const cols = Number(match[1]);
  const rows = Number(match[2]);
  if (cols < 1 || rows < 1 || cols * rows > ASCII_CELLS_MAX) return null;
  const data = fromBase64(match[3] ?? "");
  if (!data || data.length !== cols * rows * 4) return null;
  return { cols, rows, data };
}

/** Everything that decides how a grid is drawn. */
export interface AsciiStyle extends ToneOptions {
  readonly mode: AsciiMode;
  /** Characters from empty to dense (at least one). */
  readonly ramp: string;
  /** Dense glyphs for bright cells (light art on a dark ground). */
  readonly invert: boolean;
  /** `photo`: each glyph or dot in the colour of its cell. */
  readonly colorMode: "single" | "photo";
  readonly ink: string;
  /** Hex colour or `"transparent"`. */
  readonly background: string;
  /** Dots: radius by brightness (`size`) or same size with brightness as opacity (`lit`, LED). */
  readonly dotMode: "size" | "lit";
  readonly dotShape: "round" | "square";
  /** Dots: largest dot diameter as a share of the cell (0.3 to 1). */
  readonly dotSize: number;
}

/** Ramp characters (code points); a ramp without usable characters falls back to `standard`. */
export function rampChars(ramp: string): string[] {
  // Control and line characters would break rows; everything else is fair game.
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
  const chars = Array.from(ramp.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, "")).slice(
    0,
    ASCII_CUSTOM_RAMP_MAX,
  );
  return chars.length > 0 ? chars : Array.from(ASCII_RAMPS.standard);
}

/** Quantised cell colour as `#rgb` (4 bits per channel: short runs, compact SVG). */
function shortHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(v / 17).toString(16);
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Density in [0, 1] of every cell: 0 = nothing drawn, 1 = darkest glyph or largest dot. */
function densities(grid: AsciiGrid, style: AsciiStyle): Float32Array {
  const tone = toneCurve(style);
  const out = new Float32Array(grid.cols * grid.rows);
  for (let i = 0; i < out.length; i++) {
    const v = tone[grid.data[i * 4] ?? 0] ?? 0;
    out[i] = style.invert ? v : 1 - v;
  }
  return out;
}

/** One run of equally coloured characters (`color` null: single ink). */
interface Run {
  color: string | null;
  text: string;
}

/** Text rows of the grid (characters or braille), with colour runs. */
export function asciiRows(grid: AsciiGrid, style: AsciiStyle): Run[][] {
  const dens = densities(grid, style);
  const photo = style.colorMode === "photo";
  const rows: Run[][] = [];
  if (style.mode === "braille") {
    const chars = Math.max(1, Math.floor(grid.cols / 2));
    const lines = Math.max(1, Math.floor(grid.rows / 4));
    const bayer = bayerMatrix(4);
    const BITS = [
      [0x01, 0x08],
      [0x02, 0x10],
      [0x04, 0x20],
      [0x40, 0x80],
    ] as const;
    for (let ry = 0; ry < lines; ry++) {
      const runs: Run[] = [];
      for (let cx = 0; cx < chars; cx++) {
        let bits = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const gx = cx * 2 + dx;
            const gy = ry * 4 + dy;
            const cell = gy * grid.cols + gx;
            if ((dens[cell] ?? 0) > (bayer[(gy % 4) * 4 + (gx % 4)] ?? 0.5)) {
              bits |= BITS[dy]?.[dx] ?? 0;
            }
            r += grid.data[cell * 4 + 1] ?? 0;
            g += grid.data[cell * 4 + 2] ?? 0;
            b += grid.data[cell * 4 + 3] ?? 0;
          }
        }
        pushChar(
          runs,
          String.fromCharCode(0x2800 + bits),
          photo ? shortHex(r / 8, g / 8, b / 8) : null,
          bits === 0,
        );
      }
      rows.push(runs);
    }
    return rows;
  }
  const ramp = rampChars(style.ramp);
  const last = ramp.length - 1;
  for (let y = 0; y < grid.rows; y++) {
    const runs: Run[] = [];
    for (let x = 0; x < grid.cols; x++) {
      const cell = y * grid.cols + x;
      const ch = ramp[Math.round((dens[cell] ?? 0) * last)] ?? " ";
      const color = photo
        ? shortHex(
            grid.data[cell * 4 + 1] ?? 0,
            grid.data[cell * 4 + 2] ?? 0,
            grid.data[cell * 4 + 3] ?? 0,
          )
        : null;
      pushChar(runs, ch, color, ch === " ");
    }
    rows.push(runs);
  }
  return rows;
}

/** Appends a character; blank ones join the current run whatever their colour. */
function pushChar(runs: Run[], ch: string, color: string | null, blank: boolean): void {
  const current = runs[runs.length - 1];
  if (current && (blank || current.color === color)) {
    current.text += ch;
    return;
  }
  runs.push({ color, text: ch });
}

const f1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Quantisation steps of dot sizes and LED brightness. */
export const DOT_LEVELS = 8;

function dotsBody(grid: AsciiGrid, style: AsciiStyle, width: number, height: number): string {
  const dens = densities(grid, style);
  const cw = width / grid.cols;
  const ch = height / grid.rows;
  const rmax = (Math.min(cw, ch) * Math.min(1, Math.max(0.05, style.dotSize))) / 2;
  const photo = style.colorMode === "photo";
  const lit = style.dotMode === "lit";
  const round = style.dotShape === "round";
  const groups = new Map<string, string[]>();
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const cell = y * grid.cols + x;
      const level = Math.round((dens[cell] ?? 0) * DOT_LEVELS);
      if (!lit && level === 0) continue;
      const color = photo
        ? shortHex(
            grid.data[cell * 4 + 1] ?? 0,
            grid.data[cell * 4 + 2] ?? 0,
            grid.data[cell * 4 + 3] ?? 0,
          )
        : style.ink;
      const key = `${color}|${level}`;
      let parts = groups.get(key);
      if (!parts) groups.set(key, (parts = []));
      const cx = (x + 0.5) * cw;
      const cy = (y + 0.5) * ch;
      if (round) {
        parts.push(`M${f1(cx)} ${f1(cy)}h0`);
      } else {
        const r = lit ? rmax : rmax * Math.sqrt(level / DOT_LEVELS);
        parts.push(`M${f1(cx - r)} ${f1(cy - r)}h${f1(2 * r)}v${f1(2 * r)}h${f1(-2 * r)}z`);
      }
    }
  }
  let body = "";
  for (const [key, parts] of groups) {
    const [color, levelText] = key.split("|");
    const level = Number(levelText);
    const opacity = lit ? 0.1 + (0.9 * level) / DOT_LEVELS : 1;
    const op =
      opacity < 1
        ? ` ${round ? "stroke" : "fill"}-opacity="${Math.round(opacity * 100) / 100}"`
        : "";
    if (round) {
      const r = lit ? rmax : rmax * Math.sqrt(level / DOT_LEVELS);
      body += `<path fill="none" stroke="${color}" stroke-width="${f1(2 * r)}" stroke-linecap="round"${op} d="${parts.join("")}"/>`;
    } else {
      body += `<path fill="${color}"${op} d="${parts.join("")}"/>`;
    }
  }
  return body;
}

/** Lines of text for the text and HTML exports (dots fall back to the character ramp). */
function textStyle(style: AsciiStyle): AsciiStyle {
  return style.mode === "dots" ? { ...style, mode: "ascii" } : style;
}

/**
 * The art as SVG at `width` × `height`: one `<text>` per row stretched to
 * the full width with `textLength` (exact in any monospace font), colour
 * runs as `<tspan>`; or dots as one path per colour and level.
 */
export function asciiArtSvg(
  grid: AsciiGrid,
  style: AsciiStyle,
  width: number,
  height: number,
): string {
  const w = f1(width);
  const h = f1(height);
  let body =
    style.background === "transparent"
      ? ""
      : `<rect width="${w}" height="${h}" fill="${style.background}"/>`;
  if (style.mode === "dots") {
    body += dotsBody(grid, style, width, height);
  } else {
    const rows = asciiRows(grid, style);
    const lineHeight = height / Math.max(1, rows.length);
    let text = "";
    rows.forEach((runs, y) => {
      const inner = runs
        .map((run) =>
          run.color === null
            ? escapeXml(run.text)
            : `<tspan fill="${run.color}">${escapeXml(run.text)}</tspan>`,
        )
        .join("");
      text += `<text x="0" y="${f1((y + 0.8) * lineHeight)}" textLength="${w}" lengthAdjust="spacing">${inner}</text>`;
    });
    body += `<g font-family="${MONOSPACE_STACK}" font-size="${f1(lineHeight)}" fill="${style.ink}" xml:space="preserve" style="white-space:pre">${text}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/** Plain text: one line per row, trailing blanks removed. */
export function asciiArtText(grid: AsciiGrid, style: AsciiStyle): string {
  return asciiRows(grid, textStyle(style))
    .map((runs) =>
      runs
        .map((r) => r.text)
        .join("")
        .trimEnd(),
    )
    .join("\n");
}

/**
 * An HTML `<pre>` snippet with inline styles (system monospace, the
 * design's colours, letter spacing so the columns fill `width`); colour
 * runs as `<span style="color:…">`.
 */
export function asciiArtHtml(
  grid: AsciiGrid,
  style: AsciiStyle,
  width: number,
  height: number,
): string {
  const s = textStyle(style);
  const rows = asciiRows(grid, s);
  const lineHeight = height / Math.max(1, rows.length);
  const columns = rows[0]?.reduce((n, r) => n + Array.from(r.text).length, 0) ?? 1;
  // Monospace advance is about 0.6 em; the rest of the cell becomes letter spacing.
  const spacing = width / Math.max(1, columns) - 0.6 * lineHeight;
  const background = s.background === "transparent" ? "" : `background:${s.background};`;
  const css =
    `margin:0;padding:0;font-family:${MONOSPACE_STACK};` +
    `font-size:${f1(lineHeight)}px;line-height:1;letter-spacing:${f1(spacing)}px;` +
    `color:${s.ink};${background}white-space:pre`;
  const lines = rows.map((runs) =>
    runs
      .map((run) =>
        run.color === null
          ? escapeXml(run.text)
          : `<span style="color:${run.color}">${escapeXml(run.text)}</span>`,
      )
      .join(""),
  );
  return `<pre style="${css}">\n${lines.join("\n")}\n</pre>\n`;
}
