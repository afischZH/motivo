/**
 * Fluid spacing scale (docs/TOOLS.md M7). T-shirt sizes (3xs to 3xl) as
 * fixed multiples of a base space that grows from a minimum to a maximum
 * viewport, written as CSS `clamp()` like the fluid type scale (M1). Optional
 * pairs ("s-l") jump between two sizes across the viewport range, for gaps
 * that should change more than one size does.
 *
 * Pure arithmetic plus an SVG specimen: one row per size with its name, its
 * range and a square and bar at its true size for one viewport width.
 */
import { formatNumber } from "../../curves";
import { escapeXml, svgBackground, svgDocument } from "../../svg";
import { AVATAR_FONT_STACKS } from "../avatar";
import { type FluidStep, fluidSizeAt } from "../fluid-type";

/** Sizes and their multiple of the base space ("s"), smallest first. */
export const SPACE_SIZES = [
  { id: "3xs", factor: 0.25 },
  { id: "2xs", factor: 0.5 },
  { id: "xs", factor: 0.75 },
  { id: "s", factor: 1 },
  { id: "m", factor: 1.5 },
  { id: "l", factor: 2 },
  { id: "xl", factor: 3 },
  { id: "2xl", factor: 4 },
  { id: "3xl", factor: 6 },
] as const;

/** Index of the base size "s" in `SPACE_SIZES`. */
const BASE_INDEX = 3;
export const SPACE_DOWN_MAX = BASE_INDEX;
export const SPACE_UP_MAX = SPACE_SIZES.length - 1 - BASE_INDEX;

export const SPACE_PAIRS = ["none", "one-up", "custom"] as const;
export type SpacePairs = (typeof SPACE_PAIRS)[number];

export interface SpacingScaleOptions {
  readonly minViewport: number;
  readonly maxViewport: number;
  /** Base space ("s") in px at the minimum and the maximum viewport. */
  readonly minBase: number;
  readonly maxBase: number;
  /** Sizes below and above "s", clamped to what `SPACE_SIZES` has. */
  readonly sizesDown: number;
  readonly sizesUp: number;
  readonly pairs: SpacePairs;
  /** Custom pair as size ids, e.g. "s" and "l" (only with `pairs = "custom"`). */
  readonly pairFrom: string;
  readonly pairTo: string;
}

export interface SpaceSize extends FluidStep {
  /** Name without prefix, e.g. "s", "2xl" or "s-l" for a pair. */
  readonly name: string;
  /** True for a pair (from one size at the minimum to another at the maximum). */
  readonly pair: boolean;
}

const clampInt = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.round(v)));

function fluid(
  name: string,
  step: number,
  min: number,
  max: number,
  lo: number,
  hi: number,
  pair: boolean,
): SpaceSize {
  const span = hi - lo;
  const slope = span > 0 ? (max - min) / span : 0;
  return { name, step, min, max, slope, intercept: min - slope * lo, pair };
}

/** The sizes from `-sizesDown` to `sizesUp` around "s", then the pairs. */
export function spacingSizes(o: SpacingScaleOptions): SpaceSize[] {
  const lo = Math.min(o.minViewport, o.maxViewport);
  const hi = Math.max(o.minViewport, o.maxViewport);
  const first = BASE_INDEX - clampInt(o.sizesDown, 0, SPACE_DOWN_MAX);
  const last = BASE_INDEX + clampInt(o.sizesUp, 0, SPACE_UP_MAX);
  const sizes: SpaceSize[] = [];
  for (let i = first; i <= last; i++) {
    const s = SPACE_SIZES[i] as (typeof SPACE_SIZES)[number];
    sizes.push(
      fluid(s.id, i - BASE_INDEX, o.minBase * s.factor, o.maxBase * s.factor, lo, hi, false),
    );
  }
  const pair = (a: number, b: number): SpaceSize => {
    const from = SPACE_SIZES[a] as (typeof SPACE_SIZES)[number];
    const to = SPACE_SIZES[b] as (typeof SPACE_SIZES)[number];
    return fluid(
      `${from.id}-${to.id}`,
      b - BASE_INDEX,
      o.minBase * from.factor,
      o.maxBase * to.factor,
      lo,
      hi,
      true,
    );
  };
  if (o.pairs === "one-up") {
    for (let i = first; i < last; i++) sizes.push(pair(i, i + 1));
  } else if (o.pairs === "custom") {
    const a = SPACE_SIZES.findIndex((s) => s.id === o.pairFrom);
    const b = SPACE_SIZES.findIndex((s) => s.id === o.pairTo);
    if (a >= 0 && b >= 0 && a !== b) sizes.push(pair(a, b));
  }
  return sizes;
}

/** Ids of all sizes, for pickers. */
export const SPACE_SIZE_IDS = SPACE_SIZES.map((s) => s.id) as readonly string[];

// ---------------------------------------------------------------------------
// Specimen
// ---------------------------------------------------------------------------

