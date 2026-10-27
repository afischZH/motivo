/**
 * Polka dots on a square grid, an offset (hexagonal) grid or scattered with
 * Poisson-disk sampling. Dots are grouped by colour to keep the SVG compact.
 */
import { formatNumber } from "../../curves";
import { poissonDisk } from "../../poisson";
import type { Rng } from "../../rng";
import { svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";

export const DOT_LAYOUTS = ["grid", "offset", "scatter"] as const;
export type DotLayout = (typeof DOT_LAYOUTS)[number];

export const DOT_SHAPES = ["circle", "ring", "square"] as const;
export type DotShape = (typeof DOT_SHAPES)[number];

export const DOT_COLOR_MODES = ["single", "alternate", "random"] as const;
/** `single`: first colour; `alternate`: cycles by row/column; `random`: seeded pick. */
export type DotColorMode = (typeof DOT_COLOR_MODES)[number];

export interface DotSite extends Vec2 {
  /** Row and column for grid layouts (sequential index for scatter). */
  readonly row: number;
  readonly col: number;
}

export interface DotLayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly layout: DotLayout;
  /** Centre-to-centre distance in px. */
  readonly spacing: number;
  readonly rng: Rng;
}

/** Smallest centre distance in px; finer grids are invisible and only cost time. */
export const MIN_DOT_SPACING_PX = 4;
/** Upper bound for dot sites per render, so extreme sizes cannot freeze the UI. */
export const MAX_DOT_SITES = 20_000;

const rowStep = (layout: DotLayout, s: number): number =>
  layout === "offset" ? (s * Math.sqrt(3)) / 2 : s;

/** Sites `dotSites` produces (grids, exact) or can produce at most (scatter, hex packing). */
function siteCount(w: number, h: number, layout: DotLayout, s: number): number {
  if (layout === "scatter") {
    // Poisson-disk points are at least `s` apart, so they never beat hexagonal packing.
    const pw = w + s;
    const ph = h + s;
    return (Math.floor(pw / s) + 2) * (Math.floor(ph / rowStep("offset", s)) + 2);
  }
  const dy = rowStep(layout, s);
  return (2 * (Math.ceil(h / 2 / dy) + 1) + 1) * (2 * (Math.ceil(w / 2 / s) + 1) + 1);
}

/**
 * The spacing actually used for a canvas: at least `MIN_DOT_SPACING_PX`, and
 * widened uniformly until the canvas holds at most `MAX_DOT_SITES` sites.
 * Returns `spacing` unchanged for all regular sizes.
 */
export function effectiveDotSpacing(
  o: Pick<DotLayoutOptions, "width" | "height" | "layout" | "spacing">,
): number {
  const { width: w, height: h, layout } = o;
  if (!(o.spacing > 0)) throw new RangeError("dotSites: spacing must be positive");
  let s = Math.max(o.spacing, MIN_DOT_SPACING_PX);
  if (siteCount(w, h, layout, s) <= MAX_DOT_SITES) return s;
  s = Math.max(s, Math.sqrt((w * h) / MAX_DOT_SITES));
  while (siteCount(w, h, layout, s) > MAX_DOT_SITES) s *= 1.02;
  return s;
}

/**
 * Dot centres covering the canvas, including dots cut by the edges. Grids are
 * centred on the canvas so the pattern is symmetric. Only `scatter` uses the rng.
 * The spacing is clamped with `effectiveDotSpacing`.
 */
export function dotSites(o: DotLayoutOptions): DotSite[] {
  const { width: w, height: h } = o;
  const s = effectiveDotSpacing(o);
  if (o.layout === "scatter") {
    // Sample a padded area so dots near the edges are cut like in the grids.
    return poissonDisk({ width: w + s, height: h + s, minDistance: s, rng: o.rng }).map((p, i) => ({
      x: p.x - s / 2,
      y: p.y - s / 2,
      row: 0,
      col: i,
    }));
  }
  const dy = rowStep(o.layout, s);
  const rowsHalf = Math.ceil(h / 2 / dy) + 1;
  const colsHalf = Math.ceil(w / 2 / s) + 1;
  const sites: DotSite[] = [];
  for (let r = -rowsHalf; r <= rowsHalf; r++) {
    const shift = o.layout === "offset" && r % 2 !== 0 ? s / 2 : 0;
    for (let c = -colsHalf; c <= colsHalf; c++) {
      sites.push({ x: w / 2 + c * s + shift, y: h / 2 + r * dy, row: r, col: c });
    }
  }
  return sites;
}

export interface PolkaDotsSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  readonly background: string;
  readonly colors: readonly string[];
  readonly layout: DotLayout;
  readonly shape: DotShape;
  readonly colorMode: DotColorMode;
  readonly spacing: number;
  /** Dot diameter relative to the spacing, (0, 1]. */
  readonly size: number;
  /** Random shrink per dot, [0, 1]: 0 = all equal, 1 = down to zero. */
  readonly sizeVariance: number;
  /** Random offset per dot relative to the spacing, [0, 1] (max half a spacing). */
  readonly jitter: number;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export function polkaDotsSvg(o: PolkaDotsSvgOptions): string {
  const { width: w, height: h } = o;
  const s = effectiveDotSpacing(o);
  const sites = dotSites({ width: w, height: h, layout: o.layout, spacing: s, rng: o.rng });
  const baseR = (s * o.size) / 2;
  const ringWidth = Math.max(baseR * 0.3, 0.5);
  const f = (v: number): string => formatNumber(v, 1);
  const groups = new Map<string, string[]>();

  for (const site of sites) {
    // Always draw four values per dot so toggling one option does not reshuffle the others.
    const jx = o.rng.float(-0.5, 0.5);
    const jy = o.rng.float(-0.5, 0.5);
    const shrink = o.rng.next();
    const pick = o.rng.next();

    const x = site.x + jx * o.jitter * s;
    const y = site.y + jy * o.jitter * s;
    const r = baseR * (1 - o.sizeVariance * shrink);
    const reach = r + (o.shape === "ring" ? ringWidth / 2 : 0);
    if (r < 0.05 || x + reach < 0 || y + reach < 0 || x - reach > w || y - reach > h) continue;

    const n = o.colors.length;
    const index =
      o.colorMode === "single"
        ? 0
        : o.colorMode === "alternate"
          ? mod(site.row + site.col, n)
          : Math.min(Math.floor(pick * n), n - 1);
    const color = o.colors[index] ?? "#000000";

    const el =
      o.shape === "square"
        ? `<rect x="${f(x - r)}" y="${f(y - r)}" width="${f(2 * r)}" height="${f(2 * r)}"/>`
        : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(o.shape === "ring" ? Math.max(r - ringWidth / 2, 0.05) : r)}"/>`;
    const list = groups.get(color);
    if (list === undefined) groups.set(color, [el]);
    else list.push(el);
  }

  const paint = (color: string): string =>
    o.shape === "ring"
      ? `fill="none" stroke="${color}" stroke-width="${f(ringWidth)}"`
      : `fill="${color}"`;
  const body = [...groups.entries()]
    .map(([color, els]) => `<g ${paint(color)}>${els.join("")}</g>`)
    .join("");
  return svgDocument(w, h, `${svgBackground(o.background, w, h)}${body}`);
}
