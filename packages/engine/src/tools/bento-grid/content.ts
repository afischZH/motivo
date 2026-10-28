/**
 * The user's own content in bento tiles (M4-AP06b): title and subtitle
 * text, an icon from the shape library, an own graphic and a background
 * picture per tile, plus a background picture for the whole grid.
 *
 * Pure and DOM-free. Pictures arrive as data URIs (`href`, already
 * sanitised and re-encoded by the tool registry) for the SVG, and as a
 * separate `codeUrl` (a placeholder file name) for the code exports, so
 * the user's files never end up inside code by accident. All text is
 * escaped with `escapeXml` wherever it is written (SVG text, HTML).
 *
 * Text uses the type scale of the design tokens (docs/DESIGN.md: 12, 14,
 * 16, 20, 24, 32, 48 px) and the system UI font stack, which is available
 * when the SVG is rasterised from an `<img>`. SVG has no line wrapping, so
 * lines are broken here with a conservative average glyph width; overflow
 * ends with an ellipsis and the tile clips everything to its rounded shape.
 */
import { formatNumber } from "../../curves";
import { escapeXml, stableId } from "../../svg";
import { IMAGE_POSITION_ALIGN, type ImagePosition } from "../glass-effects";

/** Type scale of the design tokens, in px. */
export const BENTO_TYPE_SCALE = [12, 14, 16, 20, 24, 32, 48] as const;

/** System UI fonts (no web font needed for SVG, PNG or HTML). */
export const BENTO_FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

/** Average glyph advance relative to the font size (conservative, for line breaks). */
const CHAR_WIDTH = 0.56;
const LINE_HEIGHT = 1.25;
const TITLE_LINES = 2;
const SUBTITLE_LINES = 3;
const ELLIPSIS = "…";

/** A picture in a tile or behind the grid. */
export interface BentoPicture {
  /** Data URI for the SVG (preview and image exports). */
  readonly href: string;
  /** URL written into the code exports (placeholder file name, or `href` to embed). */
  readonly codeUrl: string;
}

/** The own graphic of a tile: contained in the free area, anchored at `position`. */
export interface BentoGraphic extends BentoPicture {
  readonly position: ImagePosition;
  /** Size in percent of the free area (20 to 100). */
  readonly size: number;
}

/** What the user put into one tile. Empty strings and missing fields mean "none". */
export interface BentoUserContent {
  readonly title?: string;
  readonly subtitle?: string;
  /** Path data of a library shape in its centred 100 box (`shapePath(id)`). */
  readonly icon?: string;
  readonly graphic?: BentoGraphic;
  readonly background?: BentoPicture;
}

/** Content of the whole grid: per tile in reading order, plus a grid picture. */
export interface BentoExtras {
  /** Index i belongs to tile i of the layout (reading order). */
  readonly contents?: readonly (BentoUserContent | undefined)[];
  readonly backgroundImage?: BentoPicture;
}

