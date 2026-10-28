/**
 * Favicon and app icon (docs/TOOLS.md L2): one square icon from a letter,
 * a library shape or the user's logo on a solid, gradient or pattern
 * background, cut to a square, rounded square, squircle or circle.
 *
 * Variants for the icon pack: `standard` (the favicon itself), `apple`
 * (full bleed and opaque: iOS rounds the corners itself) and `maskable`
 * (full bleed and opaque, content inside the safe zone, a centred circle
 * of 80 % diameter). The colour scheme is `light`, `dark` or `adaptive`
 * (both, switched by `prefers-color-scheme`, for `favicon.svg`).
 *
 * Pure and deterministic, no randomness. Text uses system fonts: the
 * engine has no font data, so glyphs are drawn by the viewing device.
 */
import { mixHex } from "../../color";
import { formatNumber } from "../../curves";
import { escapeXml, stableId } from "../../svg";

export const FAVICON_CONTENTS = ["text", "shape", "image"] as const;
export type FaviconContentKind = (typeof FAVICON_CONTENTS)[number];

export const FAVICON_FONTS = ["sans", "serif", "mono", "rounded"] as const;
export type FaviconFont = (typeof FAVICON_FONTS)[number];

export const FAVICON_BACKGROUNDS = ["solid", "gradient", "pattern", "transparent"] as const;
export type FaviconBackgroundType = (typeof FAVICON_BACKGROUNDS)[number];

export const FAVICON_GRADIENTS = ["linear", "radial"] as const;
export type FaviconGradientType = (typeof FAVICON_GRADIENTS)[number];

export const FAVICON_PATTERNS = ["dots", "grid", "stripes", "diagonal", "checks"] as const;
export type FaviconPattern = (typeof FAVICON_PATTERNS)[number];

export const FAVICON_CORNERS = ["square", "rounded", "squircle", "circle"] as const;
export type FaviconCorner = (typeof FAVICON_CORNERS)[number];

export const FAVICON_VARIANTS = ["standard", "dark", "apple", "maskable"] as const;
export type FaviconVariant = (typeof FAVICON_VARIANTS)[number];

export type FaviconScheme = "light" | "dark" | "adaptive";

/** Most characters of the text content. */
export const FAVICON_TEXT_MAX = 4;
/** Largest padding per side, in percent of the icon edge. */
export const FAVICON_PADDING_MAX = 40;
/**
 * Diameter of the maskable safe zone as a fraction of the edge (W3C
 * "maskable icons": a centred circle of 40 % radius is never cut).
 */
export const MASKABLE_SAFE_DIAMETER = 0.8;
/** Largest content square inside the safe zone, as a fraction of the edge (0.8 / √2). */
export const MASKABLE_CONTENT_MAX = MASKABLE_SAFE_DIAMETER / Math.SQRT2;
/** Superellipse exponent of the squircle (close to the iOS app icon outline). */
export const SQUIRCLE_EXPONENT = 5;

/** CSS font stacks per font choice: system fonts only, nothing is downloaded. */
export const FAVICON_FONT_STACKS: Readonly<Record<FaviconFont, string>> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
  rounded: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif',
};

/** Estimated advance width of one character in em (for fitting several characters). */
const CHAR_WIDTH_EM = 0.62;

/** What the icon shows. Hrefs must be safe data URIs (sanitised by the caller). */
export type FaviconContent =
  | {
      readonly kind: "text";
      readonly text: string;
      readonly font: FaviconFont;
      readonly weight: number;
      /** Glyph size in percent of the content box. */
      readonly size: number;
    }
  | {
      readonly kind: "shape";
      /** Centred path data in a 100 box (-50..50). */ readonly path: string;
    }
  | {
      readonly kind: "image";
      readonly href: string;
      /** Same picture for the dark scheme (e.g. recoloured), default `href`. */
      readonly darkHref?: string;
      /** Width / height of the picture. */
      readonly aspect: number;
      /** Paint the picture in the foreground colour (raster: SVG filter). */
      readonly tint: boolean;
    };

export interface FaviconColors {
  readonly foreground: string;
  readonly background: string;
  readonly darkForeground: string;
  readonly darkBackground: string;
  /** Fill of opaque variants (apple, maskable) when the background is transparent. */
  readonly appBackground: string;
}

