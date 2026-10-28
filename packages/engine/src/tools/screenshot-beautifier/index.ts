/**
 * Screenshot beautifier (docs/TOOLS.md K6): a screenshot on a background,
 * fitted into the canvas with padding, rounded corners, a layered soft
 * shadow, an optional border and highlight and an optional self-drawn
 * window or browser bar.
 *
 * Pure and DOM-free. The background arrives as finished SVG markup (the
 * registry builds it from Musterli's own generators), the screenshot as an
 * image `href` (a data URI checked by the tool schema) or, without upload,
 * as the self-drawn placeholder below. Shadows reuse the layer curve of the
 * CSS shadow tool (`shadowLayers`, J1) and draw each layer as a blurred
 * rounded rectangle, standard deviation blur / 2 as in CSS.
 */
import { formatNumber } from "../../curves";
import { escapeXml, stableId, svgDocument } from "../../svg";
import { shadowLayers, type ShadowLayer } from "../css-shadow";
import { BENTO_FONT_STACK } from "../bento-grid/content";

export const SCREENSHOT_FRAMES = ["none", "window", "browser"] as const;
export type ScreenshotFrame = (typeof SCREENSHOT_FRAMES)[number];

export const SCREENSHOT_THEMES = ["light", "dark"] as const;
export type ScreenshotTheme = (typeof SCREENSHOT_THEMES)[number];

export const SCREENSHOT_ALIGNS = ["center", "top", "bottom", "left", "right"] as const;
export type ScreenshotAlign = (typeof SCREENSHOT_ALIGNS)[number];

/** Longest text in the address or title bar (characters). */
export const SCREENSHOT_URL_MAX = 120;
/** Largest padding in percent of the shorter canvas edge. */
export const SCREENSHOT_PADDING_MAX = 40;

/** Bar height as a share of the window width. */
export const SCREENSHOT_BAR_RATIO: Readonly<Record<ScreenshotFrame, number>> = {
  none: 0,
  window: 0.045,
  browser: 0.062,
};

/** Size of the self-drawn placeholder (16:10). */
export const PLACEHOLDER_WIDTH = 1440;
export const PLACEHOLDER_HEIGHT = 900;

/**
 * Largest Gaussian standard deviation at the output edge browsers render
 * faithfully (see `MESH_FILTER_SIGMA_MAX`); shadows scale it to the design.
 */
const SHADOW_SIGMA_AT_8K = 200;
const OUTPUT_EDGE_MAX = 8192;

export interface ScreenshotRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenshotImage {
  /** Data URI of the picture (raster or sanitised SVG). */
  readonly href: string;
  /** Size of the picture in its own units; only the aspect ratio matters. */
  readonly width: number;
  readonly height: number;
}

export interface ScreenshotLayoutOptions {
  readonly width: number;
  readonly height: number;
  /** Padding in percent of the shorter canvas edge. */
  readonly padding: number;
  readonly align: ScreenshotAlign;
  /** Width / height of the screenshot. */
  readonly aspect: number;
  readonly frame: ScreenshotFrame;
  /** Border width in px, drawn outside the window. */
  readonly border: number;
  /** Corner radius in px. */
  readonly radius: number;
}

