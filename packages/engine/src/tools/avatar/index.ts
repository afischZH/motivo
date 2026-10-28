/**
 * Avatars and placeholder images (docs/TOOLS.md L1). Pure SVG builders:
 *
 * - initials avatars (1 to 3 letters from a name, system font stacks only),
 * - identicons (a mirrored grid derived from a string hash),
 * - shape compositions (three Bauhaus-like shapes derived from a hash),
 * - placeholder images ("W × H" or custom text on a fill).
 *
 * Every random choice comes from a hash of the input text or the seed, so the
 * same name gives the same avatar on every device. User text is always
 * escaped (`escapeXml`) and only ever placed as text content.
 */
import { mixHex } from "../../color";
import { formatNumber } from "../../curves";
import { bestTextColor } from "../../palette/contrast";
import { createRng, deriveSeed, type Rng } from "../../rng";
import { escapeXml, stableId, svgBackground, svgDocument } from "../../svg";
import { cssPattern, getCssPattern } from "../css-patterns";

export const AVATAR_STYLES = ["initials", "identicon", "shapes"] as const;
export type AvatarStyle = (typeof AVATAR_STYLES)[number];

export const AVATAR_SHAPES = ["circle", "rounded", "square"] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

export const AVATAR_FILLS = ["solid", "gradient", "pattern"] as const;
export type AvatarFill = (typeof AVATAR_FILLS)[number];

export const AVATAR_FONTS = ["sans", "serif", "mono", "rounded"] as const;
export type AvatarFont = (typeof AVATAR_FONTS)[number];

export const IDENTICON_CELL_SHAPES = ["square", "dot", "rounded"] as const;
export type IdenticonCellShape = (typeof IDENTICON_CELL_SHAPES)[number];

/** Most letters of an initials avatar (Unicode code points). */
export const AVATAR_LETTERS_MAX = 3;
export const IDENTICON_GRID_MIN = 4;
export const IDENTICON_GRID_MAX = 9;

/** System font stacks: no font files are ever loaded or embedded. */
export const AVATAR_FONT_STACKS: Readonly<Record<AvatarFont, string>> = {
  sans: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  serif: "ui-serif, Georgia, Cambria, Times New Roman, Times, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace",
  rounded:
    "ui-rounded, SF Pro Rounded, Nunito, Quicksand, Varela Round, ui-sans-serif, system-ui, sans-serif",
};

/** Dark ink of the automatic foreground (near black reads softer than #000). */
export const AVATAR_DARK_INK = "#111827";
export const AVATAR_LIGHT_INK = "#ffffff";

const f = (v: number): string => formatNumber(v, 2);

// ---------------------------------------------------------------------------
// Hash and text
// ---------------------------------------------------------------------------

/**
 * uint32 hash of a text: FNV-1a over the trimmed, NFC-normalised, lower-case
 * text, avalanched by the Murmur3 finaliser (`deriveSeed`). Case and
 * surrounding spaces do not change the result.
 */
export function avatarHash(text: string): number {
  return deriveSeed(0x61766174, text.trim().normalize("NFC").toLowerCase());
}

/** Code points of a string (emoji and other astral characters count as one). */
const codePoints = (text: string): string[] => Array.from(text);

const WORD_SPLIT = /[\s\-_.]+/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Initials of a name: the first letter or digit of each of the first n - 1
 * words plus the last word (one letter: the first word); with fewer words,
 * the following characters of the last word fill up. Of an e-mail address
 * only the part before "@" counts. Upper case, at most `count` code points, "?" for a
 * name without letters or digits.
 */