export interface FaviconOptions {
  readonly width: number;
  readonly height: number;
  readonly variant: "standard" | "apple" | "maskable";
  readonly scheme: FaviconScheme;
  readonly content: FaviconContent;
  readonly colors: FaviconColors;
  readonly backgroundType: FaviconBackgroundType;
  readonly gradient: {
    readonly colors: readonly string[];
    readonly type: FaviconGradientType;
    readonly angle: number;
  };
  readonly pattern: {
    readonly kind: FaviconPattern;
    /**
     * Colour of the pattern marks. Left out, it is derived per scheme: a
     * quarter of the way from the background to the foreground (OKLab).
     */
    readonly color?: string;
    /** Cells per icon edge. */
    readonly density: number;
  };
  /** Padding per side in percent of the edge. */
  readonly padding: number;
  readonly corner: FaviconCorner;
  /** Corner radius of `rounded` in percent of the edge. */
  readonly radius: number;
}

/** Where the icon and its content sit, in px of the canvas. */
export interface FaviconLayout {
  /** Top left corner and edge of the icon square. */
  readonly x: number;
  readonly y: number;
  readonly size: number;
  /** The content box (square, centred). */
  readonly content: { readonly x: number; readonly y: number; readonly size: number };
  /** Outline of the icon (no outline: the full square). */
  readonly corner: FaviconCorner;
  /** Opaque background is forced (apple, maskable). */
  readonly opaque: boolean;
}

/** The icon square centred in the canvas and its content box. Pure. */
export function faviconLayout(
  o: Pick<FaviconOptions, "width" | "height" | "variant" | "padding" | "corner">,
): FaviconLayout {
  const size = Math.max(1, Math.min(o.width, o.height));
  const x = (o.width - size) / 2;
  const y = (o.height - size) / 2;
  const padding = Math.min(Math.max(o.padding, 0), FAVICON_PADDING_MAX) / 100;
  let inner = size * (1 - 2 * padding);
  if (o.variant === "maskable") inner = Math.min(inner, size * MASKABLE_CONTENT_MAX);
  const fullBleed = o.variant !== "standard";
  return {
    x,
    y,
    size,
    content: { x: x + (size - inner) / 2, y: y + (size - inner) / 2, size: inner },
    corner: fullBleed ? "square" : o.corner,
    opaque: fullBleed,
  };
}

const f = (v: number): string => formatNumber(v, 2);

/**
 * Superellipse |x/a|^n + |y/a|^n = 1 around (cx, cy) as a closed polygon
 * (`points` per quarter), fine enough for 1024 px icons.
 */
export function squirclePath(
  cx: number,
  cy: number,
  half: number,
  exponent = SQUIRCLE_EXPONENT,
  points = 24,
): string {
  const parts: string[] = [];
  const total = points * 4;
  for (let i = 0; i < total; i++) {
    const t = (i / total) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const px = cx + half * Math.sign(c) * Math.abs(c) ** (2 / exponent);
    const py = cy + half * Math.sign(s) * Math.abs(s) ** (2 / exponent);
    parts.push(`${i === 0 ? "M" : "L"}${f(px)} ${f(py)}`);
  }
  return `${parts.join("")}Z`;
}

/** Path data of the icon outline. */
export function faviconOutline(layout: FaviconLayout, radiusPercent: number): string {
  const { x, y, size, corner } = layout;
  const half = size / 2;
  switch (corner) {
    case "square":
      return `M${f(x)} ${f(y)}H${f(x + size)}V${f(y + size)}H${f(x)}Z`;
    case "circle":
      return `M${f(x)} ${f(y + half)}A${f(half)} ${f(half)} 0 1 1 ${f(x + size)} ${f(y + half)}A${f(half)} ${f(half)} 0 1 1 ${f(x)} ${f(y + half)}Z`;
    case "squircle":
      return squirclePath(x + half, y + half, half);
    case "rounded": {
      const r = Math.min(Math.max(radiusPercent, 0), 50) * (size / 100);
      if (r <= 0) return `M${f(x)} ${f(y)}H${f(x + size)}V${f(y + size)}H${f(x)}Z`;
      const a = `A${f(r)} ${f(r)} 0 0 1`;
      return (
        `M${f(x + r)} ${f(y)}H${f(x + size - r)}${a} ${f(x + size)} ${f(y + r)}` +
        `V${f(y + size - r)}${a} ${f(x + size - r)} ${f(y + size)}` +
        `H${f(x + r)}${a} ${f(x)} ${f(y + size - r)}V${f(y + r)}${a} ${f(x + r)} ${f(y)}Z`
      );
    }
  }
}

