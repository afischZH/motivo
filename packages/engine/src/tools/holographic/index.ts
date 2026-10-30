/**
 * Holographic gradient (docs/TOOLS.md C5): iridescent foil. A base linear
 * gradient repeats the palette across the canvas (mirrored, so there is no
 * seam), and up to three ring layers (radial gradients, also mirrored) with
 * seeded centres sit on top in blend modes. Where the bands cross they shift
 * colour like holographic foil. Optional creases (soft white folds), sheen
 * (two bright spots) and grain.
 *
 * Gradients and blend modes only, no filter: renders the same at every size
 * and costs nothing at 8K.
 */
import { formatNumber } from "../../curves";
import type { Rng } from "../../rng";
import { stableId, svgDocument } from "../../svg";
import { type GrainLayer, grainOverlay } from "../noise-grain";

export const HOLO_BANDS_MIN = 1;
export const HOLO_BANDS_MAX = 12;
export const HOLO_LAYERS_MAX = 3;

/** Blend mode of each ring layer, in order. */
const LAYER_BLEND = ["hard-light", "overlay", "color-dodge"] as const;
/** Opacity of the ring layers at full `rings`. */
const LAYER_OPACITY = [0.6, 0.7, 0.25] as const;
/** Peak opacity of the creases and of the sheen at 1. */
const CREASE_MAX = 0.4;
const SHEEN_MAX = 0.75;

export interface HolographicOptions {
  readonly width: number;
  readonly height: number;
  /** Foil colours; repeated `bands` times across the canvas. */
  readonly colors: readonly string[];
  /** Direction of the base bands, CSS-style degrees (0 = to top). */
  readonly angle: number;
  /** How often the palette repeats across the diagonal, clamped to [1, 12]. */
  readonly bands: number;
  /** Number of ring layers, clamped to [0, 3]. */
  readonly layers: number;
  /** Strength of the ring layers in [0, 1]. */
  readonly rings: number;
  /** Soft white folds in [0, 1]. */
  readonly creases: number;
  /** Bright spots in [0, 1]. */
  readonly sheen: number;
  readonly rng: Rng;
  readonly grain?: GrainLayer | null;
}

export interface HoloRing {
  /** Centre in px (may lie outside the canvas) and repeat length in px. */
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** Palette rotation of this layer (index offset). */
  readonly shift: number;
}

