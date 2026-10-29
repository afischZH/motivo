/**
 * Glass and border effects (docs/TOOLS.md J2): a card on a generated stage,
 * styled as frosted glass (`backdrop-filter`), with a gradient border
 * (static or rotating `conic-gradient`) or with a glow.
 *
 * One model, three outputs: CSS declarations of the card (the preview applies
 * them to a real element; the code exports write them into a stylesheet,
 * Tailwind classes or an HTML example) and an SVG twin of the whole scene
 * for static motifs and image exports. The SVG uses the same numbers: CSS
 * `blur(r)` is a Gaussian with standard deviation r, a `box-shadow` blur
 * radius b is a Gaussian with standard deviation b / 2, CSS `saturate()` is
 * the same matrix as SVG `feColorMatrix type="saturate"`.
 */
import { hexToRgb, mixHex } from "../../color";
import { formatNumber } from "../../curves";
import { contrastRatio } from "../../palette/contrast";
import type { RgbaBuffer } from "../../png";
import type { Rng } from "../../rng";
import { escapeXml, stableId, svgDocument } from "../../svg";
import { cssGradient, cssGradientLayers, type CssGradientOptions } from "../css-gradient";
import { cssPattern } from "../css-patterns";
import { BENTO_FONT_STACK, normalizeText, wrapText } from "../bento-grid/content";
import { grainTile } from "../noise-grain/tile";

export const GLASS_EFFECTS = ["glass", "gradient-border", "glow"] as const;
export type GlassEffect = (typeof GLASS_EFFECTS)[number];

/** Stages the card is shown on: Musterli backgrounds built by other engine tools. */
export const GLASS_BACKDROPS = ["aurora", "shapes", "gradient", "dots", "grid", "stripes"] as const;
export type GlassBackdrop = (typeof GLASS_BACKDROPS)[number];

/** How the user's own stage picture fills the canvas (CSS `background-size`). */
export const GLASS_IMAGE_FITS = ["cover", "contain"] as const;
export type GlassImageFit = (typeof GLASS_IMAGE_FITS)[number];

/** Anchor of the stage picture (CSS `background-position`, SVG `preserveAspectRatio`). */
export const IMAGE_POSITIONS = ["center", "top", "bottom", "left", "right"] as const;
export type ImagePosition = (typeof IMAGE_POSITIONS)[number];

/** Alignment of the user's text on the card. */
export const GLASS_TEXT_ALIGNS = ["left", "center"] as const;
export type GlassTextAlign = (typeof GLASS_TEXT_ALIGNS)[number];

/** Longest title and body text, in characters (they travel in share links). */
export const GLASS_TITLE_MAX = 80;
export const GLASS_BODY_MAX = 240;

/** `preserveAspectRatio` alignment of a position. */
export const IMAGE_POSITION_ALIGN: Readonly<Record<ImagePosition, string>> = {
  center: "xMidYMid",
  top: "xMidYMin",
  bottom: "xMidYMax",
  left: "xMinYMid",
  right: "xMaxYMid",
};

/** The user's own picture as the stage (instead of a generated backdrop). */
export interface GlassImage {
  /** Data URI of the picture (sanitised SVG or re-encoded raster); preview and SVG twin only. */
  readonly href: string;
  readonly fit: GlassImageFit;
  readonly position: ImagePosition;
  /**
   * URL written into code exports: a placeholder file name such as
   * `your-image.jpg` (default), or `href` when the user embeds the picture.
   */
  readonly codeUrl: string;
}

/** Custom property and keyframes of the rotating border (namespaced, used verbatim in exports). */
export const BORDER_ANGLE_PROPERTY = "--musterli-border-angle";
export const BORDER_SPIN_KEYFRAMES = "musterli-border-spin";

/** Edge of the grain tile used on glass, in px (smaller than E1's 256: it repeats on a card only). */
export const GLASS_GRAIN_EDGE = 64;

export interface GlassOptions {
  readonly width: number;
  readonly height: number;
  readonly effect: GlassEffect;
  readonly backdrop: GlassBackdrop;
  /** Stage colours, 2 or more hex colours. */
  readonly backdropPalette: readonly string[];
  /** The user's picture as the stage; replaces `backdrop` (base colour from the palette). */
  readonly image?: GlassImage;
  /** Card size in percent of the canvas. */
  readonly cardWidth: number;
  readonly cardHeight: number;
  /** Corner radius in px. */
  readonly radius: number;
  /** Drop shadow strength, 0 to 100. */
  readonly shadow: number;
  /** Colour of the sample text on the card. */
  readonly textColor: string;
  /**
   * The user's text on the card. When both are empty (or missing) the card
   * shows language-neutral bars instead.
   */
  readonly title?: string;
  readonly body?: string;
  /** Left: from the top left corner; center: centred both ways. Default left. */
  readonly textAlign?: GlassTextAlign;
  // Glass
  /** `backdrop-filter: blur()` radius in px. */
  readonly blur: number;
  readonly tint: string;
  /** Tint opacity in percent. */
  readonly tintOpacity: number;
  /** `saturate()` in percent (100 = unchanged). */
  readonly saturation: number;
  /** Opacity of the light inner border in percent (0 = none). */
  readonly border: number;
  /** Grain amount in percent (0 = none). */
  readonly noise: number;
  /** PNG data URI of the grain tile (see `glassGrainTile`); required when `noise` > 0. */
  readonly grainHref?: string;
  // Gradient border
  readonly borderPalette: readonly string[];
  readonly borderWidth: number;
  readonly borderAngle: number;
  readonly animated: boolean;
  /** Seconds per turn of the animated border. */
  readonly speed: number;
  /** Fill of the card for the border and glow effects. */
  readonly surface: string;
  // Glow
  readonly glowColor: string;
  /** Glow reach in px. */
  readonly glowSize: number;
  /** Glow strength in percent. */
  readonly glowIntensity: number;
}

