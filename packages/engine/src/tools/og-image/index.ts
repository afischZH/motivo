/**
 * Open Graph images (docs/TOOLS.md M3): the preview picture of a link on
 * social networks and in chats, with a title, a kicker, a subtitle, the
 * site name and a logo over a backdrop the caller renders (any Musterli
 * motif or the user's picture). Pure SVG; text is wrapped and shrunk
 * without a DOM (`estimateTextWidth`), always escaped and only placed as
 * text content.
 */
import { formatNumber } from "../../curves";
import { contrastRatio } from "../../palette/contrast";
import { escapeXml, stableId, svgDocument } from "../../svg";
import {
  AVATAR_DARK_INK,
  AVATAR_FONT_STACKS,
  AVATAR_LIGHT_INK,
  autoInk,
  estimateTextWidth,
  type AvatarFont,
} from "../avatar";

export const OG_LAYOUTS = ["classic", "centered", "split", "minimal"] as const;
export type OgLayout = (typeof OG_LAYOUTS)[number];

export const OG_PANELS = ["none", "scrim", "card"] as const;
export type OgPanel = (typeof OG_PANELS)[number];

/** Smallest title size as a share of the preferred size before the title is cut. */
export const OG_TITLE_SHRINK_MIN = 0.6;

const f = (v: number): string => formatNumber(v, 2);

export interface WrappedText {
  readonly lines: readonly string[];
  /** Whether text was cut off (the last line then ends in "…"). */
  readonly truncated: boolean;
}

/**
 * Greedy word wrap into at most `maxLines` lines of `maxWidth` px at font
 * size `size`. Words longer than a line are broken by code points; text that
 * does not fit ends in "…" on the last line.
 */
export function wrapOgText(
  text: string,
  font: AvatarFont,
  size: number,
  maxWidth: number,
  maxLines: number,
): WrappedText {
  const words = text
    .trim()
    .split(/\s+/u)
    .filter((x) => x !== "");
  if (words.length === 0 || maxLines < 1) return { lines: [], truncated: false };
  const fits = (s: string) => estimateTextWidth(s, font) * size <= maxWidth;
  const lines: string[] = [];
  let line = "";
  let truncated = false;
  const push = (s: string): boolean => {
    if (lines.length === maxLines) return false;
    lines.push(s);
    return true;
  };
  outer: for (const word of words) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line !== "") {
      if (!push(line)) {
        truncated = true;
        break;
      }
      line = "";
    }
    if (fits(word)) {
      line = word;
      continue;
    }
    // A word wider than a line: break it by code points.
    let piece = "";
    for (const c of Array.from(word)) {
      if (fits(piece + c) || piece === "") piece += c;
      else {
        if (!push(piece)) {
          truncated = true;
          break outer;
        }
        piece = c;
      }
    }
    line = piece;
  }
  if (!truncated && line !== "" && !push(line)) truncated = true;
  if (truncated) {
    const last = lines[lines.length - 1] ?? "";
    const chars = Array.from(last);
    let cut = chars.length;
    while (cut > 0 && !fits(`${chars.slice(0, cut).join("").trimEnd()}…`)) cut--;
    lines[lines.length - 1] = `${chars.slice(0, cut).join("").trimEnd()}…`;
  }
  return { lines, truncated };
}

/**
 * Font size and lines of a title: the preferred size while the text fits
 * `maxLines`, otherwise smaller in 5 % steps down to `OG_TITLE_SHRINK_MIN`,
 * then cut with "…".
 */
export function fitTitle(
  text: string,
  font: AvatarFont,
  preferred: number,
  maxWidth: number,
  maxLines: number,
): WrappedText & { size: number } {
  let size = preferred;
  for (let k = 1; ; k++) {
    const wrapped = wrapOgText(text, font, size, maxWidth, maxLines);
    const next = preferred * (1 - k * 0.05);
    if (!wrapped.truncated || next < preferred * OG_TITLE_SHRINK_MIN - 1e-9) {
      return { ...wrapped, size };
    }
    size = next;
  }
}

/** White or near black, whichever has the better worst-case contrast over `colors`. */
export function inkForColors(colors: readonly string[]): string {
  if (colors.length === 0) return AVATAR_LIGHT_INK;
  const worst = (ink: string) => Math.min(...colors.map((c) => contrastRatio(ink, c)));
  return worst(AVATAR_DARK_INK) > worst(AVATAR_LIGHT_INK) ? AVATAR_DARK_INK : AVATAR_LIGHT_INK;
}

export interface OgLogo {
  readonly href: string;
  /** Width / height of the picture. */
  readonly aspect: number;
}