/** Gradient stops with OKLCH midpoints, so the sRGB gradient matches a perceptual one. */
function gradientStops(colors: readonly string[]): string {
  const list = colors.length >= 2 ? colors : [colors[0] ?? "#000000", colors[0] ?? "#000000"];
  const segments = list.length - 1;
  const steps = 3;
  const out: string[] = [];
  for (let s = 0; s < segments; s++) {
    const a = list[s] as string;
    const b = list[s + 1] as string;
    for (let k = 0; k <= steps; k++) {
      if (k === steps && s < segments - 1) continue;
      const t = k / steps;
      const color =
        k === 0 ? a.toLowerCase() : k === steps ? b.toLowerCase() : mixHex(a, b, t, "oklch");
      out.push(`<stop offset="${formatNumber((s + t) / segments, 4)}" stop-color="${color}"/>`);
    }
  }
  return out.join("");
}

function linearVector(angle: number): string {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a) / 2;
  const dy = -Math.cos(a) / 2;
  const g = (v: number): string => formatNumber(v, 3);
  return `x1="${g(0.5 - dx)}" y1="${g(0.5 - dy)}" x2="${g(0.5 + dx)}" y2="${g(0.5 + dy)}"`;
}

/** Pattern tile markup (in a `cell` × `cell` tile) for one pattern kind. */
function patternTile(kind: FaviconPattern, cell: number, color: string): string {
  const c = f(cell);
  const h = f(cell / 2);
  switch (kind) {
    case "dots":
      return `<circle cx="${h}" cy="${h}" r="${f(cell * 0.2)}" fill="${color}"/>`;
    case "grid": {
      const w = f(Math.max(cell * 0.08, 0.5));
      return `<path d="M0 0H${c}V${w}H0ZM0 0H${w}V${c}H0Z" fill="${color}"/>`;
    }
    case "stripes":
      return `<rect width="${c}" height="${h}" fill="${color}"/>`;
    case "diagonal":
      // Two bands that continue across the tile edges.
      return `<path d="M0 0H${f(cell * 0.25)}L0 ${f(cell * 0.25)}ZM${f(cell * 0.75)} 0H${c}V${f(cell * 0.25)}L${f(cell * 0.25)} ${c}H0V${f(cell * 0.75)}ZM${c} ${f(cell * 0.75)}V${c}H${f(cell * 0.75)}Z" fill="${color}"/>`;
    case "checks":
      return `<path d="M0 0H${h}V${h}H0ZM${h} ${h}H${c}V${c}H${h}Z" fill="${color}"/>`;
  }
}

interface Paint {
  /** Defs needed by the fill (ids derive from content, so equal entries are equal). */
  defs: string[];
  /** Background markup clipped to the outline (or empty). */
  body: string;
}

/** Share of the foreground in a derived pattern colour. */
export const PATTERN_MIX = 0.25;

/** Background of one scheme, drawn inside `outline`. */
function backgroundPaint(
  o: FaviconOptions,
  layout: FaviconLayout,
  outline: string,
  dark: boolean,
): Paint {
  const base = dark ? o.colors.darkBackground : o.colors.background;
  if (o.backgroundType === "transparent" && layout.opaque) {
    return { defs: [], body: `<path d="${outline}" fill="${o.colors.appBackground}"/>` };
  }
  switch (o.backgroundType) {
    case "transparent":
      return { defs: [], body: "" };
    case "solid":
      return { defs: [], body: `<path d="${outline}" fill="${base}"/>` };
    case "gradient": {
      const stops = gradientStops(o.gradient.colors);
      const geometry =
        o.gradient.type === "linear" ? linearVector(o.gradient.angle) : `cx=".5" cy=".5" r=".71"`;
      const tag = o.gradient.type === "linear" ? "linearGradient" : "radialGradient";
      const id = stableId("fg", `${tag}${geometry}${stops}`);
      return {
        defs: [`<${tag} id="${id}" ${geometry}>${stops}</${tag}>`],
        body: `<path d="${outline}" fill="url(#${id})"/>`,
      };
    }
    case "pattern": {
      const density = Math.min(Math.max(Math.round(o.pattern.density), 1), 64);
      const cell = layout.size / density;
      const fg = dark ? o.colors.darkForeground : o.colors.foreground;
      const ink = o.pattern.color ?? mixHex(base, fg, PATTERN_MIX, "oklab");
      const tile = patternTile(o.pattern.kind, cell, ink);
      const id = stableId("fp", `${f(layout.x)},${f(layout.y)},${f(cell)}${tile}`);
      return {
        defs: [
          `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${f(layout.x)}" y="${f(layout.y)}" width="${f(cell)}" height="${f(cell)}">${tile}</pattern>`,
        ],
        body: `<path d="${outline}" fill="${base}"/><path d="${outline}" fill="url(#${id})"/>`,
      };
    }
  }
}

