/**
 * Styled QR codes (docs/TOOLS.md M5): the symbol from `encodeQr`, drawn as
 * SVG with module shapes (squares, dots, rounded, diamonds), eye shapes, a
 * solid or gradient ink, an optional logo in the middle (the modules behind
 * it are left out; error correction restores them) and a quiet zone.
 *
 * Drawn in module units inside one scaled group, so the SVG stays small
 * whatever the export size.
 */
import { formatNumber } from "../../curves";
import { escapeXml, stableId, svgBackground, svgDocument } from "../../svg";
import { encodeQr, type QrEcLevel, type QrMatrix } from "./encode";

export * from "./encode";

export const QR_MODULE_SHAPES = ["square", "dots", "rounded", "diamond", "lines"] as const;
export type QrModuleShape = (typeof QR_MODULE_SHAPES)[number];

export const QR_EYE_SHAPES = ["square", "rounded", "circle", "leaf"] as const;
export type QrEyeShape = (typeof QR_EYE_SHAPES)[number];

/** Largest logo edge, percent of the symbol (H recovers about 30 % of the codewords). */
export const QR_LOGO_MAX = 30;

export interface QrCodeOptions {
  readonly text: string;
  readonly ecLevel: QrEcLevel;
  readonly moduleShape: QrModuleShape;
  readonly eyeShape: QrEyeShape;
  /** Ink colours; two or more make a gradient. */
  readonly colors: readonly string[];
  readonly gradientAngle: number;
  /** Colour of the three eyes. */
  readonly eyeColor: string;
  readonly background: string;
  /** Quiet zone in modules (4 is the standard). */
  readonly margin: number;
  /** Logo URI (sanitised data or blob URI) or null. */
  readonly logoHref: string | null;
  /** Logo edge in percent of the symbol. */
  readonly logoSize: number;
  readonly width: number;
  readonly height: number;
}

const f = (v: number) => formatNumber(v, 3);

// Encoding is the slow part (mask search); preview, advisories and exports
// ask for the same text in a row.
let cacheKey = "";
let cacheValue: QrMatrix | null = null;

/** The matrix for `text`, or null when it does not fit into version 40. */
export function qrMatrixFor(text: string, ecLevel: QrEcLevel): QrMatrix | null {
  const key = `${ecLevel}\u0000${text}`;
  if (key !== cacheKey) {
    const result = encodeQr(text, ecLevel);
    cacheKey = key;
    cacheValue = result.ok ? result.matrix : null;
  }
  return cacheValue;
}

/** Whether module (x, y) belongs to one of the three 7 × 7 eyes. */
export function inEye(x: number, y: number, size: number): boolean {
  const near = (v: number) => v < 7;
  const far = (v: number) => v >= size - 7;
  return (near(x) && near(y)) || (far(x) && near(y)) || (near(x) && far(y));
}

/** Modules hidden by the logo: a centred square of `logoSize` % plus half a module of air. */
export function logoHole(size: number, logoSize: number): { from: number; to: number } | null {
  if (logoSize <= 0) return null;
  const edge = (size * Math.min(logoSize, QR_LOGO_MAX)) / 100;
  const from = (size - edge) / 2 - 0.5;
  return { from, to: from + edge + 1 };
}

function modulePath(shape: QrModuleShape, m: QrMatrix, hole: { from: number; to: number } | null) {
  const n = m.size;
  const dark = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < n && y < n && ((m.modules[y] as boolean[])[x] as boolean);
  const hidden = (x: number, y: number) =>
    hole !== null &&
    x + 0.5 > hole.from &&
    x + 0.5 < hole.to &&
    y + 0.5 > hole.from &&
    y + 0.5 < hole.to;
  const visible = (x: number, y: number) => dark(x, y) && !inEye(x, y, n) && !hidden(x, y);

  const parts: string[] = [];
  if (shape === "square") {
    // Horizontal runs as one rectangle each: much shorter than one per module.
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        if (!visible(x, y)) {
          x++;
          continue;
        }
        const start = x;
        while (x < n && visible(x, y)) x++;
        parts.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
      }
    }
    return parts.join("");
  }
  if (shape === "lines") {
    // Vertical runs as rounded bars.
    for (let x = 0; x < n; x++) {
      let y = 0;
      while (y < n) {
        if (!visible(x, y)) {
          y++;
          continue;
        }
        const start = y;
        while (y < n && visible(x, y)) y++;
        const len = y - start;
        parts.push(
          `M${f(x + 0.1)} ${f(start + 0.4)}a.4 .4 0 0 1 .8 0v${f(len - 0.8)}a.4 .4 0 0 1-.8 0z`,
        );
      }
    }
    return parts.join("");
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!visible(x, y)) continue;
      if (shape === "dots") {
        parts.push(`M${f(x + 0.05)} ${f(y + 0.5)}a.45 .45 0 1 0 .9 0a.45 .45 0 1 0-.9 0z`);
      } else if (shape === "diamond") {
        parts.push(`M${f(x + 0.5)} ${y}l.5 .5-.5 .5-.5-.5z`);
      } else {
        // Rounded: corners are round only where no neighbour continues the shape.
        const r = 0.45;
        const up = visible(x, y - 1);
        const down = visible(x, y + 1);
        const left = visible(x - 1, y);
        const right = visible(x + 1, y);
        const tl = !up && !left ? r : 0;
        const tr = !up && !right ? r : 0;
        const br = !down && !right ? r : 0;
        const bl = !down && !left ? r : 0;
        parts.push(roundedRect(x, y, 1, 1, tl, tr, br, bl));
      }
    }
  }
  return parts.join("");
}

function roundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
): string {
  const arc = (r: number, dx: number, dy: number) =>
    r > 0 ? `a${f(r)} ${f(r)} 0 0 1 ${f(dx)} ${f(dy)}` : "";
  return (
    `M${f(x + tl)} ${f(y)}h${f(w - tl - tr)}${arc(tr, tr, tr)}` +
    `v${f(h - tr - br)}${arc(br, -br, br)}` +
    `h${f(-(w - br - bl))}${arc(bl, -bl, -bl)}` +
    `v${f(-(h - bl - tl))}${arc(tl, tl, -tl)}z`
  );
}

/** One eye at (x, y): ring of 7 and centre of 3 modules, as an even-odd path. */
function eyePath(shape: QrEyeShape, x: number, y: number, corner: 0 | 1 | 2): string {
  const ring = (inset: number, size: number, r: number) => {
    const rr = Math.min(r, size / 2);
    if (shape === "leaf") {
      // Round on two opposite corners, sharp on the corner facing the
      // symbol's centre and its opposite.
      const facing = corner === 0 ? 2 : corner === 1 ? 3 : 1;
      const corners = [rr, rr, rr, rr];
      corners[facing] = 0;
      corners[(facing + 2) % 4] = 0;
      const [a, b, c, d] = corners as [number, number, number, number];
      return roundedRect(x + inset, y + inset, size, size, a, b, c, d);
    }
    return roundedRect(x + inset, y + inset, size, size, rr, rr, rr, rr);
  };
  const radius =
    shape === "square"
      ? [0, 0, 0]
      : shape === "circle"
        ? [3.5, 2.5, 1.5]
        : shape === "leaf"
          ? [3, 2.2, 1.5]
          : [2, 1.4, 1];
  const [r0, r1, r2] = radius as [number, number, number];
  // Outer ring as outer minus inner (even-odd), then the centre.
  return ring(0, 7, r0) + ring(1, 5, r1) + ring(2, 3, r2);
}

export interface QrCodeResult {
  readonly svg: string;
  /** Null when the text is too long for any version. */
  readonly matrix: QrMatrix | null;
}

/** The QR code as an SVG document of `width` × `height`. */
export function qrCodeSvg(o: QrCodeOptions): QrCodeResult {
  const { width: w, height: h } = o;
  const matrix = o.text === "" ? null : qrMatrixFor(o.text, o.ecLevel);
  const bg = svgBackground(o.background, w, h);
  if (!matrix) return { svg: svgDocument(w, h, bg), matrix };

  const n = matrix.size;
  const margin = Math.max(0, o.margin);
  const cell = Math.min(w, h) / (n + 2 * margin);
  const ox = (w - n * cell) / 2;
  const oy = (h - n * cell) / 2;
  const hole = o.logoHref ? logoHole(n, o.logoSize) : null;

  const colors = o.colors.length > 0 ? o.colors : ["#000000"];
  let defs = "";
  let ink = colors[0] as string;
  if (colors.length > 1) {
    const a = (o.gradientAngle * Math.PI) / 180;
    const dx = (Math.sin(a) * n) / 2;
    const dy = (-Math.cos(a) * n) / 2;
    const c = n / 2;
    const stops = colors
      .map(
        (col, i) =>
          `<stop offset="${formatNumber(i / (colors.length - 1), 4)}" stop-color="${col}"/>`,
      )
      .join("");
    const inner = `gradientUnits="userSpaceOnUse" x1="${f(c - dx)}" y1="${f(c - dy)}" x2="${f(c + dx)}" y2="${f(c + dy)}">${stops}`;
    const id = stableId("qg", inner);
    defs = `<defs><linearGradient id="${id}" ${inner}</linearGradient></defs>`;
    ink = `url(#${id})`;
  }

  const eyes =
    eyePath(o.eyeShape, 0, 0, 0) +
    eyePath(o.eyeShape, n - 7, 0, 1) +
    eyePath(o.eyeShape, 0, n - 7, 2);
  let logo = "";
  if (hole && o.logoHref) {
    const edge = (n * Math.min(o.logoSize, QR_LOGO_MAX)) / 100;
    const at = (n - edge) / 2;
    logo = `<image href="${escapeXml(o.logoHref)}" x="${f(at)}" y="${f(at)}" width="${f(edge)}" height="${f(edge)}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  const body =
    defs +
    bg +
    `<g transform="translate(${f(ox)} ${f(oy)}) scale(${formatNumber(cell, 5)})">` +
    `<path d="${modulePath(o.moduleShape, matrix, hole)}" fill="${ink}"/>` +
    `<path d="${eyes}" fill="${o.eyeColor}" fill-rule="evenodd"/>` +
    logo +
    `</g>`;
  return { svg: svgDocument(w, h, body), matrix };
}
