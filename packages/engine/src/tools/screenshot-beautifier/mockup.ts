/**
 * Website mockups for the screenshot beautifier (docs/TOOLS.md K6, M4b-AP07):
 * self-drawn generic devices (desktop monitor, laptop, tablet, phone) with
 * the user's screenshots on their screens, alone or as a "responsive set"
 * of two to four overlapping devices.
 *
 * Clean-room: every device is a handful of rounded rectangles in neutral
 * colours (no logos, no product silhouettes, no artwork of any maker). Pure
 * and DOM-free like the rest of the engine; all coordinates are canvas px.
 *
 * Besides the finished SVG, `mockupScene` returns the same picture as
 * layers (vector parts and pictures in paint order) so a preview can show
 * multi-megabyte screenshots as layers of their own, and the screen areas
 * of every device (for the live view of a website inside the frame).
 */
import { formatNumber } from "../../curves";
import { stableId, svgDocument } from "../../svg";
import { shadowLayers } from "../css-shadow";
import {
  SCREENSHOT_PADDING_MAX,
  SCREENSHOT_THEME_COLORS,
  attributeHref,
  barMarkup,
  roundedRectPath,
  type ScreenshotAlign,
  type ScreenshotFrame,
  type ScreenshotImage,
  type ScreenshotRect,
  type ScreenshotTheme,
} from "./index";

export const MOCKUP_DEVICES = ["desktop", "laptop", "tablet", "phone"] as const;
export type MockupDevice = (typeof MOCKUP_DEVICES)[number];

export const MOCKUP_ARRANGEMENTS = ["cascade", "row", "focus"] as const;
export type MockupArrangement = (typeof MOCKUP_ARRANGEMENTS)[number];

export const MOCKUP_FINISHES = ["silver", "graphite", "white"] as const;
export type MockupFinish = (typeof MOCKUP_FINISHES)[number];

export const MOCKUP_CAMERAS = ["island", "notch", "none"] as const;
export type MockupCamera = (typeof MOCKUP_CAMERAS)[number];

/** CSS viewport width each device stands for (placeholder layout, live view). */
export const MOCKUP_VIEWPORT_WIDTH: Readonly<Record<MockupDevice, number>> = {
  desktop: 1920,
  laptop: 1440,
  tablet: 820,
  phone: 390,
};

/** Desktop and laptop show the browser or window bar; tablet and phone show the page alone. */
export const MOCKUP_BAR_DEVICES: ReadonlySet<MockupDevice> = new Set(["desktop", "laptop"]);

/** Bar height as a share of the screen width (thinner than on the plain window). */
const MOCKUP_BAR_RATIO: Readonly<Record<ScreenshotFrame, number>> = {
  none: 0,
  window: 0.03,
  browser: 0.042,
};

interface DeviceModel {
  /** Bounding box in model units (the device's own drawing). */
  readonly width: number;
  readonly height: number;
  /** The screen in model units. */
  readonly screen: ScreenshotRect;
  readonly screenRadius: number;
  /** Size relative to the desktop in a responsive set. */
  readonly setScale: number;
}

/** Proportions of the self-drawn devices (units: the desktop is 1000 wide). */
export const MOCKUP_MODELS: Readonly<Record<MockupDevice, DeviceModel>> = {
  desktop: {
    width: 1000,
    height: 772,
    screen: { x: 18, y: 18, width: 964, height: 542.25 },
    screenRadius: 4,
    setScale: 1,
  },
  laptop: {
    width: 960,
    height: 572,
    screen: { x: 96, y: 30, width: 768, height: 480 },
    screenRadius: 8,
    setScale: 0.8,
  },
  tablet: {
    width: 560,
    height: 728,
    screen: { x: 28, y: 28, width: 504, height: 672 },
    screenRadius: 22,
    setScale: 0.55,
  },
  phone: {
    width: 308,
    height: 620,
    screen: { x: 16, y: 12, width: 276, height: 596 },
    screenRadius: 42,
    setScale: 0.45,
  },
};

/** Anchor of a device in a responsive set: bottom centre in set units, paint order. */
interface Anchor {
  readonly cx: number;
  readonly bottom: number;
  readonly z: number;
}

