/**
 * Grid patterns: graph-paper lines, dot grids, plus marks or square tiles on
 * a lattice centred on the canvas, with an optional major grid and a fade
 * (radial or towards the edges) done with an SVG luminance mask.
 */
import { formatNumber } from "../../curves";
import { stableId, svgBackground, svgDocument } from "../../svg";
import { MAX_DOT_SITES, effectiveDotSpacing } from "../polka-dots";

export const GRID_STYLES = ["lines", "dots", "crosses", "squares"] as const;
export type GridStyle = (typeof GRID_STYLES)[number];

export const GRID_LINE_STYLES = ["solid", "dashed", "dotted"] as const;
export type GridLineStyle = (typeof GRID_LINE_STYLES)[number];

export const GRID_FADES = ["none", "radial", "edges"] as const;
export type GridFade = (typeof GRID_FADES)[number];

/** Upper bound for lattice points (and therefore elements) per render. */
export const MAX_GRID_POINTS = MAX_DOT_SITES;

/**
 * The cell size actually used: at least 4 px and widened until the lattice
 * has at most `MAX_GRID_POINTS` points. Same guard as Polka Dots' grid layout,
 * which uses the identical centred lattice.
 */
export function effectiveGridCell(o: {
  readonly width: number;
  readonly height: number;
  readonly cell: number;
}): number {
  return effectiveDotSpacing({ width: o.width, height: o.height, layout: "grid", spacing: o.cell });
}

export interface GridLattice {
  /** Cell size in px after clamping. */
  readonly cell: number;
  /** Line positions with their index relative to the centre line (0). */
  readonly xs: readonly { readonly pos: number; readonly index: number }[];
  readonly ys: readonly { readonly pos: number; readonly index: number }[];
}

/** Grid line positions centred on the canvas, one extra line beyond each edge. */
export function gridLattice(width: number, height: number, cell: number): GridLattice {
  const s = effectiveGridCell({ width, height, cell });
  const axis = (len: number): { pos: number; index: number }[] => {
    const half = Math.ceil(len / 2 / s) + 1;
    const out: { pos: number; index: number }[] = [];
    for (let i = -half; i <= half; i++) out.push({ pos: len / 2 + i * s, index: i });
    return out;
  };
  return { cell: s, xs: axis(width), ys: axis(height) };
}

/** True when line `index` belongs to the major grid (`every` < 1 disables it). */
export function isMajorLine(index: number, every: number): boolean {
  return every >= 1 && ((index % every) + every) % every === 0;
}

export interface GridPatternSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly background: string;
  /** First colour: minor grid; second colour: major grid (falls back to the first). */
  readonly colors: readonly string[];
  readonly style: GridStyle;
  readonly lineStyle: GridLineStyle;
  /** Cell size in px. */
  readonly cell: number;
  /** Stroke width, dot radius or tile gap relative to the cell size, (0, 0.5]. */
  readonly weight: number;
  /** Every n-th line is major (thicker, second colour); 0 disables the major grid. */
  readonly majorEvery: number;
  readonly fade: GridFade;
}

const f = (v: number): string => formatNumber(v, 2);

function dashAttrs(style: GridLineStyle, s: number): string {
  // Lines start on a lattice point, so dashes are centred on the intersections.
  if (style === "dashed")
    return ` stroke-dasharray="${f(s / 2)} ${f(s / 2)}" stroke-dashoffset="${f(s / 4)}"`;
  if (style === "dotted") return ` stroke-dasharray="0 ${f(s / 5)}" stroke-linecap="round"`;
  return "";
}

function fadeMask(fade: GridFade, w: number, h: number): { defs: string; id: string } | undefined {
  if (fade === "none") return undefined;
  const rect = (fill: string, extra = ""): string =>
    `<rect width="${f(w)}" height="${f(h)}" fill="url(#${fill})"${extra}/>`;
  const box = `maskUnits="userSpaceOnUse" x="0" y="0" width="${f(w)}" height="${f(h)}"`;
  if (fade === "radial") {
    const grad = `cx="0.5" cy="0.5" r="0.5"><stop offset="0.25" stop-color="#fff"/><stop offset="1" stop-color="#000"/>`;
    const gid = stableId("gf", grad);
    const id = stableId("gm", `${gid}${w}x${h}`);
    return {
      id,
      defs: `<radialGradient id="${gid}" ${grad}</radialGradient><mask id="${id}" ${box}>${rect(gid)}</mask>`,
    };
  }
  // Edges: product of a horizontal and a vertical ramp via a nested mask.
  const stops = `<stop offset="0" stop-color="#000"/><stop offset="0.2" stop-color="#fff"/><stop offset="0.8" stop-color="#fff"/><stop offset="1" stop-color="#000"/>`;
  const gx = `x1="0" y1="0" x2="1" y2="0">${stops}`;
  const gy = `x1="0" y1="0" x2="0" y2="1">${stops}`;
  const gxId = stableId("gx", gx);
  const gyId = stableId("gy", gy);
  const inner = stableId("gv", `${gyId}${w}x${h}`);
  const id = stableId("gm", `${gxId}${inner}`);
  return {
    id,
    defs:
      `<linearGradient id="${gxId}" ${gx}</linearGradient>` +
      `<linearGradient id="${gyId}" ${gy}</linearGradient>` +
      `<mask id="${inner}" ${box}>${rect(gyId)}</mask>` +
      `<mask id="${id}" ${box}>${rect(gxId, ` mask="url(#${inner})"`)}</mask>`,
  };
}