/** One CSS declaration. Repeated properties are allowed (fallback first). */
export type Declaration = readonly [property: string, value: string];

/** One line of the user's text, for the SVG twin. */
export interface CardTextLine {
  readonly size: number;
  readonly bold: boolean;
  readonly align: GlassTextAlign;
  /** Opacity of the text colour. */
  readonly alpha: number;
}

/** A box inside the card, relative to it (sample text bars or one line of text). */
export interface CardBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly css: string;
  /** The line shown in the box (already broken to fit); bars have none. */
  readonly text?: string;
  readonly line?: CardTextLine;
}

export interface GlassResult {
  /** Declarations of the stage (the canvas box). */
  readonly stageCss: string;
  /**
   * The stage as written into code exports: equal to `stageCss` except for
   * the user's picture, which becomes `GlassImage.codeUrl`.
   */
  readonly stageCodeCss: string;
  readonly card: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    /** Declarations of the card without the animation. */
    readonly declarations: readonly Declaration[];
    /** The animation declarations, only for the animated border. */
    readonly motion: readonly Declaration[];
    readonly content: readonly CardBox[];
  };
  /** Global rules the card needs (`@property`, `@keyframes`), or "". */
  readonly rules: string;
  readonly svg: string;
}

const f = (v: number, p = 2): string => formatNumber(v, p);
const px = (v: number): string => `${f(v)}px`;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** `#rrggbb` plus alpha as 8-digit hex (`#rrggbbaa`), the short form when opaque. */
export function hexAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const to = (v: number) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, "0");
  const base = `#${to(r)}${to(g)}${to(b)}`;
  const a = clamp01(alpha);
  return a >= 1 ? base : `${base}${to(a)}`;
}

/** `rgb(r g b / a)` for shadows and borders (alpha with two decimals). */
function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const c = (v: number) => Math.round(clamp01(v) * 255);
  return `rgb(${c(r)} ${c(g)} ${c(b)} / ${f(clamp01(alpha), 3)})`;
}

// ---------------------------------------------------------------------------
// Grain
// ---------------------------------------------------------------------------

/**
 * Grain for glass as an RGBA tile: E1's Gaussian grain (`grainTile`, mono,
 * mid-grey neutral) turned into white or black dots whose alpha carries the
 * deviation, scaled by `amount` in [0, 1]. Normal alpha blending lightens and
 * darkens like a soft overlay, so CSS needs no blend mode on one background
 * layer and the SVG twin uses the same image.
 */