export interface OgImageOptions {
  readonly width: number;
  readonly height: number;
  /** Backdrop as a complete SVG document of the same size, nested at 0, 0. */
  readonly backdrop: string;
  readonly layout: OgLayout;
  readonly panel: OgPanel;
  readonly panelColor: string;
  /** Panel opacity in [0, 1] (scrim strength, card opacity; the split panel is opaque). */
  readonly panelOpacity: number;
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle: string;
  readonly site: string;
  readonly logo: OgLogo | null;
  readonly font: AvatarFont;
  readonly titleWeight: number;
  /** Title size, percent of the height. */
  readonly titleSize: number;
  readonly ink: string;
  readonly accent: string;
  /** Margin, percent of the shorter edge. */
  readonly padding: number;
}

export interface OgImageResult {
  readonly svg: string;
  /** Whether the title or subtitle had to be cut. */
  readonly truncated: boolean;
}

interface TextBlock {
  readonly x: number;
  readonly width: number;
  readonly anchor: "start" | "middle";
}

export function ogImage(o: OgImageOptions): OgImageResult {
  const { width: w, height: h } = o;
  const pad = (Math.min(w, h) * o.padding) / 100;
  const parts: string[] = [];
  const defs: string[] = [];
  parts.push(o.backdrop.replace("<svg ", '<svg x="0" y="0" '));

  // Split: an opaque panel over the left 58 %, the motif shows on the right.
  const splitWidth = o.layout === "split" ? Math.round(w * 0.58) : 0;
  if (o.layout === "split") {
    parts.push(
      `<rect width="${f(splitWidth)}" height="${f(h)}" fill="${escapeXml(o.panelColor)}"/>`,
    );
  }
  const block: TextBlock =
    o.layout === "centered"
      ? { x: w / 2, width: w - 2 * pad, anchor: "middle" }
      : o.layout === "split"
        ? { x: pad, width: splitWidth - 2 * pad, anchor: "start" }
        : { x: pad, width: Math.min(w - 2 * pad, w * 0.86), anchor: "start" };

  const stack = AVATAR_FONT_STACKS[o.font];
  const text = (
    x: number,
    y: number,
    s: string,
    size: number,
    weight: number,
    fill: string,
    opacity = 1,
  ) =>
    `<text x="${f(x)}" y="${f(y)}" text-anchor="${block.anchor}" font-family="${stack}" font-size="${f(size)}" font-weight="${Math.round(weight)}" fill="${escapeXml(fill)}"${opacity < 1 ? ` fill-opacity="${f(opacity)}"` : ""}>${escapeXml(s)}</text>`;

  // Sizes relative to the height, so square and wide formats look alike.
  const small = h * 0.036;
  const titleFit = fitTitle(o.title, o.font, (h * o.titleSize) / 100, block.width, 3);
  const subtitleSize = Math.max(small, titleFit.size * 0.42);
  const subtitle = wrapOgText(o.subtitle, o.font, subtitleSize, block.width, 2);
  const titleLead = titleFit.size * 1.1;
  const subLead = subtitleSize * 1.35;

  // Header: logo and site name (bottom row in "minimal").
  const logoHeight = h * 0.085;
  const logoWidth = o.logo ? Math.min(w * 0.3, logoHeight * o.logo.aspect) : 0;
  const logoDrawnHeight = o.logo ? logoWidth / o.logo.aspect : 0;
  const siteSize = small * 1.05;
  const siteWidth = o.site === "" ? 0 : estimateTextWidth(o.site, o.font) * siteSize;
  const gap = o.logo && o.site !== "" ? small * 0.6 : 0;
  const rowWidth = logoWidth + gap + siteWidth;
  const rowY = o.layout === "minimal" ? h - pad - logoHeight : pad;
  const rowX = block.anchor === "middle" ? (w - rowWidth) / 2 : block.x;
  const header: string[] = [];
  if (o.logo) {
    header.push(
      `<image href="${escapeXml(o.logo.href)}" x="${f(rowX)}" y="${f(rowY + (logoHeight - logoDrawnHeight) / 2)}" width="${f(logoWidth)}" height="${f(logoDrawnHeight)}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }
  if (o.site !== "") {
    header.push(
      `<text x="${f(rowX + logoWidth + gap)}" y="${f(rowY + logoHeight / 2 + siteSize * 0.35)}" font-family="${stack}" font-size="${f(siteSize)}" font-weight="600" fill="${escapeXml(o.ink)}" fill-opacity="0.85">${escapeXml(o.site)}</text>`,
    );
  }
  const hasHeader = header.length > 0;

  // Main block: kicker pill, title, subtitle.
  const pillSize = small * 0.95;
  const pillH = o.eyebrow === "" ? 0 : pillSize * 1.9;
  const pillGap = pillH > 0 ? small * 0.9 : 0;
  const subGap = subtitle.lines.length > 0 ? titleFit.size * 0.35 : 0;
  const blockHeight =
    pillH + pillGap + titleFit.lines.length * titleLead + subGap + subtitle.lines.length * subLead;
  const headerSpace = hasHeader ? logoHeight + small : 0;
  let top: number;
  if (o.layout === "classic") top = h - pad - blockHeight;
  else if (o.layout === "minimal") top = Math.max(pad, (h - headerSpace - blockHeight) / 2);
  else top = Math.max(pad + headerSpace, (h - blockHeight) / 2 + headerSpace / 2);
  top = Math.max(pad + (o.layout === "minimal" ? 0 : headerSpace), top);

  const body: string[] = [];
  let y = top;
  // Widest drawn line, for the card.
  let contentWidth = 0;
  if (o.eyebrow !== "") {
    const pillText = estimateTextWidth(o.eyebrow, o.font) * pillSize;
    const pillW = Math.min(block.width, pillText + pillSize * 1.6);
    const pillX = block.anchor === "middle" ? block.x - pillW / 2 : block.x;
    contentWidth = Math.max(contentWidth, pillW);
    body.push(
      `<rect x="${f(pillX)}" y="${f(y)}" width="${f(pillW)}" height="${f(pillH)}" rx="${f(pillH / 2)}" fill="${escapeXml(o.accent)}"/>`,
      `<text x="${f(pillX + pillW / 2)}" y="${f(y + pillH / 2 + pillSize * 0.35)}" text-anchor="middle" font-family="${stack}" font-size="${f(pillSize)}" font-weight="700" fill="${autoInk(o.accent)}">${escapeXml(o.eyebrow)}</text>`,
    );
    y += pillH + pillGap;
  }
  for (const line of titleFit.lines) {
    contentWidth = Math.max(contentWidth, estimateTextWidth(line, o.font) * titleFit.size);
    body.push(text(block.x, y + titleFit.size * 0.92, line, titleFit.size, o.titleWeight, o.ink));
    y += titleLead;
  }
  y += subGap;
  for (const line of subtitle.lines) {
    contentWidth = Math.max(contentWidth, estimateTextWidth(line, o.font) * subtitleSize);
    body.push(text(block.x, y + subtitleSize * 0.95, line, subtitleSize, 400, o.ink, 0.82));
    y += subLead;
  }

  // Panels behind the text (not in "split", which has its own).
  if (o.layout !== "split" && o.panel !== "none") {
    const alpha = Math.max(0, Math.min(1, o.panelOpacity));
    if (o.panel === "scrim") {
      // Full-size gradient towards the text: bottom for "classic", left otherwise, centre for "centered".
      const stops =
        o.layout === "centered"
          ? `<stop offset="0" stop-color="${escapeXml(o.panelColor)}" stop-opacity="${f(alpha)}"/><stop offset="1" stop-color="${escapeXml(o.panelColor)}" stop-opacity="${f(alpha * 0.35)}"/>`
          : `<stop offset="0" stop-color="${escapeXml(o.panelColor)}" stop-opacity="${f(alpha)}"/><stop offset="1" stop-color="${escapeXml(o.panelColor)}" stop-opacity="0"/>`;
      const id = stableId("og", `${o.layout}|${stops}`);
      const grad =
        o.layout === "centered"
          ? `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.75">${stops}</radialGradient>`
          : o.layout === "classic"
            ? `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0">${stops}</linearGradient>`
            : `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>`;
      defs.push(grad);
      parts.push(`<rect width="${f(w)}" height="${f(h)}" fill="url(#${id})"/>`);
    } else {
      // A rounded card around the text block, within half the margin of the edges.
      const inset = small * 1.1;
      const cardTop = Math.max(pad / 2, top - inset);
      const cardBottom = Math.min(h - pad / 2, y + inset * 0.6);
      const cardW = Math.min(w - pad, Math.min(block.width, contentWidth) + 2 * inset);
      const cardX =
        block.anchor === "middle" ? (w - cardW) / 2 : Math.max(pad / 2, block.x - inset);
      parts.push(
        `<rect x="${f(cardX)}" y="${f(cardTop)}" width="${f(cardW)}" height="${f(Math.max(0, cardBottom - cardTop))}" rx="${f(small * 0.9)}" fill="${escapeXml(o.panelColor)}" fill-opacity="${f(alpha)}"/>`,
      );
    }
  }
  parts.push(...header, ...body);
  const defsMarkup = defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "";
  return {
    svg: svgDocument(w, h, `${defsMarkup}${parts.join("")}`),
    truncated: titleFit.truncated || subtitle.truncated,
  };
}