export interface HoloLayout {
  readonly rings: readonly HoloRing[];
  /** Crease direction in degrees and two sheen centres in px. */
  readonly creaseAngle: number;
  readonly sheen: readonly { readonly x: number; readonly y: number }[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Seeded placement. Always draws for the maximum number of layers, so adding
 * a layer or changing the bands never moves the others.
 */
export function holographicLayout(o: HolographicOptions): HoloLayout {
  const diag = Math.hypot(o.width, o.height);
  const bands = Math.round(clamp(o.bands, HOLO_BANDS_MIN, HOLO_BANDS_MAX));
  const all: HoloRing[] = [];
  for (let i = 0; i < HOLO_LAYERS_MAX; i++) {
    const cx = o.rng.float(-0.3, 1.3) * o.width;
    const cy = o.rng.float(-0.3, 1.3) * o.height;
    const scale = o.rng.float(0.55, 1.4);
    const shift = o.rng.int(1, 4);
    all.push({ cx, cy, r: (diag / bands) * scale, shift });
  }
  const creaseAngle = o.rng.float(0, 180);
  const sheen = [0, 1].map(() => ({
    x: o.rng.float(0.1, 0.9) * o.width,
    y: o.rng.float(0.1, 0.9) * o.height,
  }));
  const n = Math.round(clamp(o.layers, 0, HOLO_LAYERS_MAX));
  return { rings: all.slice(0, n), creaseAngle, sheen };
}

function stops(colors: readonly string[]): string {
  const last = Math.max(1, colors.length - 1);
  return colors
    .map((c, i) => `<stop offset="${formatNumber(i / last, 3)}" stop-color="${c}"/>`)
    .join("");
}

const rotate = <T>(items: readonly T[], by: number): T[] =>
  items.map((_, i) => items[(i + by) % items.length] as T);

/** SVG document: base bands, ring layers, creases, sheen and grain. */
export function holographicSvg(o: HolographicOptions): string {
  const colors = o.colors.length > 0 ? o.colors : ["#ffffff"];
  const layout = holographicLayout(o);
  const bands = Math.round(clamp(o.bands, HOLO_BANDS_MIN, HOLO_BANDS_MAX));
  const f = (v: number): string => formatNumber(v, 2);
  const w = f(o.width);
  const h = f(o.height);
  const cx = o.width / 2;
  const cy = o.height / 2;
  const diag = Math.hypot(o.width, o.height);
  // One repeat of the palette along the angle; the gradient is mirrored beyond.
  const length = diag / bands;
  const a = (o.angle * Math.PI) / 180;
  const dx = (Math.sin(a) * length) / 2;
  const dy = (-Math.cos(a) * length) / 2;
  let defs = "";
  let body = "";
  const def = (prefix: string, markup: string): string => {
    const id = stableId(prefix, markup);
    defs += markup.replace(/^<(\w+) /, `<$1 id="${id}" `);
    return id;
  };
  const base = def(
    "h",
    `<linearGradient x1="${f(cx - dx)}" y1="${f(cy - dy)}" x2="${f(cx + dx)}" y2="${f(cy + dy)}" ` +
      `gradientUnits="userSpaceOnUse" spreadMethod="reflect">${stops(colors)}</linearGradient>`,
  );
  body += `<rect width="${w}" height="${h}" fill="url(#${base})"/>`;
  const strength = clamp(o.rings, 0, 1);
  if (strength > 0) {
    layout.rings.forEach((ring, i) => {
      const id = def(
        "r",
        `<radialGradient cx="${f(ring.cx)}" cy="${f(ring.cy)}" r="${f(ring.r)}" ` +
          `gradientUnits="userSpaceOnUse" spreadMethod="reflect">` +
          `${stops(rotate(colors, ring.shift))}</radialGradient>`,
      );
      const opacity = formatNumber((LAYER_OPACITY[i] ?? 0.5) * strength, 3);
      body +=
        `<rect width="${w}" height="${h}" fill="url(#${id})" opacity="${opacity}" ` +
        `style="mix-blend-mode:${LAYER_BLEND[i] ?? "overlay"}"/>`;
    });
  }
  const creases = clamp(o.creases, 0, 1) * CREASE_MAX;
  if (creases > 0) {
    const ca = (layout.creaseAngle * Math.PI) / 180;
    const cl = length * 0.7;
    const ex = (Math.sin(ca) * cl) / 2;
    const ey = (-Math.cos(ca) * cl) / 2;
    const op = formatNumber(creases, 3);
    // Same colour on both sides of each fade, so no grey fringe appears.
    const id = def(
      "c",
      `<linearGradient x1="${f(cx - ex)}" y1="${f(cy - ey)}" x2="${f(cx + ex)}" y2="${f(cy + ey)}" ` +
        `gradientUnits="userSpaceOnUse" spreadMethod="reflect">` +
        `<stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
        `<stop offset="0.82" stop-color="#fff" stop-opacity="0"/>` +
        `<stop offset="1" stop-color="#fff" stop-opacity="${op}"/></linearGradient>`,
    );
    body += `<rect width="${w}" height="${h}" fill="url(#${id})" style="mix-blend-mode:soft-light"/>`;
  }
  const sheen = clamp(o.sheen, 0, 1) * SHEEN_MAX;
  if (sheen > 0) {
    const r = Math.min(o.width, o.height) * 0.55;
    const op = formatNumber(sheen, 3);
    const id = def(
      "s",
      `<radialGradient r="0.5">` +
        `<stop offset="0" stop-color="#fff" stop-opacity="${op}"/>` +
        `<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
    );
    for (const s of layout.sheen) {
      body +=
        `<ellipse cx="${f(s.x)}" cy="${f(s.y)}" rx="${f(r)}" ry="${f(r * 0.7)}" ` +
        `fill="url(#${id})" style="mix-blend-mode:screen"/>`;
    }
  }
  const grain = o.grain ? grainOverlay(o.width, o.height, o.grain) : { def: "", rect: "" };
  defs += grain.def;
  return svgDocument(o.width, o.height, `<defs>${defs}</defs>${body}${grain.rect}`);
}