/** Renders the grid. Uses no randomness: the result depends on params and size only. */
export function gridPatternSvg(o: GridPatternSvgOptions): string {
  const { width: w, height: h } = o;
  const { cell: s, xs, ys } = gridLattice(w, h, o.cell);
  const minor = o.colors[0] ?? "#000000";
  const major = o.colors[1] ?? minor;
  const weight = Math.max(o.weight * s, 0.1);
  const every = Math.round(o.majorEvery);
  const parts: string[] = [];

  if (o.style === "lines") {
    const x0 = xs[0]?.pos ?? 0;
    const x1 = xs[xs.length - 1]?.pos ?? w;
    const y0 = ys[0]?.pos ?? 0;
    const y1 = ys[ys.length - 1]?.pos ?? h;
    const paths = { minor: [] as string[], major: [] as string[] };
    for (const x of xs) {
      if (x.pos < -weight || x.pos > w + weight) continue;
      paths[isMajorLine(x.index, every) ? "major" : "minor"].push(`M${f(x.pos)} ${f(y0)}V${f(y1)}`);
    }
    for (const y of ys) {
      if (y.pos < -weight || y.pos > h + weight) continue;
      paths[isMajorLine(y.index, every) ? "major" : "minor"].push(`M${f(x0)} ${f(y.pos)}H${f(x1)}`);
    }
    const dash = dashAttrs(o.lineStyle, s);
    if (paths.minor.length > 0) {
      parts.push(
        `<path d="${paths.minor.join("")}" fill="none" stroke="${minor}" stroke-width="${f(weight)}"${dash}/>`,
      );
    }
    if (paths.major.length > 0) {
      parts.push(
        `<path d="${paths.major.join("")}" fill="none" stroke="${major}" stroke-width="${f(weight * 2)}"${dash}/>`,
      );
    }
  } else if (o.style === "squares") {
    // Tiles fill each cell minus a gap of `weight`; tiles at major lattice points use the second colour.
    const gap = Math.min(weight, s * 0.9);
    const size = s - gap;
    const groups = { minor: [] as string[], major: [] as string[] };
    for (const y of ys) {
      for (const x of xs) {
        const tx = x.pos + gap / 2;
        const ty = y.pos + gap / 2;
        if (tx > w || ty > h || tx + size < 0 || ty + size < 0) continue;
        const key = isMajorLine(x.index, every) && isMajorLine(y.index, every) ? "major" : "minor";
        groups[key].push(
          `<rect x="${f(tx)}" y="${f(ty)}" width="${f(size)}" height="${f(size)}"/>`,
        );
      }
    }
    if (groups.minor.length > 0) parts.push(`<g fill="${minor}">${groups.minor.join("")}</g>`);
    if (groups.major.length > 0) parts.push(`<g fill="${major}">${groups.major.join("")}</g>`);
  } else {
    const dots = o.style === "dots";
    const groups = { minor: [] as string[], major: [] as string[] };
    for (const y of ys) {
      for (const x of xs) {
        const isMajor = isMajorLine(x.index, every) && isMajorLine(y.index, every);
        const reach = dots ? weight * (isMajor ? 1.6 : 1) : s * (isMajor ? 0.3 : 0.2) + weight;
        if (x.pos + reach < 0 || y.pos + reach < 0 || x.pos - reach > w || y.pos - reach > h) {
          continue;
        }
        if (dots) {
          groups[isMajor ? "major" : "minor"].push(
            `<circle cx="${f(x.pos)}" cy="${f(y.pos)}" r="${f(reach)}"/>`,
          );
        } else {
          const a = s * (isMajor ? 0.3 : 0.2);
          groups[isMajor ? "major" : "minor"].push(
            `M${f(x.pos - a)} ${f(y.pos)}H${f(x.pos + a)}M${f(x.pos)} ${f(y.pos - a)}V${f(y.pos + a)}`,
          );
        }
      }
    }
    if (dots) {
      if (groups.minor.length > 0) parts.push(`<g fill="${minor}">${groups.minor.join("")}</g>`);
      if (groups.major.length > 0) parts.push(`<g fill="${major}">${groups.major.join("")}</g>`);
    } else {
      const cross = (d: string[], color: string, sw: number): string =>
        `<path d="${d.join("")}" fill="none" stroke="${color}" stroke-width="${f(sw)}" stroke-linecap="round"/>`;
      if (groups.minor.length > 0) parts.push(cross(groups.minor, minor, weight));
      if (groups.major.length > 0) parts.push(cross(groups.major, major, weight * 1.5));
    }
  }

  const mask = fadeMask(o.fade, w, h);
  const body = parts.join("");
  const grid = mask ? `<defs>${mask.defs}</defs><g mask="url(#${mask.id})">${body}</g>` : body;
  return svgDocument(w, h, `${svgBackground(o.background, w, h)}${grid}`);
}