/** Content markup of one scheme. */
function contentMarkup(o: FaviconOptions, layout: FaviconLayout, dark: boolean): Paint {
  const fg = dark ? o.colors.darkForeground : o.colors.foreground;
  const box = layout.content;
  const cx = box.x + box.size / 2;
  const cy = box.y + box.size / 2;
  const c = o.content;
  switch (c.kind) {
    case "text": {
      const chars = [...c.text];
      if (chars.length === 0) return { defs: [], body: "" };
      const fontSize =
        (box.size * (Math.min(Math.max(c.size, 1), 100) / 100)) /
        Math.max(1, chars.length * CHAR_WIDTH_EM);
      const family = escapeXml(FAVICON_FONT_STACKS[c.font]);
      return {
        defs: [],
        body:
          `<text x="${f(cx)}" y="${f(cy)}" fill="${fg}" font-family="${family}" font-size="${f(fontSize)}" ` +
          `font-weight="${Math.round(c.weight)}" text-anchor="middle" dominant-baseline="central">${escapeXml(c.text)}</text>`,
      };
    }
    case "shape": {
      const scale = box.size / 100;
      return {
        defs: [],
        body: `<path transform="translate(${f(cx)} ${f(cy)}) scale(${formatNumber(scale, 4)})" d="${c.path}" fill="${fg}"/>`,
      };
    }
    case "image": {
      const aspect = c.aspect > 0 && Number.isFinite(c.aspect) ? c.aspect : 1;
      const w = aspect >= 1 ? box.size : box.size * aspect;
      const h = aspect >= 1 ? box.size / aspect : box.size;
      const href = dark ? (c.darkHref ?? c.href) : c.href;
      const defs: string[] = [];
      let filter = "";
      if (c.tint) {
        const id = stableId("ft", fg);
        defs.push(
          `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feFlood flood-color="${fg}"/><feComposite in2="SourceGraphic" operator="in"/></filter>`,
        );
        filter = ` filter="url(#${id})"`;
      }
      return {
        defs,
        body: `<image x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="xMidYMid meet" href="${href}"${filter}/>`,
      };
    }
  }
}

/** One scheme of the icon: background plus clipped content. */
function iconScheme(
  o: FaviconOptions,
  layout: FaviconLayout,
  outline: string,
  dark: boolean,
): Paint {
  const bg = backgroundPaint(o, layout, outline, dark);
  const content = contentMarkup(o, layout, dark);
  const defs = [...bg.defs, ...content.defs];
  let body = content.body;
  // Clip the content to the outline when the icon has a visible shape.
  if (body !== "" && bg.body !== "" && layout.corner !== "square") {
    const id = stableId("fc", outline);
    defs.push(`<clipPath id="${id}"><path d="${outline}"/></clipPath>`);
    body = `<g clip-path="url(#${id})">${body}</g>`;
  }
  return { defs, body: bg.body + body };
}

/** `<defs>` with each definition once (both schemes may share one). */
function defsMarkup(defs: readonly string[]): string {
  return defs.length === 0 ? "" : `<defs>${[...new Set(defs)].join("")}</defs>`;
}

/** The icon as a standalone SVG document. */
export function faviconSvg(o: FaviconOptions): string {
  const layout = faviconLayout(o);
  const outline = faviconOutline(layout, o.radius);
  const w = f(o.width);
  const h = f(o.height);
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  if (o.scheme !== "adaptive") {
    const s = iconScheme(o, layout, outline, o.scheme === "dark");
    return `${open}${defsMarkup(s.defs)}${s.body}</svg>`;
  }
  const light = iconScheme(o, layout, outline, false);
  const dark = iconScheme(o, layout, outline, true);
  return (
    `${open}<style>.d{display:none}@media (prefers-color-scheme:dark){.l{display:none}.d{display:inline}}</style>` +
    `${defsMarkup([...light.defs, ...dark.defs])}<g class="l">${light.body}</g><g class="d">${dark.body}</g></svg>`
  );
}