export interface SpacingSpecimenOptions {
  readonly sizes: readonly SpaceSize[];
  /** Variable names, same order as `sizes` (e.g. "--space-s"). */
  readonly names: readonly string[];
  readonly minViewport: number;
  readonly maxViewport: number;
  /** Viewport width the squares and bars are drawn at. */
  readonly viewport: number;
  readonly background: string;
  readonly ink: string;
  /** Labels, ruler and size figures. */
  readonly muted: string;
  readonly accent: string;
  readonly width: number;
  readonly height: number;
}

const f = (v: number): string => formatNumber(v, 2);

/**
 * Specimen: the viewport ruler on top, then one row per size with its name,
 * its range in px and a square plus bar at its true size for `viewport`.
 * Pairs are drawn in the ink colour, sizes in the accent. Rows below the
 * bottom edge are cut off.
 */
export function spacingSpecimenSvg(o: SpacingSpecimenOptions): string {
  const { width: w, height: h } = o;
  const pad = Math.max(16, Math.round(Math.min(w, h) * 0.06));
  const label = Math.max(11, Math.min(18, w / 64));
  const mono = AVATAR_FONT_STACKS.mono;
  const parts: string[] = [svgBackground(o.background, w, h)];
  const text = (x: number, y: number, s: string, anchor: string, fill: string, size = label) =>
    `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" font-family="${mono}" font-size="${f(size)}" fill="${fill}">${escapeXml(s)}</text>`;

  const lo = Math.min(o.minViewport, o.maxViewport);
  const hi = Math.max(o.minViewport, o.maxViewport);
  const rulerY = pad + label;
  const x0 = pad;
  const x1 = w - pad;
  const t = hi > lo ? Math.min(1, Math.max(0, (o.viewport - lo) / (hi - lo))) : 0;
  const dotX = x0 + (x1 - x0) * t;
  parts.push(
    `<path d="M${f(x0)} ${f(rulerY)}H${f(x1)}" stroke="${o.muted}" stroke-opacity="0.5" stroke-width="1"/>`,
    `<path d="M${f(x0)} ${f(rulerY - 4)}V${f(rulerY + 4)}M${f(x1)} ${f(rulerY - 4)}V${f(rulerY + 4)}" stroke="${o.muted}" stroke-width="1"/>`,
    `<circle cx="${f(dotX)}" cy="${f(rulerY)}" r="${f(label * 0.4)}" fill="${o.accent}"/>`,
    text(x0, rulerY + label * 1.6, `${Math.round(lo)}px`, "start", o.muted),
    text(x1, rulerY + label * 1.6, `${Math.round(hi)}px`, "end", o.muted),
    // Anchor the preview label inside the canvas when the dot sits near an edge.
    text(
      dotX,
      rulerY - label * 0.8,
      `${Math.round(o.viewport)}px`,
      t > 0.9 ? "end" : t < 0.1 ? "start" : "middle",
      o.accent,
    ),
  );

  const labelColumn = Math.min(w * 0.32, label * 14);
  const shapeX = pad + labelColumn;
  const room = Math.max(0, w - pad - shapeX);
  let y = rulerY + label * 3.4;
  o.sizes.forEach((s, i) => {
    if (y > h) return;
    const size = fluidSizeAt(s, o.viewport);
    const rowHeight = Math.max(size, label * 2.6) + label;
    const mid = y + rowHeight / 2;
    const fill = s.pair ? o.ink : o.accent;
    parts.push(
      text(pad, mid - label * 0.15, o.names[i] ?? s.name, "start", s.pair ? o.ink : o.muted),
      text(
        pad,
        mid + label * 1.05,
        `${formatNumber(s.min, 1)} → ${formatNumber(s.max, 1)}`,
        "start",
        o.muted,
        label * 0.85,
      ),
    );
    // Square at the true size, then a bar of the same height up to ten sizes long.
    const side = Math.min(size, room);
    if (side > 0) {
      parts.push(
        `<rect x="${f(shapeX)}" y="${f(mid - side / 2)}" width="${f(side)}" height="${f(side)}" fill="${fill}" fill-opacity="0.9"/>`,
      );
      const barX = shapeX + side + label;
      const bar = Math.min(size * 10, Math.max(0, w - pad - barX - label * 6));
      if (bar > 0) {
        parts.push(
          `<rect x="${f(barX)}" y="${f(mid - Math.min(side, label * 0.6) / 2)}" width="${f(bar)}" height="${f(Math.min(side, label * 0.6))}" fill="${fill}" fill-opacity="0.25"/>`,
          text(
            barX + bar + label * 0.6,
            mid + label * 0.35,
            `${formatNumber(size, 1)}px`,
            "start",
            o.muted,
          ),
        );
      }
    }
    parts.push(
      `<path d="M${f(pad)} ${f(y + rowHeight)}H${f(w - pad)}" stroke="${o.muted}" stroke-opacity="0.18" stroke-width="1"/>`,
    );
    y += rowHeight;
  });
  return svgDocument(w, h, parts.join(""));
}