export interface ScreenshotLayout {
  /** The window: bar plus screenshot. */
  readonly window: ScreenshotRect;
  /** The bar on top of the window, `null` without frame. */
  readonly bar: ScreenshotRect | null;
  /** The screenshot inside the window. */
  readonly shot: ScreenshotRect;
  /** Corner radius of the window after clamping. */
  readonly radius: number;
  /** Border width after clamping. */
  readonly border: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

/**
 * Fits the window (bar plus screenshot, keeping its aspect ratio) into the
 * canvas minus padding and border, then places it by `align` in the free
 * space. Pure geometry, unit-tested.
 */
export function screenshotLayout(o: ScreenshotLayoutOptions): ScreenshotLayout {
  const W = Math.max(1, o.width);
  const H = Math.max(1, o.height);
  const m = Math.min(W, H);
  const pad = (clamp(finite(o.padding, 0), 0, SCREENSHOT_PADDING_MAX) / 100) * m;
  const border = clamp(finite(o.border, 0), 0, m / 8);
  const availW = Math.max(1, W - 2 * (pad + border));
  const availH = Math.max(1, H - 2 * (pad + border));
  const aspect = clamp(finite(o.aspect, 1.6), 0.05, 20);
  const r = SCREENSHOT_BAR_RATIO[o.frame];
  // Window height per unit of width: screenshot plus bar.
  const perWidth = 1 / aspect + r;
  const w = Math.min(availW, availH / perWidth);
  const h = w * perWidth;
  const barH = w * r;
  const left = pad + border;
  const top = pad + border;
  const x =
    o.align === "left" ? left : o.align === "right" ? W - left - w : left + (availW - w) / 2;
  const y = o.align === "top" ? top : o.align === "bottom" ? H - top - h : top + (availH - h) / 2;
  const radius = clamp(finite(o.radius, 0), 0, Math.min(w, h) / 2);
  return {
    window: { x, y, width: w, height: h },
    bar: barH > 0 ? { x, y, width: w, height: barH } : null,
    shot: { x, y: y + barH, width: w, height: h - barH },
    radius,
    border,
  };
}

const f = (v: number): string => formatNumber(v, 2);

/** Rounded rectangle as a path (absolute start, relative segments). */
export function roundedRectPath(rect: ScreenshotRect, radius: number): string {
  const { x, y, width: w, height: h } = rect;
  if (!(w > 0 && h > 0)) return "";
  const rr = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (rr === 0) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
  return (
    `M${f(x + rr)} ${f(y)}h${f(w - 2 * rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(rr)}` +
    `v${f(h - 2 * rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(-rr)} ${f(rr)}h${f(-(w - 2 * rr))}` +
    `a${f(rr)} ${f(rr)} 0 0 1 ${f(-rr)} ${f(-rr)}v${f(-(h - 2 * rr))}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(-rr)}Z`
  );
}

const grow = (r: ScreenshotRect, d: number): ScreenshotRect => ({
  x: r.x - d,
  y: r.y - d,
  width: r.width + 2 * d,
  height: r.height + 2 * d,
});

/**
 * Shadow layers for a strength in [0, 1] on a canvas whose shorter edge is
 * `m`: five layers growing along ease-out, light from the top. The largest
 * blur is capped so its standard deviation stays within what browsers draw
 * faithfully even when the design is exported at 8K.
 */
export function screenshotShadowLayers(
  strength: number,
  width: number,
  height: number,
): ShadowLayer[] {
  const s = clamp(finite(strength, 0), 0, 1);
  if (s === 0) return [];
  const m = Math.min(width, height);
  const sigmaMax = (SHADOW_SIGMA_AT_8K * Math.max(width, height)) / OUTPUT_EDGE_MAX;
  return shadowLayers({
    layers: 5,
    distance: s * 0.06 * m,
    blur: Math.min(s * 0.16 * m, 2 * sigmaMax),
    spread: -s * 0.012 * m,
    angle: 0,
    opacity: 0.2 + 0.55 * s,
    easing: "ease-out",
  });
}

/** Blurred rounded rectangles under `shape`, back to front as in CSS. */
function shadowMarkup(
  layers: readonly ShadowLayer[],
  shape: ScreenshotRect,
  radius: number,
  color: string,
  width: number,
  height: number,
): { defs: string; body: string } {
  let defs = "";
  let body = "";
  const seen = new Set<string>();
  for (const l of [...layers].reverse()) {
    let filter = "";
    if (l.blur > 0) {
      const pad = 1.5 * l.blur;
      const def =
        `<filter x="${f(-pad)}" y="${f(-pad)}" width="${f(width + 2 * pad)}" height="${f(height + 2 * pad)}" ` +
        `filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="${f(l.blur / 2)}"/></filter>`;
      const id = stableId("ss", def);
      if (!seen.has(id)) {
        seen.add(id);
        defs += def.replace("<filter ", `<filter id="${id}" `);
      }
      filter = ` filter="url(#${id})"`;
    }
    const rect = grow({ ...shape, x: shape.x + l.x, y: shape.y + l.y }, l.spread);
    const d = roundedRectPath(rect, radius > 0 ? Math.max(0, radius + l.spread) : 0);
    if (d) {
      body += `<path d="${d}" fill="${color}" fill-opacity="${formatNumber(l.alpha, 3)}"${filter}/>`;
    }
  }
  return { defs, body };
}

/** Colours of the self-drawn bars and the placeholder per theme. */
export const SCREENSHOT_THEME_COLORS: Readonly<
  Record<
    ScreenshotTheme,
    {
      bar: string;
      line: string;
      field: string;
      text: string;
      page: string;
      panel: string;
      card: string;
      ink: string;
      muted: string;
    }
  >
> = {
  light: {
    bar: "#eef1f5",
    line: "#d5dbe3",
    field: "#ffffff",
    text: "#475569",
    page: "#f8fafc",
    panel: "#eef2f7",
    card: "#ffffff",
    ink: "#1e293b",
    muted: "#cbd5e1",
  },
  dark: {
    bar: "#1f2430",
    line: "#0b0e14",
    field: "#2c3341",
    text: "#cbd5e1",
    page: "#111827",
    panel: "#0b1220",
    card: "#1f2937",
    ink: "#e2e8f0",
    muted: "#475569",
  },
};

/** Traffic-light colours of the window buttons (close, minimise, zoom). */
export const WINDOW_BUTTON_COLORS = ["#ff5f57", "#febc2e", "#28c840"] as const;

/**
 * Cuts `text` so it fits about `maxWidth` px at `fontSize` (average glyph
 * width 0.56 em; no font metrics without a DOM), with an ellipsis.
 */
export function fitBarText(text: string, maxWidth: number, fontSize: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const max = Math.max(0, Math.floor(maxWidth / (fontSize * 0.56)));
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  if (max <= 1) return "";
  return `${chars.slice(0, max - 1).join("")}…`;
}

function barMarkup(
  bar: ScreenshotRect,
  frame: ScreenshotFrame,
  theme: ScreenshotTheme,
  text: string,
): string {
  const c = SCREENSHOT_THEME_COLORS[theme];
  const u = bar.height;
  const lw = Math.max(0.5, u * 0.025);
  let out = `<rect x="${f(bar.x)}" y="${f(bar.y)}" width="${f(bar.width)}" height="${f(u)}" fill="${c.bar}"/>`;
  out += `<rect x="${f(bar.x)}" y="${f(bar.y + u - lw)}" width="${f(bar.width)}" height="${f(lw)}" fill="${c.line}"/>`;
  const browser = frame === "browser";
  const r = u * (browser ? 0.14 : 0.19);
  const start = u * (browser ? 0.5 : 0.62);
  const gap = u * (browser ? 0.44 : 0.6);
  const cy = bar.y + u / 2;
  WINDOW_BUTTON_COLORS.forEach((color, i) => {
    out += `<circle cx="${f(bar.x + start + i * gap)}" cy="${f(cy)}" r="${f(r)}" fill="${color}"/>`;
  });
  const lightsEnd = start + 2 * gap + r;
  if (browser) {
    const fieldW = Math.min(bar.width * 0.6, bar.width - 2 * (lightsEnd + u * 0.4));
    if (fieldW > u) {
      const fieldH = u * 0.58;
      const fx = bar.x + (bar.width - fieldW) / 2;
      const fy = cy - fieldH / 2;
      out += `<rect x="${f(fx)}" y="${f(fy)}" width="${f(fieldW)}" height="${f(fieldH)}" rx="${f(fieldH / 2)}" fill="${c.field}"/>`;
      const size = u * 0.3;
      const shown = fitBarText(text, fieldW - u * 0.8, size);
      if (shown) out += barText(bar.x + bar.width / 2, cy, size, c.text, shown);
    }
  } else {
    const size = u * 0.36;
    const room = bar.width - 2 * (lightsEnd + u * 0.5);
    const shown = room > 0 ? fitBarText(text, room, size) : "";
    if (shown) out += barText(bar.x + bar.width / 2, cy, size, c.text, shown);
  }
  return out;
}

function barText(x: number, cy: number, size: number, color: string, text: string): string {
  // Baseline a third of the font size below the centre line looks centred for Latin text.
  return (
    `<text x="${f(x)}" y="${f(cy + size * 0.35)}" font-family="${BENTO_FONT_STACK}" ` +
    `font-size="${f(size)}" fill="${color}" text-anchor="middle">${escapeXml(text)}</text>`
  );
}

/**
 * Self-drawn stand-in screenshot (a dashboard sketch without text), 1440 ×
 * 900 units, as the inner markup of an `<svg viewBox>`. Shown until the
 * user adds a picture, so presets, thumbnails and snapshots work.
 */
export function placeholderScreenshot(theme: ScreenshotTheme, accent: string): string {
  const c = SCREENSHOT_THEME_COLORS[theme];
  const parts: string[] = [];
  const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0) =>
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ""} fill="${fill}"/>`,
    );
  rect(0, 0, PLACEHOLDER_WIDTH, PLACEHOLDER_HEIGHT, c.page);
  // Sidebar with logo and navigation.
  rect(0, 0, 260, PLACEHOLDER_HEIGHT, c.panel);
  parts.push(`<circle cx="56" cy="64" r="20" fill="${accent}"/>`);
  rect(88, 54, 110, 20, c.ink, 10);
  for (let i = 0; i < 6; i++) {
    const y = 140 + i * 56;
    if (i === 0) rect(24, y - 14, 212, 44, c.card, 12);
    rect(48, y, 20, 16, i === 0 ? accent : c.muted, 5);
    rect(84, y + 1, 90 + ((i * 37) % 60), 14, i === 0 ? c.ink : c.muted, 7);
  }
  // Header.
  rect(304, 48, 260, 28, c.ink, 14);
  rect(304, 92, 380, 16, c.muted, 8);
  rect(1196, 48, 196, 48, accent, 24);
  // Three figure cards.
  for (let i = 0; i < 3; i++) {
    const x = 304 + i * 368;
    rect(x, 144, 344, 168, c.card, 20);
    rect(x + 28, 176, 120, 14, c.muted, 7);
    rect(x + 28, 214, 160 - i * 24, 36, c.ink, 10);
    rect(x + 28, 270, 72, 14, i === 1 ? "#ef4444" : "#22c55e", 7);
  }
  // Chart card: area and line.
  rect(304, 340, 712, 512, c.card, 20);
  rect(336, 372, 180, 18, c.ink, 9);
  const pts = [0.62, 0.55, 0.6, 0.42, 0.48, 0.3, 0.36, 0.22, 0.28, 0.12];
  const cx0 = 336;
  const cw = 648;
  const top = 430;
  const ch = 380;
  const coords = pts.map((p, i) => [cx0 + (i * cw) / (pts.length - 1), top + p * ch] as const);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("");
  for (let i = 0; i < 4; i++) rect(cx0, top + i * 120 + 20, cw, 2, c.muted);
  parts.push(
    `<path d="${line}L${cx0 + cw} ${top + ch}L${cx0} ${top + ch}Z" fill="${accent}" fill-opacity="0.18"/>`,
  );
  parts.push(
    `<path d="${line}" fill="none" stroke="${accent}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`,
  );
  // List card.
  rect(1040, 340, 352, 512, c.card, 20);
  rect(1072, 372, 140, 18, c.ink, 9);
  for (let i = 0; i < 6; i++) {
    const y = 428 + i * 66;
    parts.push(
      `<circle cx="1092" cy="${y + 18}" r="18" fill="${i % 2 ? c.muted : accent}" fill-opacity="${i % 2 ? 1 : 0.5}"/>`,
    );
    rect(1124, y + 4, 150 - ((i * 29) % 70), 12, c.ink, 6);
    rect(1124, y + 24, 210 - ((i * 41) % 90), 10, c.muted, 5);
  }
  return parts.join("");
}

