/**
 * Section dividers (docs/TOOLS.md M2): the edge between two website
 * sections as a filled SVG shape (waves, arcs, a slant, peaks, an arrow,
 * clouds, steps). The SVG stretches to any width (`preserveAspectRatio:
 * none`), so one file fits every screen; only the height is fixed.
 *
 * Convention: the fill is the colour of the next section and lies below the
 * edge (`position: "bottom"`, the divider sits at the bottom of a section);
 * `"top"` mirrors it vertically, `invert` fills above the edge instead.
 */
import { catmullRomToBezier, cubicPathToSvg, formatNumber } from "../../curves";
import { escapeXml } from "../../svg";
import type { Vec2 } from "../../vec";

export const DIVIDER_SHAPES = [
  "wave",
  "curve",
  "tilt",
  "peaks",
  "arrow",
  "clouds",
  "steps",
] as const;
export type DividerShape = (typeof DIVIDER_SHAPES)[number];

export const DIVIDER_POSITIONS = ["bottom", "top"] as const;
export type DividerPosition = (typeof DIVIDER_POSITIONS)[number];

/** Shapes whose `count` repeats something (waves, arcs, peaks, bumps, steps). */
export const DIVIDER_COUNTED: ReadonlySet<DividerShape> = new Set([
  "wave",
  "curve",
  "peaks",
  "clouds",
  "steps",
]);

export const DIVIDER_COUNT_MAX = 24;
export const DIVIDER_LAYERS_MAX = 3;

const f = (v: number): string => formatNumber(v, 2);

/**
 * Height share of layer `j` (0 = backmost) of `n`. Back layers must peek out
 * behind the front one: below the edge they reach higher (1 down to 0.7),
 * above the edge (`invert`) they reach lower (0.7 up to 1).
 */
export function dividerLayerShare(j: number, n: number, invert: boolean): number {
  if (n <= 1) return 1;
  const k = invert ? n - 1 - j : j;
  return 1 - (k * 0.3) / (n - 1);
}

/** Phase shift of layer `j` in periods, so stacked waves and bumps do not line up. */
export function dividerLayerPhase(j: number): number {
  return j * 0.35;
}

/** Opacity of layer `j` (0 = backmost) of `n`: the front layer is opaque. */
export function dividerLayerOpacity(j: number, n: number): number {
  return j === n - 1 ? 1 : ((j + 1) / n) * 0.75;
}

interface EdgeOptions {
  shape: DividerShape;
  width: number;
  height: number;
  count: number;
  /** Height share of the shape in (0, 1]: the edge spans the lowest `share` of the box. */
  share: number;
  /** Phase shift in periods, for stacked layers. */
  phase: number;
}

/**
 * Path data of the edge from the left to the right side (starts with `M`),
 * in box coordinates (y down). Edge height e in [0, 1] (1 = highest) maps
 * to y = h - e * share * h.
 */