const ARRANGEMENT_ANCHORS: Readonly<
  Record<Exclude<MockupArrangement, "row">, Readonly<Record<MockupDevice, Anchor>>>
> = {
  // Desktop at the back, laptop front left, tablet right, phone in front between them.
  cascade: {
    desktop: { cx: 0, bottom: 0, z: 0 },
    laptop: { cx: -330, bottom: 70, z: 1 },
    tablet: { cx: 430, bottom: 40, z: 2 },
    phone: { cx: 250, bottom: 90, z: 3 },
  },
  // Desktop centred, laptop centred in front, tablet and phone at the sides.
  focus: {
    desktop: { cx: 0, bottom: 0, z: 0 },
    laptop: { cx: 0, bottom: 110, z: 1 },
    tablet: { cx: 520, bottom: 70, z: 2 },
    phone: { cx: -500, bottom: 90, z: 3 },
  },
};

/** Share of the narrower device by which neighbours overlap at least (cascade, focus). */
const MIN_OVERLAP = 0.14;
/** Overlap of neighbours in a row. */
const ROW_OVERLAP = 0.06;

export interface MockupLayoutOptions {
  readonly width: number;
  readonly height: number;
  /** Padding in percent of the shorter canvas edge. */
  readonly padding: number;
  readonly align: ScreenshotAlign;
  /** One device, or two to four for a responsive set (order irrelevant, duplicates ignored). */
  readonly devices: readonly MockupDevice[];
  readonly arrangement: MockupArrangement;
}