export function avatarInitials(name: string, count: number): string {
  const n = Math.max(1, Math.min(AVATAR_LETTERS_MAX, Math.round(count)));
  // An e-mail address: only the local part names the person.
  const at = name.indexOf("@");
  const words = (at > 0 ? name.slice(0, at) : name)
    .normalize("NFC")
    .split(WORD_SPLIT)
    .map((w) => codePoints(w).filter((c) => LETTER_OR_DIGIT.test(c)))
    .filter((w) => w.length > 0);
  if (words.length === 0) return "?";
  const picked: string[] = [];
  if (n === 1) {
    picked.push(words[0]?.[0] ?? "");
  } else if (words.length >= n) {
    for (let i = 0; i < n - 1; i++) picked.push(words[i]?.[0] ?? "");
    picked.push(words[words.length - 1]?.[0] ?? "");
  } else {
    for (let i = 0; i < words.length - 1; i++) picked.push(words[i]?.[0] ?? "");
    const last = words[words.length - 1] ?? [];
    for (let i = 0; i < last.length && picked.length < n; i++) picked.push(last[i] ?? "");
  }
  // Upper-casing may lengthen a letter ("ß" -> "SS"): cut again by code points.
  return codePoints(picked.join("").toUpperCase()).slice(0, n).join("");
}

/** Custom initials: the first `AVATAR_LETTERS_MAX` code points, case kept. */
export function customInitials(text: string): string {
  return codePoints(text.trim().normalize("NFC")).slice(0, AVATAR_LETTERS_MAX).join("");
}

/** Wide characters (CJK, Hangul, fullwidth forms, emoji) take about 1 em. */
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f000}-\u{1faff}\u{20000}-\u{3fffd}]/u;

/**
 * Width of a line of text in em, estimated without a DOM: 0.62 em per
 * character (0.6 for monospace), 1 em for wide characters, 0.3 for spaces.
 * Errs on the wide side so fitted text never overflows.
 */
export function estimateTextWidth(text: string, font: AvatarFont): number {
  const narrow = font === "mono" ? 0.6 : 0.62;
  let em = 0;
  for (const c of codePoints(text)) {
    if (c === " ") em += font === "mono" ? 0.6 : 0.3;
    else if (WIDE.test(c)) em += 1;
    else em += narrow;
  }
  return em;
}

/** Font size in px so that `text` fits `maxWidth` and `maxHeight` (cap at `preferred`). */
export function fitFontSize(
  text: string,
  font: AvatarFont,
  preferred: number,
  maxWidth: number,
  maxHeight: number,
): number {
  const em = estimateTextWidth(text, font);
  const byWidth = em > 0 ? maxWidth / em : preferred;
  return Math.max(1, Math.min(preferred, byWidth, maxHeight));
}

/** One centred line of escaped text; vertical centre via 0.35 em (no dominant-baseline). */
export function centeredText(o: {
  text: string;
  x: number;
  y: number;
  size: number;
  font: AvatarFont;
  weight: number;
  color: string;
  opacity?: number;
}): string {
  if (o.text === "") return "";
  const opacity = o.opacity !== undefined && o.opacity < 1 ? ` fill-opacity="${f(o.opacity)}"` : "";
  return (
    `<text x="${f(o.x)}" y="${f(o.y + o.size * 0.35)}" text-anchor="middle" ` +
    `font-family="${AVATAR_FONT_STACKS[o.font]}" font-size="${f(o.size)}" ` +
    `font-weight="${Math.round(o.weight)}" fill="${o.color}"${opacity}>${escapeXml(o.text)}</text>`
  );
}

// ---------------------------------------------------------------------------
// Colours and fills
// ---------------------------------------------------------------------------

/** The palette colour a hash picks. */
export function pickColor(palette: readonly string[], hash: number): string {
  if (palette.length === 0) throw new RangeError("pickColor: empty palette");
  return palette[(hash >>> 0) % palette.length] as string;
}

/** White or near black, whichever has the higher WCAG contrast on `base`. */
export function autoInk(base: string): string {
  return bestTextColor(base, [AVATAR_LIGHT_INK, AVATAR_DARK_INK]).color;
}