export function glassGrainTile(rng: Rng, amount: number, edge = GLASS_GRAIN_EDGE): RgbaBuffer {
  const tile = grainTile(rng, { size: 1, mono: true, blend: "overlay", edge });
  const a = clamp01(amount);
  const data = new Uint8ClampedArray(tile.data.length);
  for (let o = 0; o < data.length; o += 4) {
    const v = tile.data[o] as number;
    const light = v >= 128 ? 255 : 0;
    data[o] = light;
    data[o + 1] = light;
    data[o + 2] = light;
    data[o + 3] = Math.round(Math.min(255, Math.abs(v - 128) * 2 * a));
  }
  return { width: tile.width, height: tile.height, data };
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

interface Stage {
  css: string;
  /** SVG body (no root element). */
  body: string;
  /** Colours the stage shows, for the text contrast check. */
  colors: readonly string[];
}

const svgBody = (doc: string): string => doc.slice(doc.indexOf(">") + 1, doc.lastIndexOf("</svg>"));

const color = (palette: readonly string[], i: number): string =>
  (palette[i % palette.length] as string).toLowerCase();

function softBlobsStage(rng: Rng, o: GlassOptions, hard: boolean): Stage {
  const { width: w, height: h } = o;
  const p = o.backdropPalette;
  const base = color(p, 0);
  const unit = Math.min(w, h);
  const count = hard ? 5 : 4;
  const layers: string[] = [];
  const svg: string[] = [`<rect width="${f(w)}" height="${f(h)}" fill="${base}"/>`];
  const defs: string[] = [];
  const blobs = Array.from({ length: count }, (_, i) => ({
    c: color(p, 1 + (i % Math.max(1, p.length - 1))),
    x: Math.round(rng.float(0.05, 0.95) * w),
    y: Math.round(rng.float(0.05, 0.95) * h),
    r: Math.round(unit * (hard ? rng.float(0.12, 0.3) : rng.float(0.35, 0.6))),
  }));
  // CSS paints the first layer on top; SVG draws in order, so draw reversed.
  for (const b of blobs) {
    if (hard) {
      layers.push(
        `radial-gradient(circle at ${px(b.x)} ${px(b.y)}, ${b.c} ${px(b.r)}, ${b.c}00 ${px(b.r + 1)})`,
      );
    } else {
      layers.push(`radial-gradient(circle at ${px(b.x)} ${px(b.y)}, ${b.c}, ${b.c}00 ${px(b.r)})`);
    }
  }
  for (const b of [...blobs].reverse()) {
    if (hard) {
      svg.push(`<circle cx="${f(b.x)}" cy="${f(b.y)}" r="${f(b.r + 0.5)}" fill="${b.c}"/>`);
    } else {
      const inner = `gradientUnits="userSpaceOnUse" cx="${f(b.x)}" cy="${f(b.y)}" r="${f(b.r)}"><stop offset="0" stop-color="${b.c}"/><stop offset="1" stop-color="${b.c}" stop-opacity="0"/>`;
      const id = stableId("rb", inner);
      defs.push(`<radialGradient id="${id}" ${inner}</radialGradient>`);
      svg.push(`<rect width="${f(w)}" height="${f(h)}" fill="url(#${id})"/>`);
    }
  }
  return {
    css: `background-color: ${base};\nbackground-image: ${layers.join(", ")};`,
    body: (defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "") + svg.join(""),
    colors: [base, ...blobs.map((b) => b.c)],
  };
}

function gradientStage(o: GlassOptions): Stage {
  const g: CssGradientOptions = {
    type: "linear",
    colors: o.backdropPalette,
    angle: 135,
    centerX: 50,
    centerY: 50,
    shape: "ellipse",
    interpolation: "oklch",
    hue: "shorter",
    easing: "ease-in-out",
    steps: 8,
    loop: false,
    width: o.width,
    height: o.height,
  };
  const out = cssGradient(g);
  return { css: out.css, body: svgBody(out.previewSvg), colors: o.backdropPalette };
}

const STAGE_PATTERNS = { dots: "polka", grid: "grid-lines", stripes: "stripes" } as const;

function patternStage(o: GlassOptions, kind: keyof typeof STAGE_PATTERNS): Stage {
  const unit = Math.min(o.width, o.height);
  const background = color(o.backdropPalette, 0);
  const ink = color(o.backdropPalette, 1);
  const out = cssPattern({
    pattern: STAGE_PATTERNS[kind],
    color: ink,
    accent: color(o.backdropPalette, 2),
    size: Math.min(200, Math.max(16, Math.round(unit / 14))),
    angle: kind === "stripes" ? 45 : 0,
    opacity: 100,
    background,
    width: o.width,
    height: o.height,
  });
  return { css: out.css, body: svgBody(out.svg), colors: [background, ink] };
}

/** CSS declarations of the picture stage for a given URL. */
function imageStageCss(base: string, img: GlassImage, url: string): string {
  return [
    `background-color: ${base};`,
    `background-image: url("${url}");`,
    `background-size: ${img.fit};`,
    `background-position: ${img.position};`,
    "background-repeat: no-repeat;",
  ].join("\n");
}

/** Quotes and backslashes cannot occur in data URIs or our placeholders; dropped to be safe. */
const cssUrl = (url: string): string => url.replace(/["\\\n\r]/g, "");

function imageStage(o: GlassOptions, img: GlassImage): Stage {
  const base = color(o.backdropPalette, 0);
  const align = IMAGE_POSITION_ALIGN[img.position];
  const mode = img.fit === "cover" ? "slice" : "meet";
  return {
    css: imageStageCss(base, img, cssUrl(img.href)),
    body:
      `<rect width="${f(o.width)}" height="${f(o.height)}" fill="${base}"/>` +
      `<image width="${f(o.width)}" height="${f(o.height)}" preserveAspectRatio="${align} ${mode}" xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${escapeXml(img.href)}"/>`,
    // Unknown pixels: the contrast check cannot judge a picture.
    colors: [],
  };
}

function stage(rng: Rng, o: GlassOptions): Stage {
  if (o.image) return imageStage(o, o.image);
  switch (o.backdrop) {
    case "aurora":
      return softBlobsStage(rng, o, false);
    case "shapes":
      return softBlobsStage(rng, o, true);
    case "gradient":
      return gradientStage(o);
    case "dots":
    case "grid":
    case "stripes":
      return patternStage(o, o.backdrop);
  }
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface Shadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  alpha: number;
}

/** Soft three-layer drop shadow; empty at strength 0. */
function dropShadows(strength: number): Shadow[] {
  const s = clamp01(strength / 100);
  if (s <= 0) return [];
  return [
    { x: 0, y: 1, blur: 2, spread: 0, color: "#000000", alpha: 0.18 * s },
    { x: 0, y: 8, blur: 24, spread: -4, color: "#000000", alpha: 0.22 * s },
    { x: 0, y: 24, blur: 64, spread: -8, color: "#000000", alpha: 0.28 * s },
  ];
}

function glowShadows(o: GlassOptions): Shadow[] {
  const i = clamp01(o.glowIntensity / 100);
  if (i <= 0 || o.glowSize <= 0) return [];
  const s = o.glowSize;
  return [
    { x: 0, y: 0, blur: s * 0.2, spread: 0, color: o.glowColor, alpha: 0.9 * i },
    { x: 0, y: 0, blur: s * 0.6, spread: s * 0.05, color: o.glowColor, alpha: 0.6 * i },
    { x: 0, y: 0, blur: s, spread: s * 0.1, color: o.glowColor, alpha: 0.35 * i },
  ];
}

const shadowCss = (s: Shadow): string =>
  `${px(s.x)} ${px(s.y)} ${px(Math.round(s.blur * 10) / 10)} ${px(Math.round(s.spread * 10) / 10)} ${rgba(s.color, s.alpha)}`;

/** Conic border gradient options (also used for the SVG twin). */
function borderGradient(o: GlassOptions, w: number, h: number): CssGradientOptions {
  return {
    type: "conic",
    colors: o.borderPalette,
    angle: o.borderAngle,
    centerX: 50,
    centerY: 50,
    shape: "ellipse",
    interpolation: "oklch",
    hue: "shorter",
    easing: "linear",
    steps: 4,
    loop: true,
    width: w,
    height: h,
  };
}

/** `conic-gradient(...)` of the border; animated borders add the rotating custom property. */
export function borderConic(o: GlassOptions, w: number, h: number): string {
  const css = cssGradientLayers(borderGradient(o, w, h)).fallback;
  if (!o.animated) return css;
  return css.replace(
    /^conic-gradient\(from ([^ ]+deg)/,
    `conic-gradient(from calc($1 + var(${BORDER_ANGLE_PROPERTY}))`,
  );
}

/** Card declarations in the order they appear in exports. */
function cardDeclarations(o: GlassOptions, cardW: number, cardH: number): Declaration[] {
  const radius = Math.max(0, o.radius);
  const shadows = dropShadows(o.shadow).map(shadowCss);
  switch (o.effect) {
    case "glass": {
      const filter = `blur(${px(o.blur)}) saturate(${f(o.saturation, 0)}%)`;
      const d: Declaration[] = [["background-color", hexAlpha(o.tint, o.tintOpacity / 100)]];
      if (o.noise > 0 && o.grainHref) {
        d.push(["background-image", `url("${o.grainHref}")`]);
        d.push(["background-size", `${GLASS_GRAIN_EDGE}px ${GLASS_GRAIN_EDGE}px`]);
      }
      d.push(["-webkit-backdrop-filter", filter], ["backdrop-filter", filter]);
      d.push(["border-radius", px(radius)]);
      const inset = o.border > 0 ? [`inset 0 0 0 1px ${rgba("#ffffff", o.border / 100)}`] : [];
      const all = [...inset, ...shadows];
      if (all.length > 0) d.push(["box-shadow", all.join(", ")]);
      return d;
    }
    case "gradient-border": {
      const d: Declaration[] = [];
      if (o.animated) d.push([BORDER_ANGLE_PROPERTY, "0deg"]);
      d.push(
        ["border", `${px(o.borderWidth)} solid transparent`],
        ["border-radius", px(radius)],
        [
          "background",
          `linear-gradient(${o.surface}, ${o.surface}) padding-box, ${borderConic(o, cardW, cardH)} border-box`,
        ],
      );
      if (shadows.length > 0) d.push(["box-shadow", shadows.join(", ")]);
      return d;
    }
    case "glow": {
      const glow = glowShadows(o).map(shadowCss);
      const d: Declaration[] = [
        ["background-color", o.surface],
        ["border", `1px solid ${rgba(o.glowColor, 0.55)}`],
        ["border-radius", px(radius)],
      ];
      const all = [...glow, ...shadows];
      if (all.length > 0) d.push(["box-shadow", all.join(", ")]);
      return d;
    }
  }
}

function motionDeclarations(o: GlassOptions): Declaration[] {
  if (o.effect !== "gradient-border" || !o.animated) return [];
  return [["animation", `${BORDER_SPIN_KEYFRAMES} ${f(o.speed, 1)}s linear infinite`]];
}

/** `@property` registration and keyframes of the rotating border. */
export function borderRules(): string {
  return [
    `@property ${BORDER_ANGLE_PROPERTY} {`,
    '  syntax: "<angle>";',
    "  inherits: false;",
    "  initial-value: 0deg;",
    "}",
    `@keyframes ${BORDER_SPIN_KEYFRAMES} {`,
    `  to { ${BORDER_ANGLE_PROPERTY}: 360deg; }`,
    "}",
  ].join("\n");
}

/** Line box height relative to the font size. */
const TEXT_LINE_HEIGHT = 1.25;
const TITLE_LINES = 2;

/**
 * The user's title and body as one box per line, broken here so the CSS
 * preview and the SVG twin show the same lines. The title is a bit larger
 * than the bar heading; the body takes the lines that fit below it.
 */
function textBoxes(o: GlassOptions, w: number, h: number, pad: number, unit: number): CardBox[] {
  const align = o.textAlign ?? "left";
  const innerW = Math.max(0, w - 2 * pad);
  const innerH = Math.max(0, h - 2 * pad);
  const titleSize = Math.round(Math.max(10, unit * 1.5));
  const bodySize = Math.round(Math.max(8, unit * 0.9));
  const titleLh = titleSize * TEXT_LINE_HEIGHT;
  const bodyLh = bodySize * TEXT_LINE_HEIGHT;
  const titleMax = Math.min(TITLE_LINES, Math.floor(innerH / titleLh));
  const title = wrapText(o.title ?? "", innerW, titleSize, Math.max(0, titleMax));
  const gap = title.length > 0 ? bodySize * 0.6 : 0;
  const bodyMax = Math.floor((innerH - title.length * titleLh - gap) / bodyLh);
  const body = wrapText(o.body ?? "", innerW, bodySize, Math.max(0, bodyMax));
  const used = title.length * titleLh + (body.length > 0 ? gap + body.length * bodyLh : 0);
  let y = align === "center" ? pad + Math.max(0, (innerH - used) / 2) : pad;
  const boxes: CardBox[] = [];
  const push = (text: string, size: number, bold: boolean, alpha: number) => {
    const lh = size * TEXT_LINE_HEIGHT;
    boxes.push({
      x: pad,
      y,
      width: innerW,
      height: lh,
      css: [
        `color: ${hexAlpha(o.textColor, alpha)};`,
        `font-family: ${BENTO_FONT_STACK};`,
        `font-size: ${px(size)};`,
        `font-weight: ${bold ? 600 : 400};`,
        `line-height: ${px(lh)};`,
        `text-align: ${align};`,
        "white-space: pre;",
        "overflow: hidden;",
      ].join("\n"),
      text,
      line: { size, bold, align, alpha },
    });
    y += lh;
  };
  for (const line of title) push(line, titleSize, true, 1);
  if (body.length > 0) y += gap;
  for (const line of body) push(line, bodySize, false, 0.85);
  return boxes;
}

/** Whether the card shows the user's text instead of the bars. */
export function hasGlassText(o: Pick<GlassOptions, "title" | "body">): boolean {
  return normalizeText(o.title) !== "" || normalizeText(o.body) !== "";
}

/** Sample content: the user's text, or bars (a heading and three lines) in `textColor`. */
function contentBoxes(o: GlassOptions, w: number, h: number): CardBox[] {
  const pad = Math.max(8, Math.min(w, h) * 0.12);
  const unit = Math.max(4, Math.min(h * 0.08, w * 0.06, 28));
  if (hasGlassText(o)) return textBoxes(o, w, h, pad, unit);
  const innerW = Math.max(0, w - 2 * pad);
  const boxes: CardBox[] = [];
  const bar = (y: number, bw: number, bh: number, alpha: number) =>
    boxes.push({
      x: pad,
      y,
      width: bw,
      height: bh,
      css: `background-color: ${hexAlpha(o.textColor, alpha)};\nborder-radius: ${px(bh / 2)};`,
    });
  bar(pad, innerW * 0.55, unit * 1.3, 1);
  let y = pad + unit * 2.6;
  for (let i = 0; i < 3 && y + unit * 0.7 <= h - pad; i++) {
    bar(y, innerW * (i === 2 ? 0.6 : 0.95), unit * 0.7, 0.85);
    y += unit * 1.4;
  }
  return boxes;
}

// ---------------------------------------------------------------------------
// SVG twin
// ---------------------------------------------------------------------------

function roundedRect(x: number, y: number, w: number, h: number, r: number, attrs: string): string {
  const rx = Math.max(0, Math.min(r, w / 2, h / 2));
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(Math.max(0, w))}" height="${f(Math.max(0, h))}" rx="${f(rx)}" ${attrs}/>`;
}

/** Outer box shadows, masked off under the card like CSS `box-shadow`. */
function shadowSvg(
  shadows: readonly Shadow[],
  card: { x: number; y: number; w: number; h: number; r: number },
  w: number,
  h: number,
): { defs: string; body: string } {
  if (shadows.length === 0) return { defs: "", body: "" };
  const defs: string[] = [];
  const rects: string[] = [];
  for (const s of shadows) {
    const sigma = s.blur / 2;
    const x = card.x + s.x - s.spread;
    const y = card.y + s.y - s.spread;
    const sw = card.w + 2 * s.spread;
    const sh = card.h + 2 * s.spread;
    const attrs = `fill="${s.color}" fill-opacity="${f(s.alpha, 3)}"`;
    if (sigma > 0) {
      const m = sigma * 3;
      const inner = `filterUnits="userSpaceOnUse" x="${f(x - m)}" y="${f(y - m)}" width="${f(sw + 2 * m)}" height="${f(sh + 2 * m)}"><feGaussianBlur stdDeviation="${f(sigma)}"/>`;
      const id = stableId("sh", inner);
      defs.push(`<filter id="${id}" ${inner}</filter>`);
      rects.push(roundedRect(x, y, sw, sh, card.r + s.spread, `${attrs} filter="url(#${id})"`));
    } else {
      rects.push(roundedRect(x, y, sw, sh, card.r + s.spread, attrs));
    }
  }
  const maskInner = `maskUnits="userSpaceOnUse" x="0" y="0" width="${f(w)}" height="${f(h)}"><rect width="${f(w)}" height="${f(h)}" fill="#fff"/>${roundedRect(card.x, card.y, card.w, card.h, card.r, 'fill="#000"')}`;
  const maskId = stableId("m", maskInner);
  defs.push(`<mask id="${maskId}" ${maskInner}</mask>`);
  return { defs: defs.join(""), body: `<g mask="url(#${maskId})">${rects.join("")}</g>` };
}

function sceneSvg(
  o: GlassOptions,
  st: Stage,
  card: { x: number; y: number; w: number; h: number; r: number },
  content: readonly CardBox[],
): string {
  const { width: w, height: h } = o;
  // The stage is drawn twice for glass (as is and blurred): define it once.
  const stageId = stableId("st", st.body);
  const defs: string[] = o.effect === "glass" ? [`<g id="${stageId}">${st.body}</g>`] : [];
  const stageUse = `<use href="#${stageId}"/>`;
  const body: string[] = [o.effect === "glass" ? stageUse : st.body];
  const shadows =
    o.effect === "glow" ? [...glowShadows(o), ...dropShadows(o.shadow)] : dropShadows(o.shadow);
  const sh = shadowSvg(shadows, card, w, h);
  defs.push(sh.defs);
  body.push(sh.body);

  const clipInner = `>${roundedRect(card.x, card.y, card.w, card.h, card.r, "")}`;
  const clipId = stableId("c", clipInner);
  defs.push(`<clipPath id="${clipId}"${clipInner}</clipPath>`);

  if (o.effect === "glass") {
    const sigma = Math.max(0, o.blur);
    const m = sigma * 3;
    const filterInner = `filterUnits="userSpaceOnUse" x="${f(card.x - m)}" y="${f(card.y - m)}" width="${f(card.w + 2 * m)}" height="${f(card.h + 2 * m)}" color-interpolation-filters="sRGB">${sigma > 0 ? `<feGaussianBlur stdDeviation="${f(sigma)}" edgeMode="duplicate"/>` : ""}<feColorMatrix type="saturate" values="${f(o.saturation / 100, 3)}"/>`;
    const filterId = stableId("gf", filterInner);
    defs.push(`<filter id="${filterId}" ${filterInner}</filter>`);
    body.push(`<g clip-path="url(#${clipId})"><g filter="url(#${filterId})">${stageUse}</g>`);
    body.push(
      `<rect x="${f(card.x)}" y="${f(card.y)}" width="${f(card.w)}" height="${f(card.h)}" fill="${o.tint}" fill-opacity="${f(clamp01(o.tintOpacity / 100), 3)}"/>`,
    );
    if (o.noise > 0 && o.grainHref) {
      const t = f(GLASS_GRAIN_EDGE);
      // Patterns tile from the card's corner, like a CSS background.
      const pattern = `width="${t}" height="${t}" x="${f(card.x)}" y="${f(card.y)}" patternUnits="userSpaceOnUse"><image width="${t}" height="${t}" style="image-rendering:pixelated" xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${o.grainHref}"/>`;
      const pid = stableId("gp", pattern.slice(0, 160) + o.grainHref.slice(-64));
      defs.push(`<pattern id="${pid}" ${pattern}</pattern>`);
      body.push(
        `<rect x="${f(card.x)}" y="${f(card.y)}" width="${f(card.w)}" height="${f(card.h)}" fill="url(#${pid})"/>`,
      );
    }
    body.push("</g>");
    if (o.border > 0) {
      body.push(
        roundedRect(
          card.x + 0.5,
          card.y + 0.5,
          card.w - 1,
          card.h - 1,
          card.r - 0.5,
          `fill="none" stroke="#fff" stroke-opacity="${f(clamp01(o.border / 100), 3)}"`,
        ),
      );
    }
  } else if (o.effect === "gradient-border") {
    const bw = Math.min(o.borderWidth, card.w / 2, card.h / 2);
    const conic = svgBody(cssGradient(borderGradient(o, card.w, card.h)).previewSvg);
    body.push(
      `<g clip-path="url(#${clipId})"><g transform="translate(${f(card.x)} ${f(card.y)})">${conic}</g></g>`,
    );
    // CSS padding-box: the inner radius shrinks by the border width.
    body.push(
      roundedRect(
        card.x + bw,
        card.y + bw,
        card.w - 2 * bw,
        card.h - 2 * bw,
        Math.max(0, card.r - bw),
        `fill="${o.surface}"`,
      ),
    );
  } else {
    body.push(roundedRect(card.x, card.y, card.w, card.h, card.r, `fill="${o.surface}"`));
    body.push(
      roundedRect(
        card.x + 0.5,
        card.y + 0.5,
        card.w - 1,
        card.h - 1,
        card.r - 0.5,
        `fill="none" stroke="${o.glowColor}" stroke-opacity="0.55"`,
      ),
    );
  }

  const ink = content
    .map((b) => {
      if (b.text !== undefined && b.line) {
        const l = b.line;
        // Baseline: glyphs sit about 0.95 em below the top of the half-leading.
        const base = card.y + b.y + l.size * ((TEXT_LINE_HEIGHT - 1) / 2 + 0.95);
        const x = card.x + b.x + (l.align === "center" ? b.width / 2 : 0);
        const anchor = l.align === "center" ? ' text-anchor="middle"' : "";
        const weight = l.bold ? ' font-weight="600"' : "";
        const opacity = l.alpha < 1 ? ` fill-opacity="${f(l.alpha, 3)}"` : "";
        return `<text x="${f(x)}" y="${f(base)}" font-size="${f(l.size)}"${weight}${anchor}${opacity} xml:space="preserve">${escapeXml(b.text)}</text>`;
      }
      const alpha = /#[0-9a-f]{6}([0-9a-f]{2})/i.exec(b.css)?.[1];
      const opacity = alpha ? ` fill-opacity="${f(parseInt(alpha, 16) / 255, 3)}"` : "";
      return roundedRect(
        card.x + b.x,
        card.y + b.y,
        b.width,
        b.height,
        b.height / 2,
        `fill="${o.textColor}"${opacity}`,
      );
    })
    .join("");
  const hasText = content.some((b) => b.text !== undefined);
  // Text is clipped to the card like the preview's `overflow: hidden` lines.
  body.push(
    hasText
      ? `<g clip-path="url(#${clipId})" font-family="${BENTO_FONT_STACK}" fill="${o.textColor}">${ink}</g>`
      : ink,
  );
  const d = defs.join("");
  return svgDocument(w, h, `${d ? `<defs>${d}</defs>` : ""}${body.join("")}`);
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Card rectangle in px, centred on the canvas. */
export function cardRect(o: Pick<GlassOptions, "width" | "height" | "cardWidth" | "cardHeight">) {
  const w = Math.round((o.width * Math.min(100, Math.max(1, o.cardWidth))) / 100);
  const h = Math.round((o.height * Math.min(100, Math.max(1, o.cardHeight))) / 100);
  return { x: Math.round((o.width - w) / 2), y: Math.round((o.height - h) / 2), w, h };
}

/** The whole scene: stage, card and the SVG twin. Pure; stage shapes come from `rng`. */
export function glassEffect(rng: Rng, o: GlassOptions): GlassResult {
  const st = stage(rng, o);
  const c = cardRect(o);
  const r = Math.min(o.radius, c.w / 2, c.h / 2);
  const content = contentBoxes(o, c.w, c.h);
  const base = color(o.backdropPalette, 0);
  return {
    stageCss: st.css,
    stageCodeCss: o.image ? imageStageCss(base, o.image, cssUrl(o.image.codeUrl)) : st.css,
    card: {
      x: c.x,
      y: c.y,
      width: c.w,
      height: c.h,
      declarations: cardDeclarations(o, c.w, c.h),
      motion: motionDeclarations(o),
      content,
    },
    rules: o.effect === "gradient-border" && o.animated ? borderRules() : "",
    svg: sceneSvg(o, st, { ...c, r }, content),
  };
}

/** Colours the stage shows (for contrast checks), without building the scene. */
export function glassStageColors(rng: Rng, o: GlassOptions): readonly string[] {
  return stage(rng, o).colors;
}

/**
 * Lowest WCAG contrast of the sample text: on glass against the tint over
 * each stage colour (alpha compositing in sRGB, saturation and grain left
 * out), on the border and glow cards against the surface.
 */
export function glassTextContrast(o: GlassOptions, stageColors: readonly string[]): number {
  if (o.effect !== "glass") return contrastRatio(o.textColor, o.surface);
  const a = clamp01(o.tintOpacity / 100);
  let min = Infinity;
  for (const c of stageColors) {
    min = Math.min(min, contrastRatio(o.textColor, mixHex(c, o.tint, a, "srgb")));
  }
  return min;
}

// ---------------------------------------------------------------------------
// Code
// ---------------------------------------------------------------------------

/** Class name used in the code exports per effect. */
export const GLASS_CLASS_NAMES: Readonly<Record<GlassEffect, string>> = {
  glass: "glass-card",
  "gradient-border": "gradient-border",
  glow: "glow-card",
};

const block = (selector: string, decls: readonly Declaration[], indent = ""): string =>
  [`${indent}${selector} {`, ...decls.map(([p, v]) => `${indent}  ${p}: ${v};`), `${indent}}`].join(
    "\n",
  );

/**
 * The card as a stylesheet: the class with every declaration, and for the
 * animated border the `@property` and `@keyframes` rules plus a reduced
 * motion rule. Browsers without `@property` keep a static border: the
 * unregistered angle cannot interpolate, and it only flips between 0deg and
 * 360deg, which look the same.
 */
export function glassCss(result: GlassResult, effect: GlassEffect, textColor: string): string {
  const cls = `.${GLASS_CLASS_NAMES[effect]}`;
  const parts: string[] = [];
  if (result.rules) parts.push(result.rules);
  parts.push(
    block(cls, [...result.card.declarations, ["color", textColor], ...result.card.motion]),
  );
  if (result.card.motion.length > 0) {
    parts.push(
      [
        "@media (prefers-reduced-motion: reduce) {",
        block(cls, [["animation", "none"]], "  "),
        "}",
      ].join("\n"),
    );
  }
  return `${parts.join("\n\n")}\n`;
}

/** Tailwind value: spaces to underscores, existing underscores escaped. */
const tw = (value: string): string =>
  value
    .trim()
    .replace(/url\("([^"]*)"\)/g, "url($1)")
    .replace(/_/g, "\\_")
    .replace(/\s+/g, "_");

/**
 * Tailwind classes (v3 and v4, arbitrary values). `backdrop-blur-*` and
 * `backdrop-saturate-*` emit the `-webkit-` prefix themselves. The rotating
 * border needs the rules of the CSS export, noted in a comment.
 */
export function glassTailwind(result: GlassResult, o: GlassOptions): string {
  const classes: string[] = [];
  const notes: string[] = [];
  for (const [p, v] of result.card.declarations) {
    switch (p) {
      case "background-color":
        classes.push(`bg-[${v}]`);
        break;
      case "-webkit-backdrop-filter":
        break;
      case "backdrop-filter":
        classes.push(
          `backdrop-blur-[${px(o.blur)}]`,
          `backdrop-saturate-[${f(o.saturation / 100, 2)}]`,
        );
        break;
      case "border-radius":
        classes.push(`rounded-[${v}]`);
        break;
      case "box-shadow":
        classes.push(`shadow-[${tw(v)}]`);
        break;
      default:
        classes.push(`[${p}:${tw(v)}]`);
    }
  }
  classes.push(`text-[${o.textColor}]`);
  for (const [p, v] of result.card.motion) {
    classes.push(`[${p}:${tw(v)}]`, `motion-reduce:[${p}:none]`);
    notes.push(
      "<!-- Add the @property and @keyframes rules from the CSS export to your stylesheet. -->",
    );
  }
  if (o.textAlign === "center") classes.push("text-center");
  const inner = hasGlassText(o) ? cardMarkup(o, "  ").join("\n") : "  …";
  return `${notes.join("\n")}${notes.length > 0 ? "\n" : ""}<div class="${classes.join(" ")}">\n${inner}\n</div>\n`;
}

/**
 * The card's text as HTML lines: the user's title and body (escaped), or a
 * sample heading and paragraph when both are empty.
 */
function cardMarkup(o: Pick<GlassOptions, "title" | "body">, indent: string): string[] {
  if (!hasGlassText(o)) {
    return [
      `${indent}<h2>Card title</h2>`,
      `${indent}<p>Some text on the card, to check that it stays readable.</p>`,
    ];
  }
  const out: string[] = [];
  const title = normalizeText(o.title);
  const body = normalizeText(o.body);
  if (title) out.push(`${indent}<h2>${escapeXml(title)}</h2>`);
  if (body) out.push(`${indent}<p>${escapeXml(body)}</p>`);
  return out;
}

/**
 * A standalone HTML example: the stage with the card on it and real text,
 * so the effect can be tried in any browser.
 */
export function glassHtml(result: GlassResult, o: GlassOptions): string {
  const cls = GLASS_CLASS_NAMES[o.effect];
  const stageDecls: Declaration[] = result.stageCodeCss
    .split("\n")
    .map((line) => line.trim().replace(/;$/, ""))
    .filter((line) => line.length > 0)
    .map((line) => {
      const i = line.indexOf(":");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()] as const;
    });
  const stageRule = block(".stage", [
    ...stageDecls,
    ["display", "grid"],
    ["place-items", "center"],
    ["min-height", "100vh"],
    ["margin", "0"],
    ["font-family", "system-ui, sans-serif"],
  ]);
  const card = glassCss(result, o.effect, o.textColor).trimEnd();
  const size = block(`.${cls}`, [
    ["box-sizing", "border-box"],
    ["width", `min(${px(result.card.width)}, 90vw)`],
    ["padding", "2rem"],
    ...(o.textAlign === "center" ? ([["text-align", "center"]] as const) : []),
  ]);
  const picture = o.image;
  const note =
    picture && picture.codeUrl !== picture.href
      ? `/* Replace ${cssUrl(picture.codeUrl)} with the path to your own picture. */\n`
      : "";
  return [
    "<style>",
    `${note}${stageRule}`,
    "",
    card,
    "",
    size,
    "</style>",
    '<div class="stage">',
    `  <div class="${cls}">`,
    ...cardMarkup(o, "    "),
    "  </div>",
    "</div>",
    "",
  ].join("\n");
}