/** A device on the canvas: top left corner of its model box and px per model unit. */
export interface MockupPlacement {
  readonly device: MockupDevice;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

interface SetBox {
  device: MockupDevice;
  left: number;
  top: number;
  width: number;
  height: number;
  z: number;
}

/**
 * Places the devices on the canvas, back to front (paint order). A single
 * device is fitted as large as the padding allows; a set keeps the relative
 * sizes of `MOCKUP_MODELS`, follows the arrangement and pulls apart
 * neighbours together until they overlap, so any subset stays one group.
 * Pure geometry, unit-tested.
 */
export function mockupLayout(o: MockupLayoutOptions): MockupPlacement[] {
  const devices = MOCKUP_DEVICES.filter((d) => o.devices.includes(d));
  if (devices.length === 0) return [];
  const single = devices.length === 1;
  const boxes: SetBox[] = devices.map((device, i) => {
    const m = MOCKUP_MODELS[device];
    const k = single ? 1 : m.setScale;
    const width = m.width * k;
    const height = m.height * k;
    if (single || o.arrangement === "row") {
      return { device, left: 0, top: -height, width, height, z: i };
    }
    const a = ARRANGEMENT_ANCHORS[o.arrangement][device];
    return { device, left: a.cx - width / 2, top: a.bottom - height, width, height, z: a.z };
  });

  if (!single && o.arrangement === "row") {
    let right = 0;
    boxes.forEach((b, i) => {
      const prev = boxes[i - 1];
      b.left = prev ? right - ROW_OVERLAP * Math.min(prev.width, b.width) : 0;
      right = b.left + b.width;
    });
  } else if (!single) {
    // Close gaps left by devices missing from the full set.
    const sorted = [...boxes].sort((a, b) => a.left - b.left);
    let maxRight = sorted[0] ? sorted[0].left + sorted[0].width : 0;
    for (let i = 1; i < sorted.length; i++) {
      const b = sorted[i] as SetBox;
      const prev = sorted[i - 1] as SetBox;
      const limit = maxRight - MIN_OVERLAP * Math.min(prev.width, b.width);
      if (b.left > limit) {
        const delta = b.left - limit;
        for (let j = i; j < sorted.length; j++) (sorted[j] as SetBox).left -= delta;
      }
      maxRight = Math.max(maxRight, b.left + b.width);
    }
  }

  const minX = Math.min(...boxes.map((b) => b.left));
  const minY = Math.min(...boxes.map((b) => b.top));
  const bw = Math.max(...boxes.map((b) => b.left + b.width)) - minX;
  const bh = Math.max(...boxes.map((b) => b.top + b.height)) - minY;

  const W = Math.max(1, o.width);
  const H = Math.max(1, o.height);
  const pad = (clamp(finite(o.padding, 0), 0, SCREENSHOT_PADDING_MAX) / 100) * Math.min(W, H);
  const availW = Math.max(1, W - 2 * pad);
  const availH = Math.max(1, H - 2 * pad);
  const s = Math.min(availW / bw, availH / bh);
  const gw = bw * s;
  const gh = bh * s;
  const ox =
    o.align === "left" ? pad : o.align === "right" ? W - pad - gw : pad + (availW - gw) / 2;
  const oy =
    o.align === "top" ? pad : o.align === "bottom" ? H - pad - gh : pad + (availH - gh) / 2;

  return [...boxes]
    .sort((a, b) => a.z - b.z)
    .map((b) => ({
      device: b.device,
      x: ox + (b.left - minX) * s,
      y: oy + (b.top - minY) * s,
      scale: (s * b.width) / MOCKUP_MODELS[b.device].width,
    }));
}

/**
 * Where a picture goes on a screen: scaled to cover it, centred
 * horizontally and aligned to the top ("above the fold"). A tall full-page
 * screenshot fills the width and shows its top; a wide one on a phone shows
 * its middle part. Pure, unit-tested.
 */
export function mockupCrop(
  imageWidth: number,
  imageHeight: number,
  screen: ScreenshotRect,
): ScreenshotRect {
  const iw = imageWidth > 0 ? imageWidth : 1;
  const ih = imageHeight > 0 ? imageHeight : 1;
  const k = Math.max(screen.width / iw, screen.height / ih);
  const width = iw * k;
  const height = ih * k;
  return { x: screen.x + (screen.width - width) / 2, y: screen.y, width, height };
}

/**
 * The address as a browser shows it: no scheme, no lone trailing slash,
 * no control characters, single spaces. Display text only; nothing is
 * fetched or linked.
 */
export function mockupDisplayUrl(url: string): string {
  return url
    .replace(/\p{Cc}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^([^/?#]+)\/$/, "$1");
}

/** Colours of a device finish. */
export interface MockupFinishColors {
  readonly body: string;
  readonly edge: string;
  readonly light: string;
  readonly dark: string;
  readonly bezel: string;
  readonly camera: string;
}

export const MOCKUP_FINISH_COLORS: Readonly<Record<MockupFinish, MockupFinishColors>> = {
  silver: {
    body: "#d5d8dd",
    edge: "#aeb3bb",
    light: "#f1f3f5",
    dark: "#9ea4ad",
    bezel: "#0c0d10",
    camera: "#262a33",
  },
  graphite: {
    body: "#3b3e45",
    edge: "#24262b",
    light: "#5b5f68",
    dark: "#25272c",
    bezel: "#08090b",
    camera: "#22252c",
  },
  white: {
    body: "#f3f4f6",
    edge: "#d3d7dd",
    light: "#ffffff",
    dark: "#c6cbd2",
    // A dark front keeps light pages and the camera visible on a white device.
    bezel: "#0e0f12",
    camera: "#262a33",
  },
};

const f = (v: number): string => formatNumber(v, 2);

/** Second colour of the placeholder's hero gradient. */
const PLACEHOLDER_HERO_END = "#ec4899";

// ---------------------------------------------------------------------------
// Placeholder website
// ---------------------------------------------------------------------------

/**
 * Self-drawn stand-in website (navigation, hero, logo row, feature cards;
 * no text) for a viewport of `width` × `height` CSS px, as the inner markup
 * of an `<svg viewBox>`. The layout responds to the width like a real page:
 * three columns on desktops, two on tablets, one with a menu button on
 * phones. Shown until the user adds a screenshot. `heroFill` paints the
 * hero picture (a colour or a `url(#gradient)` defined by the caller).
 */
export function placeholderWebsite(
  width: number,
  height: number,
  theme: ScreenshotTheme,
  accent: string,
  heroFill: string = accent,
): string {
  const c = SCREENSHOT_THEME_COLORS[theme];
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const wide = W >= 1200;
  const phone = W < 700;
  const cols = wide ? 3 : phone ? 1 : 2;
  const gutter = wide ? Math.round(W * 0.08) : phone ? 20 : 40;
  const inner = W - 2 * gutter;
  const parts: string[] = [];
  const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0, extra = "") =>
    parts.push(
      `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${f(rx)}"` : ""} fill="${fill}"${extra}/>`,
    );
  rect(0, 0, W, H, c.page);

  // Navigation.
  const navH = phone ? 60 : 76;
  rect(0, 0, W, navH, c.card);
  rect(0, navH - 1, W, 1, c.muted);
  parts.push(`<circle cx="${f(gutter + 14)}" cy="${f(navH / 2)}" r="14" fill="${accent}"/>`);
  rect(gutter + 38, navH / 2 - 8, phone ? 70 : 96, 16, c.ink, 8);
  if (phone) {
    for (let i = 0; i < 3; i++) rect(W - gutter - 26, navH / 2 - 9 + i * 8, 26, 3, c.ink, 1.5);
  } else {
    const links = wide ? 4 : 2;
    const btnW = 120;
    rect(W - gutter - btnW, navH / 2 - 20, btnW, 40, accent, 20);
    for (let i = 0; i < links; i++) {
      rect(W - gutter - btnW - 40 - (links - i) * 96, navH / 2 - 6, 64, 12, c.muted, 6);
    }
  }

  // Hero: text beside the picture on desktops, above it elsewhere.
  let y = navH + (phone ? 36 : 72);
  const textW = wide ? inner * 0.46 : inner;
  const lineH = phone ? 30 : wide ? 52 : 44;
  rect(gutter, y, 110, 22, accent, 11, ' fill-opacity="0.18"');
  y += 44;
  rect(gutter, y, textW * 0.94, lineH, c.ink, 10);
  rect(gutter, y + lineH * 1.35, textW * 0.7, lineH, c.ink, 10);
  let ty = y + lineH * 2.7 + 8;
  for (let i = 0; i < 3; i++) rect(gutter, ty + i * 26, textW * (0.92 - i * 0.14), 12, c.muted, 6);
  ty += 3 * 26 + 24;
  rect(gutter, ty, phone ? 140 : 168, phone ? 44 : 52, accent, phone ? 22 : 26);
  rect(
    gutter + (phone ? 156 : 188),
    ty,
    phone ? 120 : 148,
    phone ? 44 : 52,
    c.card,
    phone ? 22 : 26,
    ` stroke="${c.muted}" stroke-width="2"`,
  );
  const textBottom = ty + (phone ? 44 : 52);
  let heroX = gutter;
  let heroY = textBottom + 40;
  let heroW = inner;
  let heroH = phone ? inner * 0.75 : inner * 0.5;
  if (wide) {
    heroX = gutter + inner * 0.54;
    heroY = navH + 72;
    heroW = inner * 0.46;
    heroH = Math.max(textBottom - heroY, heroW * 0.72);
  }
  rect(heroX, heroY, heroW, heroH, heroFill, phone ? 18 : 24);
  // A small dashboard card floating on the picture.
  const cw = heroW * 0.56;
  const ch = heroH * 0.46;
  const cx = heroX + heroW * 0.1;
  const cy = heroY + heroH * 0.3;
  rect(cx, cy, cw, ch, c.card, 14, ' fill-opacity="0.92"');
  for (let i = 0; i < 4; i++) {
    const bh = ch * (0.2 + ((i * 37) % 50) / 100);
    rect(cx + cw * (0.12 + i * 0.2), cy + ch * 0.85 - bh, cw * 0.12, bh, accent, 4);
  }
  parts.push(
    `<circle cx="${f(heroX + heroW * 0.8)}" cy="${f(heroY + heroH * 0.24)}" r="${f(heroW * 0.09)}" fill="#ffffff" fill-opacity="0.35"/>`,
  );
  y = Math.max(textBottom, heroY + heroH) + (phone ? 44 : 72);

  // Logo row.
  const logos = wide ? 6 : phone ? 3 : 4;
  const logoW = (inner - (logos - 1) * 24) / logos;
  for (let i = 0; i < logos; i++) {
    rect(gutter + i * (logoW + 24) + logoW * 0.15, y, logoW * 0.7, 18, c.muted, 9);
  }
  y += phone ? 58 : 82;

  // Feature cards until the viewport is full (at most eight rows).
  const gap = phone ? 16 : 24;
  const cardW = (inner - (cols - 1) * gap) / cols;
  const cardH = phone ? 168 : 220;
  for (let row = 0; row < 8 && y < H; row++) {
    for (let col = 0; col < cols; col++) {
      const x = gutter + col * (cardW + gap);
      rect(x, y, cardW, cardH, c.card, 18);
      rect(x + 24, y + 24, 44, 44, accent, 12, ' fill-opacity="0.2"');
      rect(x + 24, y + 92, cardW * 0.5, 16, c.ink, 8);
      rect(x + 24, y + 124, cardW * 0.78, 10, c.muted, 5);
      rect(x + 24, y + 144, cardW * 0.62, 10, c.muted, 5);
    }
    y += cardH + gap;
  }
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/** Maps model units of a placement to canvas px. */
interface Mapper {
  x(u: number): number;
  y(u: number): number;
  l(u: number): number;
  rect(x: number, y: number, w: number, h: number): ScreenshotRect;
}

function mapper(p: MockupPlacement): Mapper {
  return {
    x: (u) => p.x + p.scale * u,
    y: (u) => p.y + p.scale * u,
    l: (u) => p.scale * u,
    rect: (x, y, w, h) => ({
      x: p.x + p.scale * x,
      y: p.y + p.scale * y,
      width: p.scale * w,
      height: p.scale * h,
    }),
  };
}

/** Rounded rectangle in model units as px path data. */
const rrPath = (m: Mapper, x: number, y: number, w: number, h: number, r: number): string =>
  roundedRectPath(m.rect(x, y, w, h), m.l(r));

/** Outline of a device (shadow, and what covers devices behind it). Px path data. */
export function mockupSilhouette(p: MockupPlacement): string {
  const m = mapper(p);
  switch (p.device) {
    case "desktop":
      return (
        rrPath(m, 0, 0, 1000, 620, 22) +
        polygonPath(m, [
          [440, 610],
          [560, 610],
          [572, 756],
          [428, 756],
        ]) +
        rrPath(m, 320, 750, 360, 22, 10)
      );
    case "laptop":
      return rrPath(m, 70, 0, 820, 556, 28) + rrPath(m, 0, 550, 960, 22, 8);
    case "tablet":
      return rrPath(m, 0, 0, 560, 728, 48);
    case "phone":
      return rrPath(m, 4, 0, 300, 620, 54);
  }
}

function polygonPath(m: Mapper, pts: readonly (readonly [number, number])[]): string {
  return `${pts.map(([x, y], i) => `${i ? "L" : "M"}${f(m.x(x))} ${f(m.y(y))}`).join("")}Z`;
}

/** Defs collected while drawing, deduplicated by content. */
class Defs {
  private readonly ids = new Set<string>();
  private markup = "";
  add(prefix: string, def: string, tag: string): string {
    const id = stableId(prefix, def);
    if (!this.ids.has(id)) {
      this.ids.add(id);
      this.markup += def.replace(`<${tag}`, `<${tag} id="${id}"`);
    }
    return id;
  }
  toString(): string {
    return this.markup;
  }
}

/** Largest Gaussian deviation at an 8K export (as `SHADOW_SIGMA_AT_8K` in index.ts). */
const SIGMA_AT_8K = 200;
const OUTPUT_EDGE_MAX = 8192;

function blurFilter(defs: Defs, sigma: number, W: number, H: number): string {
  const pad = 3 * sigma;
  return defs.add(
    "ms",
    `<filter x="${f(-pad)}" y="${f(-pad)}" width="${f(W + 2 * pad)}" height="${f(H + 2 * pad)}" ` +
      `filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="${f(sigma)}"/></filter>`,
    "filter",
  );
}

/** Soft layered shadow under a device plus a contact shadow under standing devices. */
function deviceShadow(
  defs: Defs,
  p: MockupPlacement,
  strength: number,
  color: string,
  W: number,
  H: number,
): string {
  const s = clamp(finite(strength, 0), 0, 1);
  if (s === 0) return "";
  const m = MOCKUP_MODELS[p.device];
  const e = Math.min(m.width, m.height) * p.scale;
  const sigmaMax = (SIGMA_AT_8K * Math.max(W, H)) / OUTPUT_EDGE_MAX;
  const layers = shadowLayers({
    layers: 4,
    distance: s * 0.05 * e,
    blur: Math.min(s * 0.14 * e, 2 * sigmaMax),
    spread: 0,
    angle: 0,
    opacity: 0.18 + 0.5 * s,
    easing: "ease-out",
  });
  const shape = mockupSilhouette(p);
  let out = "";
  for (const l of [...layers].reverse()) {
    const filter = l.blur > 0 ? ` filter="url(#${blurFilter(defs, l.blur / 2, W, H)})"` : "";
    out +=
      `<path d="${shape}" transform="translate(${f(l.x)} ${f(l.y)})" fill="${color}" ` +
      `fill-opacity="${formatNumber(l.alpha, 3)}"${filter}/>`;
  }
  if (p.device === "desktop" || p.device === "laptop") {
    const width = m.width * p.scale;
    const sigma = Math.min(width * 0.012, sigmaMax);
    const filter = sigma > 0 ? ` filter="url(#${blurFilter(defs, sigma, W, H)})"` : "";
    out +=
      `<ellipse cx="${f(p.x + width / 2)}" cy="${f(p.y + m.height * p.scale)}" rx="${f(width * 0.46)}" ` +
      `ry="${f(width * 0.018)}" fill="${color}" fill-opacity="${formatNumber(0.3 * s, 3)}"${filter}/>`;
  }
  return out;
}

/** Linear gradient across (horizontal) or down (vertical) a shape, by colour stops. */
function gradient(defs: Defs, vertical: boolean, stops: readonly string[]): string {
  const n = stops.length - 1;
  const def =
    `<linearGradient x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">` +
    stops.map((c, i) => `<stop offset="${f(i / n)}" stop-color="${c}"/>`).join("") +
    "</linearGradient>";
  return `url(#${defs.add("mg", def, "linearGradient")})`;
}

/** The device body: everything but the screen content. */
function deviceBody(defs: Defs, p: MockupPlacement, c: MockupFinishColors): string {
  const m = mapper(p);
  const path = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}"${extra}/>`;
  const rr = (x: number, y: number, w: number, h: number, r: number, fill: string, extra = "") =>
    path(rrPath(m, x, y, w, h, r), fill, extra);
  const edge = ` stroke="${c.edge}" stroke-width="${f(Math.max(0.5, m.l(2)))}"`;
  const dot = (cx: number, cy: number, r: number) =>
    `<circle cx="${f(m.x(cx))}" cy="${f(m.y(cy))}" r="${f(m.l(r))}" fill="${c.camera}"/>`;
  switch (p.device) {
    case "desktop":
      return (
        path(
          polygonPath(m, [
            [440, 610],
            [560, 610],
            [572, 756],
            [428, 756],
          ]),
          gradient(defs, false, [c.dark, c.body, c.light, c.body, c.dark]),
        ) +
        rr(320, 750, 360, 22, 10, gradient(defs, true, [c.light, c.body, c.dark])) +
        rr(0, 0, 1000, 620, 22, c.body, edge) +
        rr(8, 8, 984, 562.25, 14, c.bezel)
      );
    case "laptop":
      return (
        rr(70, 0, 820, 556, 28, c.body, edge) +
        rr(74, 4, 812, 544, 25, c.bezel) +
        dot(480, 17, 4) +
        rr(110, 548, 740, 6, 2, c.dark) +
        rr(0, 552, 960, 14, 5, gradient(defs, true, [c.light, c.body]), edge) +
        rr(410, 552, 140, 6, 3, c.dark, ' fill-opacity="0.6"') +
        path(
          polygonPath(m, [
            [10, 564],
            [950, 564],
            [920, 572],
            [40, 572],
          ]),
          c.dark,
        )
      );
    case "tablet":
      return (
        rr(0, 0, 560, 728, 48, c.body, edge) + rr(6, 6, 548, 716, 43, c.bezel) + dot(280, 17, 4)
      );
    case "phone":
      return (
        rr(0, 130, 8, 40, 2, c.edge) +
        rr(0, 190, 8, 64, 2, c.edge) +
        rr(0, 268, 8, 64, 2, c.edge) +
        rr(300, 200, 8, 96, 2, c.edge) +
        rr(4, 0, 300, 620, 54, c.body, edge) +
        rr(8, 4, 292, 612, 50, c.bezel)
      );
  }
}

/** Camera cut-out of a phone, drawn on top of the screen. Px path data or "". */
export function mockupCameraPath(p: MockupPlacement, camera: MockupCamera): string {
  if (p.device !== "phone" || camera === "none") return "";
  const m = mapper(p);
  const cx = 154;
  if (camera === "island") return rrPath(m, cx - 44, 24, 88, 26, 13);
  const top = 12;
  const w2 = 72;
  const d = 30;
  const r = 15;
  const fl = 6;
  const P = (x: number, y: number) => `${f(m.x(x))} ${f(m.y(y))}`;
  return (
    `M${P(cx - w2 - fl, top)}Q${P(cx - w2, top)} ${P(cx - w2, top + fl)}` +
    `L${P(cx - w2, top + d - r)}Q${P(cx - w2, top + d)} ${P(cx - w2 + r, top + d)}` +
    `L${P(cx + w2 - r, top + d)}Q${P(cx + w2, top + d)} ${P(cx + w2, top + d - r)}` +
    `L${P(cx + w2, top + fl)}Q${P(cx + w2, top)} ${P(cx + w2 + fl, top)}Z`
  );
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

/** Corner radii of a box: top left, top right, bottom right, bottom left. */
export type MockupRadii = readonly [number, number, number, number];

/** The screen area of one device (where the page shows). */
export interface MockupScreen {
  readonly device: MockupDevice;
  /** Where the page shows, below the bar (canvas px). */
  readonly rect: ScreenshotRect;
  readonly radii: MockupRadii;
  /** CSS viewport of the page: width per device, height from the screen's aspect. */
  readonly viewport: { readonly width: number; readonly height: number };
  /** Px path data of everything painted on top of this screen (camera, devices in front). */
  readonly occluders: readonly string[];
}

/** The scene in paint order: vector markup, or a picture shown as a layer of its own. */
export type MockupLayer =
  | { readonly kind: "svg"; readonly body: string }
  | {
      readonly kind: "picture";
      /** The visible screen area (canvas px). */
      readonly box: ScreenshotRect;
      readonly radii: MockupRadii;
      readonly href: string;
      /** Where the whole picture lies, relative to `box` (crop). */
      readonly image: ScreenshotRect;
    };

export interface MockupScene {
  /** The finished document (exports, thumbnails). */
  readonly svg: string;
  /** Shared defs (gradients, filters, clips) every layer document needs. */
  readonly defs: string;
  /** Background plus devices in paint order; pictures as their own layers. */
  readonly layers: readonly MockupLayer[];
  readonly screens: readonly MockupScreen[];
}

export interface MockupOptions extends MockupLayoutOptions {
  /** Background markup covering the canvas. */
  readonly backgroundSvg: string;
  /** The picture per device; `undefined` draws the placeholder website. */
  readonly images: Readonly<Partial<Record<MockupDevice, ScreenshotImage>>>;
  readonly finish: MockupFinish;
  readonly camera: MockupCamera;
  /** Bar on desktop and laptop screens. */
  readonly frame: ScreenshotFrame;
  readonly theme: ScreenshotTheme;
  /** Address in the bar (shown via `mockupDisplayUrl`, escaped). */
  readonly url: string;
  /** Shadow strength 0 to 100. */
  readonly shadow: number;
  readonly shadowColor: string;
  readonly accent: string;
}

function radiiPath(r: ScreenshotRect, radii: MockupRadii): string {
  const [tl, tr, br, bl] = radii;
  if (tl === tr && tr === br && br === bl) return roundedRectPath(r, tl);
  const arc = (rad: number, dx: number, dy: number) =>
    rad > 0 ? `a${f(rad)} ${f(rad)} 0 0 1 ${f(dx)} ${f(dy)}` : "";
  return (
    `M${f(r.x + tl)} ${f(r.y)}h${f(r.width - tl - tr)}${arc(tr, tr, tr)}` +
    `v${f(r.height - tr - br)}${arc(br, -br, br)}h${f(-(r.width - br - bl))}` +
    `${arc(bl, -bl, -bl)}v${f(-(r.height - bl - tl))}${arc(tl, tl, -tl)}Z`
  );
}

/** The mockup as one SVG plus its layers and screen areas. */
export function mockupScene(o: MockupOptions): MockupScene {
  const W = o.width;
  const H = o.height;
  const placements = mockupLayout(o);
  const colors = MOCKUP_FINISH_COLORS[o.finish];
  const defs = new Defs();
  const url = mockupDisplayUrl(o.url);
  const layers: MockupLayer[] = [{ kind: "svg", body: o.backgroundSvg }];
  const pushSvg = (body: string) => {
    if (!body) return;
    const last = layers[layers.length - 1];
    if (last?.kind === "svg") layers[layers.length - 1] = { kind: "svg", body: last.body + body };
    else layers.push({ kind: "svg", body });
  };
  const silhouettes = placements.map(mockupSilhouette);
  const screens: MockupScreen[] = [];

  placements.forEach((p, i) => {
    const model = MOCKUP_MODELS[p.device];
    const m = mapper(p);
    const screen = m.rect(model.screen.x, model.screen.y, model.screen.width, model.screen.height);
    const radius = m.l(model.screenRadius);
    const barH = MOCKUP_BAR_DEVICES.has(p.device) ? screen.width * MOCKUP_BAR_RATIO[o.frame] : 0;
    const bar = barH > 0 ? { ...screen, height: barH } : null;
    const page = {
      x: screen.x,
      y: screen.y + barH,
      width: screen.width,
      height: screen.height - barH,
    };
    const radii: MockupRadii = bar ? [0, 0, radius, radius] : [radius, radius, radius, radius];
    const clipId = defs.add(
      "mc",
      `<clipPath><path d="${roundedRectPath(screen, radius)}"/></clipPath>`,
      "clipPath",
    );

    let body = deviceShadow(defs, p, o.shadow / 100, o.shadowColor, W, H);
    body += deviceBody(defs, p, colors);
    const image = o.images[p.device];
    const vw = MOCKUP_VIEWPORT_WIDTH[p.device];
    const vh = (vw * page.height) / Math.max(1e-6, page.width);
    let chrome = bar ? barMarkup(bar, o.frame, o.theme, url) : "";
    if (!image) {
      const hero = `url(#${defs.add(
        "mg",
        `<linearGradient x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.accent}"/><stop offset="1" stop-color="${PLACEHOLDER_HERO_END}"/></linearGradient>`,
        "linearGradient",
      )})`;
      chrome +=
        `<svg x="${f(page.x)}" y="${f(page.y)}" width="${f(page.width)}" height="${f(page.height)}" ` +
        `viewBox="0 0 ${f(vw)} ${f(vh)}" preserveAspectRatio="none">` +
        `${placeholderWebsite(vw, vh, o.theme, o.accent, hero)}</svg>`;
    }
    if (chrome) body += `<g clip-path="url(#${clipId})">${chrome}</g>`;
    pushSvg(body);

    if (image) {
      const crop = mockupCrop(image.width, image.height, page);
      layers.push({
        kind: "picture",
        box: page,
        radii,
        href: image.href,
        image: { ...crop, x: crop.x - page.x, y: crop.y - page.y },
      });
    }
    const cameraPath = mockupCameraPath(p, o.camera);
    if (cameraPath) pushSvg(`<path d="${cameraPath}" fill="${colors.bezel}"/>`);

    screens.push({
      device: p.device,
      rect: page,
      radii,
      viewport: { width: vw, height: Math.round(vh) },
      occluders: [...(cameraPath ? [cameraPath] : []), ...silhouettes.slice(i + 1)],
    });
  });

  const body = layers
    .map((l) => {
      if (l.kind === "svg") return l.body;
      const clip = defs.add(
        "mp",
        `<clipPath><path d="${radiiPath(l.box, l.radii)}"/></clipPath>`,
        "clipPath",
      );
      return (
        `<g clip-path="url(#${clip})"><image x="${f(l.box.x + l.image.x)}" y="${f(l.box.y + l.image.y)}" ` +
        `width="${f(l.image.width)}" height="${f(l.image.height)}" preserveAspectRatio="none" ` +
        `xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${attributeHref(l.href)}"/></g>`
      );
    })
    .join("");
  const allDefs = defs.toString();
  return {
    svg: svgDocument(W, H, `<defs>${allDefs}</defs>${body}`),
    defs: allDefs,
    layers,
    screens,
  };
}
