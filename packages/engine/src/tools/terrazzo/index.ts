/**
 * Terrazzo (docs/TOOLS.md K5): stone chips on a base colour. Chips are
 * random star-shaped polygons (angular) or smooth outlines through them
 * (pebbles) in two or three size classes, placed without overlap by dart
 * throwing (largest first), plus an optional layer of tiny speckles and the
 * shared grain overlay. With `wrap`, chips that cross an edge of the tile are
 * drawn again on the opposite side, so the tile repeats without seams.
 *
 * Caps: at most `TERRAZZO_CHIPS_MAX` chips and `TERRAZZO_SPECKLES_MAX`
 * speckles per tile (or canvas); above that the chips grow instead, so the
 * SVG stays well under 1.5 MB and a render under 50 ms.
 */
import { formatNumber } from "../../curves";
import {
  formatCoord,
  polygonPathData,
  scatterDisks,
  smoothPolygonPathData,
  starPolygon,
  wrapCopies,
  type DiskClass,
} from "../../geometry";
import { createRng, type Rng } from "../../rng";
import { stableId, svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";
import { grainOverlay, type GrainLayer } from "../noise-grain";

export const TERRAZZO_SHAPES = ["angular", "pebble", "mixed"] as const;
export type TerrazzoShape = (typeof TERRAZZO_SHAPES)[number];

/** Most chips per tile or canvas. */
export const TERRAZZO_CHIPS_MAX = 2000;
/** Most speckles per tile or canvas. */
export const TERRAZZO_SPECKLES_MAX = 2500;
/** Radius of each size class relative to the largest, for 2 and 3 classes. */
const CLASS_SCALES: Readonly<Record<2 | 3, readonly number[]>> = {
  2: [1, 0.45],
  3: [1, 0.5, 0.24],
};
/** Mean area of a chip relative to its bounding disk (measured, rounded). */
const CHIP_FILL = 0.62;
/** Speckles per px² at full strength. */
const SPECKLE_DENSITY = 0.003;

export interface TerrazzoLayoutOptions {
  /** Area to fill: the tile (with `wrap`) or the canvas. */
  readonly width: number;
  readonly height: number;
  readonly wrap: boolean;
  readonly rng: Rng;
  readonly colors: readonly string[];
  /** 0 = all colours equally often; up to 0.9 = the first colour dominates (weights (1 - d)^i). */
  readonly dominance: number;
  readonly shape: TerrazzoShape;
  /** Bounding radius of the largest chips in px. */
  readonly chipSize: number;
  readonly sizeClasses: 2 | 3;
  /** Random shrink within a class, 0 to 0.8. */
  readonly sizeVariance: number;
  /** Share of the area the chips aim to cover, 0.05 to 0.7. */
  readonly density: number;
  /** 0 = regular polygons, 1 = ragged and concave. */
  readonly irregularity: number;
  /** Minimum space between chips in px. */
  readonly gap: number;
  /** Speckle strength, 0 (none) to 1. */
  readonly speckles: number;
}

export interface TerrazzoChip {
  /** Bounding circle (centre and radius). */
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly color: string;
  /** Outline for chips; empty for speckles (drawn as circles). */
  readonly poly: Vec2[];
  readonly smooth: boolean;
}

export interface TerrazzoLayout {
  readonly width: number;
  readonly height: number;
  readonly wrap: boolean;
  readonly chips: TerrazzoChip[];
}

/** Colour weights `(1 - dominance)^i`, normalised to a cumulative list. */
export function terrazzoWeights(count: number, dominance: number): number[] {
  const d = Math.min(0.9, Math.max(0, dominance));
  const raw = Array.from({ length: count }, (_, i) => (1 - d) ** i);
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return raw.map((v) => (acc += v / sum));
}

const pickIndex = (cumulative: readonly number[], u: number): number => {
  for (let i = 0; i < cumulative.length; i++) if (u < (cumulative[i] as number)) return i;
  return cumulative.length - 1;
};

/** Size classes for an area, scaled up when the chip count would pass the cap. */
export function terrazzoClasses(o: TerrazzoLayoutOptions): DiskClass[] {
  const area = o.width * o.height;
  const scales = CLASS_SCALES[o.sizeClasses];
  const variance = Math.min(0.8, Math.max(0, o.sizeVariance));
  const density = Math.min(0.7, Math.max(0.05, o.density));
  const counts = (size: number): number[] =>
    scales.map((k) => {
      const mean = size * k * (1 - variance / 2);
      return (area * density) / scales.length / (CHIP_FILL * Math.PI * mean * mean);
    });
  let size = Math.max(1, o.chipSize);
  const total = counts(size).reduce((a, b) => a + b, 0);
  if (total > TERRAZZO_CHIPS_MAX) size *= Math.sqrt(total / TERRAZZO_CHIPS_MAX);
  const final = counts(size);
  return scales.map((k, i) => ({
    radius: size * k,
    variance,
    count: Math.floor(final[i] as number),
  }));
}

/** Places chips and speckles. Deterministic for a given rng state. */
export function terrazzoLayout(o: TerrazzoLayoutOptions): TerrazzoLayout {
  const seedOf = (): number => Math.floor(o.rng.next() * 4294967296);
  const placeRng = createRng(seedOf());
  const chipRng = createRng(seedOf());
  const speckleRng = createRng(seedOf());
  const classes = terrazzoClasses(o);
  const weights = terrazzoWeights(o.colors.length, o.dominance);
  const colorAt = (u: number): string => o.colors[pickIndex(weights, u)] ?? "#000000";

  const smallest = classes[classes.length - 1]?.radius ?? 1;
  const speckleR = Math.min(4, Math.max(0.8, smallest * 0.18));
  const speckleCount = Math.min(
    TERRAZZO_SPECKLES_MAX,
    Math.floor(o.width * o.height * SPECKLE_DENSITY * Math.min(1, Math.max(0, o.speckles))),
  );
  const all: DiskClass[] =
    speckleCount > 0
      ? [...classes, { radius: speckleR, variance: 0.5, count: speckleCount }]
      : classes;
  const disks = scatterDisks({
    width: o.width,
    height: o.height,
    classes: all,
    gap: Math.max(0, o.gap),
    wrap: o.wrap,
    rng: placeRng,
    attempts: 10,
  });

  const irregularity = Math.min(1, Math.max(0, o.irregularity));
  const chips: TerrazzoChip[] = disks.map((d) => {
    if (d.cls >= classes.length) {
      return { x: d.x, y: d.y, r: d.r, color: colorAt(speckleRng.next()), poly: [], smooth: false };
    }
    // Own stream per chip: changing the irregularity or shape keeps colours and places.
    const shapeRng = createRng(Math.floor(chipRng.next() * 4294967296));
    const color = colorAt(chipRng.next());
    const smooth = o.shape === "pebble" || (o.shape === "mixed" && shapeRng.bool(0.5));
    const vertices = smooth ? shapeRng.int(6, 8) : shapeRng.int(4, 7);
    const rotation = shapeRng.float(0, 2 * Math.PI);
    const poly = starPolygon(shapeRng, {
      center: { x: d.x, y: d.y },
      radius: d.r,
      vertices,
      irregularity,
      rotation,
    });
    return { x: d.x, y: d.y, r: d.r, color, poly, smooth };
  });
  return { width: o.width, height: o.height, wrap: o.wrap, chips };
}

const f = (v: number): string => formatCoord(v, 1);

function chipPath(chip: TerrazzoChip, dx: number, dy: number): string {
  if (chip.poly.length === 0) {
    // Circle as two arcs.
    const r = f(chip.r);
    return `M${f(chip.x + dx - chip.r)} ${f(chip.y + dy)}a${r} ${r} 0 1 0 ${f(2 * chip.r)} 0a${r} ${r} 0 1 0 ${f(-2 * chip.r)} 0Z`;
  }
  const poly =
    dx === 0 && dy === 0 ? chip.poly : chip.poly.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  return chip.smooth ? smoothPolygonPathData(poly, 1) : polygonPathData(poly, 1);
}

/**
 * The chips as one `<path>` per colour (they never overlap, so one outline
 * list per colour is enough), with wrap copies across the tile edges.
 */
export function terrazzoBody(layout: TerrazzoLayout): string {
  const byColor = new Map<string, string[]>();
  for (const chip of layout.chips) {
    const copies = layout.wrap
      ? wrapCopies(chip.x, chip.y, chip.r, layout.width, layout.height)
      : [{ dx: 0, dy: 0 }];
    let list = byColor.get(chip.color);
    if (list === undefined) {
      list = [];
      byColor.set(chip.color, list);
    }
    for (const c of copies) list.push(chipPath(chip, c.dx, c.dy));
  }
  return [...byColor.entries()].map(([c, d]) => `<path fill="${c}" d="${d.join("")}"/>`).join("");
}

export interface TerrazzoSvgOptions {
  readonly layout: TerrazzoLayout;
  readonly background: string;
  /** Grain over the whole result, or null. */
  readonly grain: GrainLayer | null;
}

/** One tile (or the whole canvas without wrap) as a standalone SVG. */
export function terrazzoTileSvg(o: TerrazzoSvgOptions): string {
  const { width: w, height: h } = o.layout;
  const grain = o.grain ? grainOverlay(w, h, o.grain) : { def: "", rect: "" };
  const defs = grain.def ? `<defs>${grain.def}</defs>` : "";
  return svgDocument(
    w,
    h,
    `${defs}${svgBackground(o.background, w, h)}${terrazzoBody(o.layout)}${grain.rect}`,
  );
}

/**
 * The full design: without wrap the layout is the canvas itself; with wrap
 * the tile repeats as an SVG pattern from the top left corner.
 */
export function terrazzoSvg(
  o: TerrazzoSvgOptions & { readonly width: number; readonly height: number },
): string {
  const { width: w, height: h } = o;
  const grain = o.grain ? grainOverlay(w, h, o.grain) : { def: "", rect: "" };
  const body = terrazzoBody(o.layout);
  if (!o.layout.wrap) {
    const defs = grain.def ? `<defs>${grain.def}</defs>` : "";
    return svgDocument(w, h, `${defs}${svgBackground(o.background, w, h)}${body}${grain.rect}`);
  }
  const tw = formatNumber(o.layout.width, 2);
  const th = formatNumber(o.layout.height, 2);
  const pid = stableId("tz", `${tw}x${th}:${body.length}:${body.slice(0, 256)}`);
  const pattern = `<pattern id="${pid}" width="${tw}" height="${th}" patternUnits="userSpaceOnUse">${body}</pattern>`;
  return svgDocument(
    w,
    h,
    `<defs>${pattern}${grain.def}</defs>${svgBackground(o.background, w, h)}` +
      `<rect width="${formatNumber(w, 2)}" height="${formatNumber(h, 2)}" fill="url(#${pid})"/>${grain.rect}`,
  );
}