export function dividerEdge(o: EdgeOptions): string {
  const { width: w, height: h } = o;
  const n = Math.max(1, Math.min(DIVIDER_COUNT_MAX, Math.round(o.count)));
  const top = h * (1 - o.share);
  const yOf = (e: number) => h - e * (h - top);
  switch (o.shape) {
    case "wave": {
      // Sine between 20 % and the top, sampled 8 times per period, through Catmull-Rom (error well below a pixel).
      const samples = n * 8;
      const pts: Vec2[] = [];
      for (let i = 0; i <= samples; i++) {
        const u = i / samples;
        pts.push({ x: u * w, y: yOf(0.6 - 0.4 * Math.cos(2 * Math.PI * (n * u + o.phase))) });
      }
      return cubicPathToSvg(catmullRomToBezier(pts));
    }
    case "curve": {
      // n arcs; a quadratic Bezier with its control at 2·top − h peaks at `top`.
      const seg = w / n;
      const cy = 2 * top - h;
      let d = `M0 ${f(h)}`;
      for (let i = 0; i < n; i++)
        d += `Q${f(seg * (i + 0.5))} ${f(cy)} ${f(seg * (i + 1))} ${f(h)}`;
      return d;
    }
    case "tilt":
      return `M0 ${f(h)}L${f(w)} ${f(top)}`;
    case "peaks": {
      const seg = w / n;
      let d = `M0 ${f(h)}`;
      for (let i = 0; i < n; i++)
        d += `L${f(seg * (i + 0.5))} ${f(top)}L${f(seg * (i + 1))} ${f(h)}`;
      return d;
    }
    case "arrow": {
      // Flat at the top with a V pointing down in the middle (10 % of the width).
      const half = w * 0.05;
      return `M0 ${f(top)}L${f(w / 2 - half)} ${f(top)}L${f(w / 2)} ${f(h)}L${f(w / 2 + half)} ${f(top)}L${f(w)} ${f(top)}`;
    }
    case "clouds": {
      // Half ellipses on a baseline at 30 %, alternating full and 70 % height.
      const seg = w / n;
      const base = yOf(0.3);
      let d = `M0 ${f(base)}`;
      for (let i = 0; i < n; i++) {
        const ry = (base - top) * ((i + Math.round(o.phase * 2)) % 2 === 0 ? 1 : 0.7);
        d += `A${f(seg / 2)} ${f(ry)} 0 0 1 ${f(seg * (i + 1))} ${f(base)}`;
      }
      return d;
    }
    case "steps": {
      // n steps rising from the left to the full height.
      const seg = w / n;
      let d = `M0 ${f(yOf(1 / n))}`;
      for (let i = 1; i < n; i++) d += `H${f(seg * i)}V${f(yOf((i + 1) / n))}`;
      return `${d}H${f(w)}`;
    }
  }
}

export interface SectionDividerOptions {
  readonly shape: DividerShape;
  readonly position: DividerPosition;
  readonly count: number;
  /** Stacked copies (1 to 3), back ones lower in height and lighter. */
  readonly layers: number;
  readonly flip: boolean;
  readonly invert: boolean;
  /** Fill of the shape (the neighbouring section). */
  readonly color: string;
  /** The other side, or `"transparent"`. */
  readonly background: string;
  readonly width: number;
  readonly height: number;
}

/** The shapes (without the root element), shared by the image and the code exports. */
export function sectionDividerBody(o: SectionDividerOptions): string {
  const { width: w, height: h } = o;
  const n = Math.max(1, Math.min(DIVIDER_LAYERS_MAX, Math.round(o.layers)));
  const out: string[] = [];
  if (o.background !== "transparent") {
    out.push(`<rect width="${f(w)}" height="${f(h)}" fill="${escapeXml(o.background)}"/>`);
  }
  const close = o.invert ? `L${f(w)} 0L0 0Z` : `L${f(w)} ${f(h)}L0 ${f(h)}Z`;
  const paths: string[] = [];
  for (let j = 0; j < n; j++) {
    const edge = dividerEdge({
      shape: o.shape,
      width: w,
      height: h,
      count: o.count,
      share: dividerLayerShare(j, n, o.invert),
      phase: dividerLayerPhase(j),
    });
    const opacity = dividerLayerOpacity(j, n);
    const alpha = opacity < 1 ? ` fill-opacity="${f(opacity)}"` : "";
    paths.push(`<path d="${edge}${close}" fill="${escapeXml(o.color)}"${alpha}/>`);
  }
  // Flips around the box centre: horizontal mirror, then top position.
  const sx = o.flip ? -1 : 1;
  const sy = o.position === "top" ? -1 : 1;
  const group = paths.join("");
  if (sx === 1 && sy === 1) out.push(group);
  else
    out.push(
      `<g transform="matrix(${sx} 0 0 ${sy} ${sx === -1 ? f(w) : 0} ${sy === -1 ? f(h) : 0})">${group}</g>`,
    );
  return out.join("");
}

/**
 * The divider as a standalone SVG: pixel size for previews and images, and
 * `preserveAspectRatio="none"` so the file stretches to any width in a page.
 */
export function sectionDividerSvg(o: SectionDividerOptions): string {
  const w = f(o.width);
  const h = f(o.height);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ` +
    `preserveAspectRatio="none">${sectionDividerBody(o)}</svg>`
  );
}