const f = (v: number): string => formatNumber(v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Text with whitespace runs collapsed (SVG and HTML both show one line per break here). */
export function normalizeText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Whether a tile has anything of the user's to show. */
export function hasUserContent(c: BentoUserContent | undefined): c is BentoUserContent {
  if (!c) return false;
  return (
    normalizeText(c.title) !== "" ||
    normalizeText(c.subtitle) !== "" ||
    c.icon !== undefined ||
    c.graphic !== undefined ||
    c.background !== undefined
  );
}

/** Whether any tile (or the grid) has content. */
export function hasExtras(extras: BentoExtras | undefined): boolean {
  if (!extras) return false;
  return extras.backgroundImage !== undefined || (extras.contents ?? []).some(hasUserContent);
}

/** Largest token of the type scale at or below `px` (at least the smallest). */
export function typeToken(px: number): number {
  let out: number = BENTO_TYPE_SCALE[0];
  for (const t of BENTO_TYPE_SCALE) if (t <= px) out = t;
  return out;
}

/** The token `steps` below `size` on the scale (at least the smallest). */
function tokenBelow(size: number, steps: number): number {
  const i = BENTO_TYPE_SCALE.indexOf(size as (typeof BENTO_TYPE_SCALE)[number]);
  return BENTO_TYPE_SCALE[Math.max(0, i - steps)] as number;
}

/**
 * Greedy line breaking for `text` at `fontSize` within `maxWidth`, at most
 * `maxLines` lines. Words longer than a line are cut; if text is left over,
 * the last line ends with an ellipsis. Measures by code points, so emoji and
 * accented letters count once.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
): string[] {
  const clean = normalizeText(text);
  if (clean === "" || maxLines <= 0) return [];
  const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * CHAR_WIDTH)));
  const lines: string[] = [];
  let current: string[] = [];
  const len = (s: string) => [...s].length;
  const words = clean.split(" ");
  let i = 0;
  let overflow = false;
  while (i < words.length) {
    const word = words[i] as string;
    const line = current.join(" ");
    const next = line === "" ? word : `${line} ${word}`;
    if (len(next) <= perLine) {
      current.push(word);
      i++;
      continue;
    }
    if (current.length === 0) {
      // A single word longer than the line: cut it.
      const chars = [...word];
      lines.push(chars.slice(0, perLine).join(""));
      words[i] = chars.slice(perLine).join("");
    } else {
      lines.push(line);
      current = [];
    }
    if (lines.length === maxLines) {
      overflow = true;
      break;
    }
  }
  if (!overflow && current.length > 0) lines.push(current.join(" "));
  if (overflow || lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = [...(kept[kept.length - 1] ?? "")];
    const cut = last.slice(0, Math.max(0, Math.min(last.length, perLine - 1))).join("");
    kept[kept.length - 1] = `${cut.trimEnd()}${ELLIPSIS}`;
    return kept;
  }
  return lines;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextLine {
  text: string;
  y: number;
  size: number;
  title: boolean;
}

/** Where the parts of a tile go, in px of the canvas. */
export interface TileContentLayout {
  readonly pad: number;
  readonly icon?: Box;
  readonly graphic?: Box;
  readonly lines: readonly TextLine[];
  /** Top of the text block (for the scrim over background pictures), or `null`. */
  readonly textTop: number | null;
  readonly titleSize: number;
  readonly subtitleSize: number;
}

/** Inner padding of a tile with content: 8 % of its shorter side, 12 to 32 px. */
export function tilePadding(width: number, height: number): number {
  const unit = Math.min(width, height);
  return Math.min(Math.round(clamp(unit * 0.08, 12, 32)), Math.floor(unit / 4));
}

/** Title size for a tile: the type token near 12 % of its shorter side (12 to 48 px). */
export function tileTitleSize(width: number, height: number): number {
  return typeToken(clamp(Math.min(width, height) * 0.12, 12, 48));
}

/**
 * Layout of the content inside a tile: icon top left, text block at the
 * bottom (title then subtitle), the graphic in the space between. Parts
 * that do not fit are dropped from the bottom of the priority list
 * (subtitle lines, then title lines, then graphic).
 */
export function tileContentLayout(r: Box, c: BentoUserContent): TileContentLayout {
  const pad = tilePadding(r.width, r.height);
  const innerW = Math.max(0, r.width - 2 * pad);
  const innerH = Math.max(0, r.height - 2 * pad);
  const titleSize = tileTitleSize(r.width, r.height);
  const subtitleSize = tokenBelow(titleSize, 2);
  const unit = Math.min(r.width, r.height);

  const iconSize = c.icon !== undefined ? Math.round(clamp(unit * 0.18, 16, 64)) : 0;
  const icon = iconSize > 0 && iconSize <= innerH ? iconSize : 0;
  const iconGap = icon > 0 ? Math.round(pad / 2) : 0;

  let title = wrapText(c.title ?? "", innerW, titleSize, TITLE_LINES);
  let subtitle = wrapText(c.subtitle ?? "", innerW, subtitleSize, SUBTITLE_LINES);
  const gapBetween = Math.round(subtitleSize * 0.4);
  const blockHeight = () =>
    title.length * titleSize * LINE_HEIGHT +
    subtitle.length * subtitleSize * LINE_HEIGHT +
    (title.length > 0 && subtitle.length > 0 ? gapBetween : 0);
  const room = innerH - icon - iconGap;
  while (subtitle.length > 0 && blockHeight() > room) subtitle = subtitle.slice(0, -1);
  while (title.length > 0 && blockHeight() > room) title = title.slice(0, -1);

  const textH = blockHeight();
  const bottom = r.y + r.height - pad;
  const lines: TextLine[] = [];
  let y = bottom - textH;
  const textTop = textH > 0 ? y : null;
  for (const text of title) {
    lines.push({ text, y, size: titleSize, title: true });
    y += titleSize * LINE_HEIGHT;
  }
  if (title.length > 0 && subtitle.length > 0) y += gapBetween;
  for (const text of subtitle) {
    lines.push({ text, y, size: subtitleSize, title: false });
    y += subtitleSize * LINE_HEIGHT;
  }

  const out: {
    pad: number;
    icon?: Box;
    graphic?: Box;
    lines: TextLine[];
    textTop: number | null;
    titleSize: number;
    subtitleSize: number;
  } = { pad, lines, textTop, titleSize, subtitleSize };
  if (icon > 0) out.icon = { x: r.x + pad, y: r.y + pad, width: icon, height: icon };

  if (c.graphic) {
    const gap = Math.round(pad / 2);
    const top = r.y + pad + (icon > 0 ? icon + gap : 0);
    const end = textH > 0 ? bottom - textH - gap : bottom;
    const areaH = end - top;
    if (areaH >= 12 && innerW >= 12) {
      const s = clamp(c.graphic.size, 20, 100) / 100;
      const w = innerW * s;
      const h = areaH * s;
      const p = c.graphic.position;
      const x =
        p === "left"
          ? r.x + pad
          : p === "right"
            ? r.x + pad + innerW - w
            : r.x + pad + (innerW - w) / 2;
      const gy = p === "top" ? top : p === "bottom" ? end - h : top + (areaH - h) / 2;
      out.graphic = { x, y: gy, width: w, height: h };
    }
  }
  return out;
}

const imageTag = (b: Box, href: string, aspect: string): string =>
  `<image x="${f(b.x)}" y="${f(b.y)}" width="${f(b.width)}" height="${f(b.height)}" preserveAspectRatio="${aspect}" xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${escapeXml(href)}"/>`;

/**
 * SVG of the user's content in one tile, clipped to its rounded rectangle:
 * background picture (cover) with a dark scrim under text, icon, graphic
 * (contained), title and subtitle. `ink` is the text colour on plain tiles;
 * on a background picture text is white.
 */
export function tileContentSvg(
  r: Box,
  radius: number,
  c: BentoUserContent,
  ink: string,
): { defs: string; body: string } {
  const layout = tileContentLayout(r, c);
  const defs: string[] = [];
  const parts: string[] = [];
  const clipInner = `><rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.width)}" height="${f(r.height)}" rx="${f(radius)}"/>`;
  const clipId = stableId("bc", clipInner);
  defs.push(`<clipPath id="${clipId}"${clipInner}</clipPath>`);
  const color = c.background ? "#ffffff" : ink;

  if (c.background) {
    parts.push(imageTag(r, c.background.href, "xMidYMid slice"));
    if (layout.textTop !== null) {
      const top = Math.max(r.y, layout.textTop - layout.pad * 2);
      const inner = `x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/>`;
      const id = stableId("bs", inner);
      defs.push(`<linearGradient id="${id}" ${inner}</linearGradient>`);
      parts.push(
        `<rect x="${f(r.x)}" y="${f(top)}" width="${f(r.width)}" height="${f(r.y + r.height - top)}" fill="url(#${id})"/>`,
      );
    }
  }
  if (layout.icon && c.icon !== undefined) {
    const b = layout.icon;
    parts.push(
      `<path transform="translate(${f(b.x + b.width / 2)} ${f(b.y + b.height / 2)}) scale(${formatNumber(b.width / 100, 4)})" fill="${color}" d="${escapeXml(c.icon)}"/>`,
    );
  }
  if (layout.graphic && c.graphic) {
    parts.push(
      imageTag(layout.graphic, c.graphic.href, `${IMAGE_POSITION_ALIGN[c.graphic.position]} meet`),
    );
  }
  if (layout.lines.length > 0) {
    const text = layout.lines
      .map((l) => {
        // Baseline: the line box is size × 1.25; glyphs sit about 0.95 em below its top.
        const base = l.y + l.size * ((LINE_HEIGHT - 1) / 2 + 0.95);
        const attrs = l.title ? ' font-weight="600"' : ' fill-opacity="0.8"';
        return `<text x="${f(r.x + layout.pad)}" y="${f(base)}" font-size="${f(l.size)}"${attrs}>${escapeXml(l.text)}</text>`;
      })
      .join("");
    parts.push(`<g font-family="${BENTO_FONT_STACK}" fill="${color}">${text}</g>`);
  }
  return { defs: defs.join(""), body: `<g clip-path="url(#${clipId})">${parts.join("")}</g>` };
}

/** Background picture of the whole grid (cover), drawn over the background colour. */
export function gridPictureSvg(width: number, height: number, picture: BentoPicture): string {
  return imageTag({ x: 0, y: 0, width, height }, picture.href, "xMidYMid slice");
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/** An `<svg>` element for an icon path, coloured by `currentColor`. */
export function iconHtml(path: string, className: string): string {
  return `<svg class="${className}" viewBox="-50 -50 100 100" aria-hidden="true"><path fill="currentColor" d="${escapeXml(path)}"/></svg>`;
}

/** CSS `url()` value with a URL that cannot break out of the quotes or the attribute. */
export function cssUrl(url: string): string {
  return `url('${url.replace(/['"\\\n\r<>]/g, "")}')`;
}

/** Comment that asks the user to put in their own file. */
export function placeholderComment(what: string, picture: BentoPicture): string | null {
  if (picture.codeUrl === picture.href) return null;
  return `<!-- ${what}: replace ${escapeXml(picture.codeUrl).replace(/--/g, "")} with your own image. -->`;
}