export interface FillOptions {
  fill: AvatarFill;
  /** Base colour (hex). */
  base: string;
  /** Second gradient stop and pattern accent (hex). */
  second: string;
  /** Pattern ink (hex). */
  ink: string;
  /** CSS angle of the gradient, 0 = to top. */
  gradientAngle: number;
  /** Pattern id of the CSS pattern library. */
  pattern: string;
  /** Pattern period in px. */
  patternSize: number;
  /** Pattern ink opacity, 0 to 1. */
  patternOpacity: number;
}

/**
 * Fill of a `w` × `h` box at (x, y): a rect, a linear gradient in OKLCH
 * (sampled in steps, so editors without OKLCH show the same colours) or a
 * library pattern as a nested SVG. Returns `{ defs, body }`.
 */
export function fillMarkup(
  o: FillOptions,
  x: number,
  y: number,
  w: number,
  h: number,
): { defs: string; body: string } {
  const rect = (paint: string) =>
    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${paint}"/>`;
  if (o.fill === "gradient") {
    const steps = 9;
    const stops: string[] = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      stops.push(`<stop offset="${f(t)}" stop-color="${mixHex(o.base, o.second, t, "oklch")}"/>`);
    }
    // CSS angle over the box: the gradient line passes the centre and spans
    // the projection of the box onto the direction (like CSS linear-gradient).
    const a = (o.gradientAngle * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const content = stops.join("");
    const id = stableId("ag", `${content}|${f(o.gradientAngle)}|${f(x)},${f(y)},${f(w)},${f(h)}`);
    return {
      defs:
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
        `x1="${f(cx - dx * half)}" y1="${f(cy - dy * half)}" x2="${f(cx + dx * half)}" y2="${f(cy + dy * half)}">` +
        `${content}</linearGradient>`,
      body: rect(`url(#${id})`),
    };
  }
  if (o.fill === "pattern") {
    const svg = cssPattern({
      pattern: o.pattern,
      color: o.ink,
      accent: o.second,
      size: o.patternSize,
      // The library's own angle (diagonal stripes, upright grids).
      angle: getCssPattern(o.pattern)?.angle ?? 0,
      opacity: Math.round(Math.max(0, Math.min(1, o.patternOpacity)) * 100),
      background: o.base,
      width: w,
      height: h,
    }).svg;
    // Nest the pattern document at the box position.
    return { defs: "", body: svg.replace("<svg ", `<svg x="${f(x)}" y="${f(y)}" `) };
  }
  return { defs: "", body: rect(o.base) };
}

// ---------------------------------------------------------------------------
// Identicons and shape compositions
// ---------------------------------------------------------------------------

/**
 * Cells of a horizontally mirrored identicon, row-major (`grid` × `grid`):
 * the left half (rounded up) is on with probability 0.5 from a stream seeded
 * with `hash`, the right half mirrors it. Never empty (the centre turns on).
 */
export function identiconCells(hash: number, grid: number): boolean[] {
  const n = Math.max(IDENTICON_GRID_MIN, Math.min(IDENTICON_GRID_MAX, Math.round(grid)));
  const rng = createRng(hash);
  const half = Math.ceil(n / 2);
  const cells = Array.from({ length: n * n }, () => false);
  let any = false;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < half; col++) {
      const on = rng.bool(0.5);
      cells[row * n + col] = on;
      cells[row * n + (n - 1 - col)] = on;
      any ||= on;
    }
  }
  if (!any) {
    const mid = Math.floor(n / 2);
    cells[mid * n + mid] = true;
    cells[mid * n + (n - 1 - mid)] = true;
  }
  return cells;
}