export interface ScreenshotOptions extends Omit<ScreenshotLayoutOptions, "aspect"> {
  /** Background markup covering the canvas (rects, a nested `<svg>`). */
  readonly backgroundSvg: string;
  /** The user's picture; `undefined` draws the placeholder. */
  readonly image?: ScreenshotImage | undefined;
  /** Shadow strength 0 to 100. */
  readonly shadow: number;
  readonly shadowColor: string;
  readonly borderColor: string;
  /** Border opacity 0 to 100. */
  readonly borderOpacity: number;
  /** Thin light line along the inner edge (glass rim). */
  readonly highlight: boolean;
  readonly theme: ScreenshotTheme;
  /** Address (browser) or title (window); escaped. */
  readonly url: string;
  /** Accent colour of the placeholder. */
  readonly accent: string;
}

/** Characters an attribute value must not contain unescaped. */
const NEEDS_ESCAPE = /[&<>"']/;

/** One-entry memo: a multi-megabyte data URI is scanned once per picture, not per render. */
let lastHref = "";
let lastSafeHref = "";
function attributeHref(href: string): string {
  if (href !== lastHref) {
    lastHref = href;
    // Base64 data URIs (checked by the schema) need no escaping; anything else is escaped.
    lastSafeHref = NEEDS_ESCAPE.test(href) ? escapeXml(href) : href;
  }
  return lastSafeHref;
}

/** Where the picture sits, for previews that show it as a layer of its own. */
export interface ScreenshotPictureLayer {
  /** The window (bar plus picture), in px of the canvas. */
  readonly window: ScreenshotRect;
  /** Height of the bar above the picture (0 without frame). */
  readonly barHeight: number;
  /** Corner radius of the window. */
  readonly radius: number;
  /** Width of the light inner edge in px, 0 without. */
  readonly highlight: number;
  /** Opacity of the light inner edge. */
  readonly highlightOpacity: number;
}

export interface ScreenshotScene {
  /** The finished document (exports, thumbnails). */
  readonly svg: string;
  /**
   * The same document without the user's picture and the light edge on top
   * of it, so a preview can show the picture as a layer of its own
   * (`picture`) that the browser decodes once instead of on every change.
   * Equal to `svg` without a picture.
   */
  readonly stageSvg: string;
  /** Present with a picture: where the preview layer goes. */
  readonly picture?: ScreenshotPictureLayer;
}

const HIGHLIGHT_OPACITY = 0.35;

/** The finished SVG plus the parts a layered preview needs. */
export function screenshotScene(o: ScreenshotOptions): ScreenshotScene {
  const W = o.width;
  const H = o.height;
  const aspect = o.image ? o.image.width / o.image.height : PLACEHOLDER_WIDTH / PLACEHOLDER_HEIGHT;
  const layout = screenshotLayout({ ...o, aspect });
  const { window: win, bar, shot, radius, border } = layout;
  const outer = grow(win, border);
  const outerRadius = radius > 0 ? radius + border : 0;

  const shadow = shadowMarkup(
    screenshotShadowLayers(o.shadow / 100, W, H),
    outer,
    outerRadius,
    o.shadowColor,
    W,
    H,
  );
  const windowPath = roundedRectPath(win, radius);
  const clipDef = `<clipPath><path d="${windowPath}"/></clipPath>`;
  const clipId = stableId("sc", clipDef);
  const defs = `<defs>${shadow.defs}${clipDef.replace("<clipPath>", `<clipPath id="${clipId}">`)}</defs>`;

  const barSvg = bar ? barMarkup(bar, o.frame, o.theme, o.url) : "";
  const picture = o.image
    ? `<image x="${f(shot.x)}" y="${f(shot.y)}" width="${f(shot.width)}" height="${f(shot.height)}" ` +
      `preserveAspectRatio="xMidYMid slice" xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${attributeHref(o.image.href)}"/>`
    : `<svg x="${f(shot.x)}" y="${f(shot.y)}" width="${f(shot.width)}" height="${f(shot.height)}" ` +
      `viewBox="0 0 ${PLACEHOLDER_WIDTH} ${PLACEHOLDER_HEIGHT}" preserveAspectRatio="none">` +
      `${placeholderScreenshot(o.theme, o.accent)}</svg>`;

  let ring = "";
  if (border > 0 && o.borderOpacity > 0) {
    const r = grow(win, border / 2);
    ring = `<path d="${roundedRectPath(r, radius > 0 ? radius + border / 2 : 0)}" fill="none" stroke="${o.borderColor}" stroke-opacity="${formatNumber(clamp(o.borderOpacity, 0, 100) / 100, 3)}" stroke-width="${f(border)}"/>`;
  }
  const lw = o.highlight ? Math.max(1, Math.min(W, H) / 900) : 0;
  const highlight =
    lw > 0
      ? `<path d="${roundedRectPath(grow(win, -lw / 2), Math.max(0, radius - lw / 2))}" fill="none" stroke="#ffffff" stroke-opacity="${HIGHLIGHT_OPACITY}" stroke-width="${f(lw)}"/>`
      : "";

  const head = `${defs}${o.backgroundSvg}${shadow.body}`;
  const svg = svgDocument(
    W,
    H,
    `${head}<g clip-path="url(#${clipId})">${barSvg}${picture}</g>${ring}${highlight}`,
  );
  if (!o.image) return { svg, stageSvg: svg };
  const stageSvg = svgDocument(
    W,
    H,
    `${head}${barSvg ? `<g clip-path="url(#${clipId})">${barSvg}</g>` : ""}${ring}`,
  );
  return {
    svg,
    stageSvg,
    picture: {
      window: win,
      barHeight: bar ? bar.height : 0,
      radius,
      highlight: lw,
      highlightOpacity: HIGHLIGHT_OPACITY,
    },
  };
}

/** The finished SVG document. */
export function screenshotSvg(o: ScreenshotOptions): string {
  return screenshotScene(o).svg;
}
