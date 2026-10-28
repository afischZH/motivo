/**
 * Striped gradient (docs/TOOLS.md C3): vertical bands side by side, each
 * filled with its own vertical linear gradient through the palette. Every
 * band's gradient is shifted by a seeded amount, so neighbouring bands are
 * slightly out of step. Optional shading per band (light left edge, dark
 * right edge, like fluted glass) and grain.
 *
 * Plain rects and linear gradients only: no filter, so the SVG renders the
 * same in every browser and editor and costs nothing at large sizes.
 */
import { formatNumber } from "../../curves";
import type { Rng } from "../../rng";
import { stableId, svgDocument } from "../../svg";
import { type GrainLayer, grainOverlay } from "../noise-grain";

export const STRIPES_MIN = 2;
export const STRIPES_MAX = 40;

/** Peak opacity of the band shading at `shading = 1`. */
const SHADING_MAX = 0.45;
/** Largest relative change of a band width at `variance = 1`. */
const WIDTH_VARIANCE_MAX = 0.7;

export interface StripedBand {
  /** Left edge and width in px. */
  readonly x: number;
  readonly width: number;
  /** Gradient start (top) and end in px; the gradient may start above the canvas. */
  readonly y1: number;
  readonly y2: number;
}

export interface StripedGradientOptions {
  readonly width: number;
  readonly height: number;
  /** Gradient stops, top to bottom, evenly spaced. */
  readonly colors: readonly string[];
  /** Number of bands, clamped to [STRIPES_MIN, STRIPES_MAX]. */
  readonly stripes: number;
  /** Shift of each band's gradient in [0, 1] (share of the height). */
  readonly offset: number;
  /** Random variation of band widths in [0, 1]. */
  readonly variance: number;
  /** Light and shadow on every band in [0, 1]. */
  readonly shading: number;
  /** Mirrors the gradient of every second band (bottom to top). */
  readonly alternate: boolean;
  readonly rng: Rng;
  readonly grain?: GrainLayer | null;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Band layout. Two rng draws per band (width, shift) whatever the params, so
 * changing offset or variance never reshuffles the other.
 */
export function stripedBands(o: StripedGradientOptions): StripedBand[] {
  const n = Math.round(Math.min(STRIPES_MAX, Math.max(STRIPES_MIN, o.stripes)));
  const offset = clamp01(o.offset);
  const variance = clamp01(o.variance) * WIDTH_VARIANCE_MAX;
  const weights: number[] = [];
  const shifts: number[] = [];
  for (let i = 0; i < n; i++) {
    weights.push(1 + variance * o.rng.float(-1, 1));
    shifts.push(o.rng.next());
  }
  const total = weights.reduce((a, b) => a + b, 0);
  // The gradient spans the canvas plus the offset, so a shifted band never
  // runs out of colour (no flat padding at the top or bottom).
  const span = o.height * (1 + offset);
  const bands: StripedBand[] = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const w = ((weights[i] as number) / total) * o.width;
    // "+ 0" turns -0 into 0 for offset 0.
    const y1 = -offset * o.height * (shifts[i] as number) + 0;
    bands.push({ x, width: w, y1, y2: y1 + span });
    x += w;
  }
  return bands;
}

function stops(colors: readonly string[]): string {
  const last = Math.max(1, colors.length - 1);
  return colors
    .map((c, i) => `<stop offset="${formatNumber(i / last, 3)}" stop-color="${c}"/>`)
    .join("");
}

/** SVG document: one rect with its own gradient per band, shading and grain on top. */
export function stripedGradientSvg(o: StripedGradientOptions): string {
  const bands = stripedBands(o);
  const colors = o.colors.length > 0 ? o.colors : ["#000000"];
  const forward = stops(colors);
  const backward = stops([...colors].reverse());
  const shading = clamp01(o.shading) * SHADING_MAX;
  const f = (v: number): string => formatNumber(v, 2);
  const h = f(o.height);
  let defs = "";
  let body = "";
  let shadeId = "";
  const seen = new Set<string>();
  if (shading > 0) {
    const a = formatNumber(shading, 3);
    // Same colour on both sides of each fade: no grey fringe without premultiplied alpha.
    const shade =
      `<linearGradient x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="${a}"/>` +
      `<stop offset="0.5" stop-color="#fff" stop-opacity="0"/>` +
      `<stop offset="0.5" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="#000" stop-opacity="${a}"/></linearGradient>`;
    shadeId = stableId("s", shade);
    defs += shade.replace("<linearGradient ", `<linearGradient id="${shadeId}" `);
  }
  bands.forEach((b, i) => {
    const flip = o.alternate && i % 2 === 1;
    const gradient =
      `<linearGradient x1="0" y1="${f(b.y1)}" x2="0" y2="${f(b.y2)}" gradientUnits="userSpaceOnUse">` +
      `${flip ? backward : forward}</linearGradient>`;
    const id = stableId("v", gradient);
    // Bands with the same shift (offset 0, or every second band when
    // alternating) share one definition: an id must be unique in the document.
    if (!seen.has(id)) {
      seen.add(id);
      defs += gradient.replace("<linearGradient ", `<linearGradient id="${id}" `);
    }
    // Each band overlaps the next by one unit, so anti-aliased edges leave no hairline.
    const last = i === bands.length - 1;
    const w = f(last ? b.width : b.width + 1);
    body += `<rect x="${f(b.x)}" width="${w}" height="${h}" fill="url(#${id})"/>`;
  });
  if (shadeId) {
    for (const b of bands) {
      body += `<rect x="${f(b.x)}" width="${f(b.width)}" height="${h}" fill="url(#${shadeId})"/>`;
    }
  }
  const grain = o.grain ? grainOverlay(o.width, o.height, o.grain) : { def: "", rect: "" };
  defs += grain.def;
  return svgDocument(o.width, o.height, `<defs>${defs}</defs>${body}${grain.rect}`);
}