/** Path data of the on cells of an identicon in the box (x, y, edge). */
export function identiconPath(
  cells: readonly boolean[],
  grid: number,
  x: number,
  y: number,
  edge: number,
  shape: IdenticonCellShape,
  gap: number,
): string {
  const cell = edge / grid;
  const g = Math.max(0, Math.min(0.4, gap)) * cell;
  const s = cell - g;
  const parts: string[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    const cx = x + (i % grid) * cell + g / 2;
    const cy = y + Math.floor(i / grid) * cell + g / 2;
    if (shape === "dot") {
      const r = s / 2;
      parts.push(
        `M${f(cx)} ${f(cy + r)}a${f(r)} ${f(r)} 0 1 0 ${f(s)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-s)} 0z`,
      );
    } else if (shape === "rounded") {
      const r = s * 0.28;
      const l = s - 2 * r;
      parts.push(
        `M${f(cx + r)} ${f(cy)}h${f(l)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(l)}` +
          `a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-l)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}` +
          `v${f(-l)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}z`,
      );
    } else {
      // Gapless squares overlap by a hair, so no seams show between neighbours.
      const o = g === 0 ? 0.01 * cell : 0;
      parts.push(`M${f(cx)} ${f(cy)}h${f(s + o)}v${f(s + o)}h${f(-s - o)}z`);
    }
  }
  return parts.join("");
}

export const COMPOSITION_SHAPES = [
  "circle",
  "ring",
  "half",
  "quarter",
  "triangle",
  "diamond",
  "bar",
] as const;
export type CompositionShape = (typeof COMPOSITION_SHAPES)[number];

export interface CompositionPart {
  shape: CompositionShape;
  /** Centre in the unit box [0, 1]². */
  cx: number;
  cy: number;
  /** Edge in units of the box. */
  size: number;
  /** Quarter turns, 0 to 3. */
  turn: number;
  /** Colour slot: 0 ink, 1 and 2 the next palette colours. */
  slot: 0 | 1 | 2;
}

const PART_SIZES = [0.9, 0.55, 0.3] as const;

/** Three shapes (large, medium, small) on a 3 × 3 grid, derived from `hash`. */
export function shapeComposition(hash: number): CompositionPart[] {
  const rng: Rng = createRng(deriveSeed(hash, "shapes"));
  const slots = rng.shuffle([0, 1, 2] as const);
  return PART_SIZES.map((size, i) => {
    const pos = (v: number) => (size >= 0.9 ? 0.5 : size / 2 + v * (1 - size));
    return {
      shape: rng.pick(COMPOSITION_SHAPES),
      cx: pos(rng.int(0, 2) / 2),
      cy: pos(rng.int(0, 2) / 2),
      size,
      turn: rng.int(0, 3),
      slot: slots[i] ?? 0,
    };
  });
}

/** SVG of one composition part in the box (x, y, edge). */
export function compositionPartSvg(
  part: CompositionPart,
  x: number,
  y: number,
  edge: number,
  color: string,
): string {
  const s = part.size * edge;
  const cx = x + part.cx * edge;
  const cy = y + part.cy * edge;
  const r = s / 2;
  const turn = part.turn * 90;
  const rot = turn === 0 ? "" : ` transform="rotate(${turn} ${f(cx)} ${f(cy)})"`;
  switch (part.shape) {
    case "circle":
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${color}"/>`;
    case "ring":
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.78)}" fill="none" stroke="${color}" stroke-width="${f(r * 0.44)}"/>`;
    case "half":
      return `<path d="M${f(cx - r)} ${f(cy + r * 0.5)}a${f(r)} ${f(r)} 0 0 1 ${f(s)} 0z" fill="${color}"${rot}/>`;
    case "quarter":
      return `<path d="M${f(cx - r)} ${f(cy + r)}v${f(-s)}a${f(s)} ${f(s)} 0 0 1 ${f(s)} ${f(s)}z" fill="${color}"${rot}/>`;
    case "triangle":
      return `<path d="M${f(cx)} ${f(cy - r)}L${f(cx + r)} ${f(cy + r)}H${f(cx - r)}z" fill="${color}"${rot}/>`;
    case "diamond":
      return `<path d="M${f(cx)} ${f(cy - r)}L${f(cx + r)} ${f(cy)}L${f(cx)} ${f(cy + r)}L${f(cx - r)} ${f(cy)}z" fill="${color}"/>`;
    case "bar":
      return `<rect x="${f(cx - r)}" y="${f(cy - r * 0.3)}" width="${f(s)}" height="${f(r * 0.6)}" fill="${color}"${rot}/>`;
  }
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

