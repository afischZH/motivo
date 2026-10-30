/**
 * Neon shapes (docs/TOOLS.md B6): glowing outline shapes on a dark ground,
 * like bent neon tubes. Circles, triangles, squares, hexagons, lines, zigzags
 * and waves, placed and turned by the seed.
 *
 * The glow is drawn without an SVG filter: every shape is stroked several
 * times, wider and fainter each time, under the tube itself. That looks like
 * a soft blur, keeps the SVG editable in design apps and renders the same at
 * 8K, where browsers would cap a Gaussian blur.
 */
import { formatNumber } from "../../curves";
import type { Rng } from "../../rng";
import { stableId, svgBackground, svgDocument } from "../../svg";

export const NEON_SHAPES = [
  "circle",
  "triangle",
  "square",
  "hexagon",
  "line",
  "zigzag",
  "wave",
] as const;
export type NeonShape = (typeof NEON_SHAPES)[number];

export const NEON_KINDS = ["mixed", "rounds", "polygons", "lines"] as const;
export type NeonKind = (typeof NEON_KINDS)[number];

export const NEON_COUNT_MIN = 1;
export const NEON_COUNT_MAX = 30;

const KIND_SHAPES: Readonly<Record<NeonKind, readonly NeonShape[]>> = {
  mixed: NEON_SHAPES,
  rounds: ["circle", "wave"],
  polygons: ["triangle", "square", "hexagon"],
  lines: ["line", "zigzag", "wave"],
};

/** Glow strokes under each tube; more look smoother but cost bytes. */
export const NEON_GLOW_LAYERS = 12;
/** Width of the widest glow stroke in tube widths at `glow = 1`. */
const GLOW_SPREAD = 16;
/** Opacity of the innermost glow stroke at `glow = 1`. */
const GLOW_ALPHA = 0.13;

export interface NeonOptions {
  readonly width: number;
  readonly height: number;
  readonly background: string;
  /** Tube colours, picked per shape. */
  readonly colors: readonly string[];
  readonly kind: NeonKind;
  /** Number of shapes, clamped to [1, 30]. */
  readonly count: number;
  /** Shape size as a share of the shorter side in [0.03, 0.8]. */
  readonly size: number;
  /** Random variation of the size in [0, 1]. */
  readonly variance: number;
  /** Tube width as a share of the shorter side. */
  readonly stroke: number;
  /** Glow strength in [0, 1]. */
  readonly glow: number;
  /** White hot core inside every tube. */
  readonly core: boolean;
  /** Coloured haze behind the shapes in [0, 1]. */
  readonly haze: number;
  readonly rng: Rng;
}

export interface NeonItem {
  readonly shape: NeonShape;
  readonly color: string;
  /** Centre, radius (half the size) in px and rotation in degrees. */
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly rotation: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Seeded layout. Six draws per slot for every possible slot, so changing the
 * count, kind or size never moves the other shapes.
 */
export function neonItems(o: NeonOptions): NeonItem[] {
  const n = Math.round(clamp(o.count, NEON_COUNT_MIN, NEON_COUNT_MAX));
  const shapes = KIND_SHAPES[o.kind];
  const colors = o.colors.length > 0 ? o.colors : ["#ff2bd6"];
  const base = (Math.min(o.width, o.height) * clamp(o.size, 0.03, 0.8)) / 2;
  const variance = clamp(o.variance, 0, 1);
  const items: NeonItem[] = [];
  for (let i = 0; i < NEON_COUNT_MAX; i++) {
    const pick = o.rng.next();
    const x = o.rng.float(0.08, 0.92) * o.width;
    const y = o.rng.float(0.08, 0.92) * o.height;
    const scale = 1 + variance * o.rng.float(-0.6, 0.6);
    const rotation = o.rng.float(0, 360);
    const tint = o.rng.next();
    if (i >= n) continue;
    items.push({
      shape: shapes[Math.floor(pick * shapes.length)] as NeonShape,
      color: colors[Math.floor(tint * colors.length)] as string,
      x,
      y,
      r: base * scale,
      rotation,
    });
  }
  return items;
}

function polygon(sides: number, r: number, f: (v: number) => string): string {
  let d = "";
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2 - Math.PI / 2;
    d += `${k === 0 ? "M" : "L"}${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)}`;
  }
  return `${d}Z`;
}