export interface AvatarOptions extends Omit<FillOptions, "base" | "second" | "ink"> {
  style: AvatarStyle;
  /** Initials as shown (already derived or custom). */
  text: string;
  /** Drives colour, identicon and composition. */
  hash: number;
  palette: readonly string[];
  shape: AvatarShape;
  /** Corner radius of `rounded` in percent of half the edge (0 to 50). */
  radius: number;
  font: AvatarFont;
  fontWeight: number;
  /** Font size in percent of the edge. */
  fontSize: number;
  /** Foreground colour, or null for the automatic one. */
  ink: string | null;
  grid: number;
  cellShape: IdenticonCellShape;
  /** Gap between identicon cells, share of a cell (0 to 0.4). */
  cellGap: number;
  /** Margin of identicon and shapes, share of the edge (0 to 0.3). */
  inset: number;
  /** Outside the avatar shape: hex or "transparent". */
  background: string;
  width: number;
  height: number;
}

/** Colours of an avatar: base, second (next palette colour) and ink. */
export function avatarColors(
  palette: readonly string[],
  hash: number,
  ink: string | null,
): { base: string; second: string; third: string; ink: string } {
  const i = (hash >>> 0) % palette.length;
  const base = palette[i] as string;
  const second = palette[(i + 1) % palette.length] as string;
  const third = palette[(i + 2) % palette.length] as string;
  return { base, second, third, ink: ink ?? autoInk(base) };
}

function clipShape(shape: AvatarShape, x: number, y: number, edge: number, radius: number): string {
  if (shape === "circle") {
    const r = edge / 2;
    return `<circle cx="${f(x + r)}" cy="${f(y + r)}" r="${f(r)}"/>`;
  }
  const rx = shape === "rounded" ? (Math.max(0, Math.min(50, radius)) / 100) * edge : 0;
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(edge)}" height="${f(edge)}"${rx > 0 ? ` rx="${f(rx)}"` : ""}/>`;
}

/** The avatar as an SVG document: a shape over the shorter edge, centred. */
export function avatarSvg(o: AvatarOptions): string {
  const edge = Math.min(o.width, o.height);
  const x = (o.width - edge) / 2;
  const y = (o.height - edge) / 2;
  const colors = avatarColors(o.palette, o.hash, o.ink);
  const fill = fillMarkup(
    { ...o, base: colors.base, second: colors.second, ink: colors.ink },
    x,
    y,
    edge,
    edge,
  );

  let motif: string;
  const inset = Math.max(0, Math.min(0.3, o.inset)) * edge;
  const box = edge - 2 * inset;
  if (o.style === "initials") {
    const preferred = (o.fontSize / 100) * edge;
    // Room inside the shape: a circle loses its corners.
    const room = (o.shape === "circle" ? 0.78 : 0.86) * edge;
    const size = fitFontSize(o.text, o.font, preferred, room, room);
    motif = centeredText({
      text: o.text,
      x: x + edge / 2,
      y: y + edge / 2,
      size,
      font: o.font,
      weight: o.fontWeight,
      color: colors.ink,
    });
  } else if (o.style === "identicon") {
    const grid = Math.max(IDENTICON_GRID_MIN, Math.min(IDENTICON_GRID_MAX, Math.round(o.grid)));
    const d = identiconPath(
      identiconCells(o.hash, grid),
      grid,
      x + inset,
      y + inset,
      box,
      o.cellShape,
      o.cellGap,
    );
    motif = d ? `<path d="${d}" fill="${colors.ink}"/>` : "";
  } else {
    const slotColor = [colors.ink, colors.second, colors.third];
    motif = shapeComposition(o.hash)
      .map((p) => compositionPartSvg(p, x + inset, y + inset, box, slotColor[p.slot] ?? colors.ink))
      .join("");
  }

  const clip = clipShape(o.shape, x, y, edge, o.radius);
  const clipId = stableId("ac", clip);
  return svgDocument(
    o.width,
    o.height,
    `<defs><clipPath id="${clipId}">${clip}</clipPath>${fill.defs}</defs>` +
      svgBackground(o.background, o.width, o.height) +
      `<g clip-path="url(#${clipId})">${fill.body}${motif}</g>`,
  );
}

// ---------------------------------------------------------------------------
// Placeholder images
// ---------------------------------------------------------------------------

export interface PlaceholderOptions extends Omit<FillOptions, "base" | "second" | "ink"> {
  palette: readonly string[];
  /** Label as shown (already "W × H", custom or empty). */
  text: string;
  font: AvatarFont;
  fontWeight: number;
  /**
   * Font size in percent of the geometric mean of the edges, so banners
   * (728 × 90) and skyscrapers (160 × 600) get readable labels too.
   */
  fontSize: number;
  ink: string | null;
  /** Diagonal lines corner to corner. */
  cross: boolean;
  /** Inner border width in px (0 = none). */
  border: number;
  width: number;
  height: number;
}

/** Opacity of the cross and border lines. */
export const PLACEHOLDER_LINE_OPACITY = 0.35;

/** The default label of a placeholder: "W × H" in whole pixels. */
export function placeholderSizeLabel(width: number, height: number): string {
  return `${Math.round(width)} × ${Math.round(height)}`;
}

export function placeholderSvg(o: PlaceholderOptions): string {
  const { width: w, height: h } = o;
  const base = o.palette[0] ?? "#cccccc";
  const second = o.palette[1] ?? base;
  const ink = o.ink ?? autoInk(base);
  const fill = fillMarkup({ ...o, base, second, ink }, 0, 0, w, h);
  const lines: string[] = [];
  if (o.cross) {
    const sw = Math.max(1, Math.min(w, h) / 400);
    lines.push(
      `<path d="M0 0L${f(w)} ${f(h)}M${f(w)} 0L0 ${f(h)}" stroke="${ink}" stroke-opacity="${PLACEHOLDER_LINE_OPACITY}" stroke-width="${f(sw)}" fill="none"/>`,
    );
  }
  if (o.border > 0) {
    const b = Math.min(o.border, Math.min(w, h) / 4);
    lines.push(
      `<rect x="${f(b / 2)}" y="${f(b / 2)}" width="${f(w - b)}" height="${f(h - b)}" stroke="${ink}" stroke-opacity="${PLACEHOLDER_LINE_OPACITY}" stroke-width="${f(b)}" fill="none"/>`,
    );
  }
  let label = "";
  if (o.text !== "") {
    const preferred = (o.fontSize / 100) * Math.sqrt(w * h);
    const size = fitFontSize(o.text, o.font, preferred, 0.86 * w, 0.8 * h);
    // A pill behind the label keeps it readable over lines and patterns.
    const needsPill = o.cross || o.fill === "pattern";
    if (needsPill) {
      const pw = Math.min(w, estimateTextWidth(o.text, o.font) * size + size * 1.2);
      const ph = Math.min(h, size * 1.6);
      lines.push(
        `<rect x="${f((w - pw) / 2)}" y="${f((h - ph) / 2)}" width="${f(pw)}" height="${f(ph)}" rx="${f(ph / 2)}" fill="${base}"/>`,
      );
    }
    label = centeredText({
      text: o.text,
      x: w / 2,
      y: h / 2,
      size,
      font: o.font,
      weight: o.fontWeight,
      color: ink,
    });
  }
  const defs = fill.defs ? `<defs>${fill.defs}</defs>` : "";
  return svgDocument(w, h, `${defs}${fill.body}${lines.join("")}${label}`);
}