/** Path of a shape around the origin (rotation and position come from a transform). */
export function neonPath(shape: NeonShape, r: number): string {
  const f = (v: number): string => formatNumber(v, 2);
  switch (shape) {
    case "circle":
      return `M${f(-r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
    case "triangle":
      return polygon(3, r, f);
    case "square":
      return polygon(4, r, f);
    case "hexagon":
      return polygon(6, r, f);
    case "line":
      return `M${f(-r)} 0H${f(r)}`;
    case "zigzag": {
      const steps = 6;
      let d = `M${f(-r)} ${f(r * 0.25)}`;
      for (let k = 1; k <= steps; k++) {
        const x = -r + (2 * r * k) / steps;
        d += `L${f(x)} ${f(k % 2 === 1 ? -r * 0.25 : r * 0.25)}`;
      }
      return d;
    }
    case "wave": {
      const steps = 4;
      const seg = (2 * r) / steps;
      let d = `M${f(-r)} 0`;
      for (let k = 0; k < steps; k++) {
        const x = -r + seg * k;
        const amp = (k % 2 === 0 ? -1 : 1) * r * 0.35;
        d += `Q${f(x + seg / 2)} ${f(amp)} ${f(x + seg)} 0`;
      }
      return d;
    }
  }
}

/** Width and opacity of each glow stroke, widest first, in tube widths. */
export function neonGlowLayers(glow: number): { width: number; opacity: number }[] {
  const g = clamp(glow, 0, 1);
  if (g === 0) return [];
  const layers: { width: number; opacity: number }[] = [];
  for (let k = NEON_GLOW_LAYERS; k >= 1; k--) {
    const t = k / NEON_GLOW_LAYERS;
    layers.push({
      width: 1 + (GLOW_SPREAD - 1) * g * t ** 1.6,
      // Faint outside, stronger close to the tube; the strokes add up.
      opacity: GLOW_ALPHA * g * (1 - t) ** 1.2 + 0.03 * g,
    });
  }
  return layers;
}

/** SVG document: background, haze, then per shape its glow strokes, tube and core. */
export function neonSvg(o: NeonOptions): string {
  const items = neonItems(o);
  const f = (v: number): string => formatNumber(v, 2);
  const short = Math.min(o.width, o.height);
  const tube = Math.max(0.5, short * clamp(o.stroke, 0.001, 0.05));
  const glow = neonGlowLayers(o.glow);
  let defs = "";
  let body = svgBackground(o.background, o.width, o.height);
  const haze = clamp(o.haze, 0, 1);
  if (haze > 0) {
    const colors = o.colors.length > 0 ? o.colors : ["#ff2bd6"];
    colors.slice(0, 3).forEach((c, i) => {
      const grad =
        `<radialGradient r="0.5"><stop offset="0" stop-color="${c}" ` +
        `stop-opacity="${formatNumber(0.45 * haze, 3)}"/>` +
        `<stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
      const id = stableId("n", grad);
      if (!defs.includes(`id="${id}"`)) {
        defs += grad.replace("<radialGradient ", `<radialGradient id="${id}" `);
      }
      // Fixed spots (not seeded), so the haze stays when the shapes move.
      const spots = [
        [0.25, 0.3],
        [0.75, 0.7],
        [0.6, 0.2],
      ] as const;
      const [sx, sy] = spots[i] as readonly [number, number];
      body +=
        `<ellipse cx="${f(sx * o.width)}" cy="${f(sy * o.height)}" ` +
        `rx="${f(o.width * 0.55)}" ry="${f(o.height * 0.55)}" fill="url(#${id})"/>`;
    });
  }
  for (const item of items) {
    const d = neonPath(item.shape, item.r);
    const transform = `translate(${f(item.x)} ${f(item.y)}) rotate(${f(item.rotation)})`;
    let g = "";
    for (const layer of glow) {
      g +=
        `<path d="${d}" stroke-width="${f(tube * layer.width)}" ` +
        `stroke-opacity="${formatNumber(layer.opacity, 3)}"/>`;
    }
    g += `<path d="${d}" stroke-width="${f(tube)}"/>`;
    if (o.core) {
      g += `<path d="${d}" stroke="#fff" stroke-opacity="0.85" stroke-width="${f(tube * 0.35)}"/>`;
    }
    body +=
      `<g transform="${transform}" fill="none" stroke="${item.color}" ` +
      `stroke-linecap="round" stroke-linejoin="round">${g}</g>`;
  }
  return svgDocument(o.width, o.height, `${defs ? `<defs>${defs}</defs>` : ""}${body}`);
}
