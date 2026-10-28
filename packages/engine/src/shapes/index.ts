/**
 * Musterli's own shape library (M4-AP01): 170 filled shapes in 12 themed
 * packs, drawn here from basic geometry (circles, arcs, polygons, Bezier and
 * Catmull-Rom curves, seeded random blobs). Nothing is taken from other
 * products or icon sets; see assets/LICENSES.md.
 *
 * Conventions (docs/ARCHITECTURE.md 4.5):
 * - A shape is absolute SVG path data in a 100 × 100 box, filled with the
 *   nonzero rule (holes run against their outline), no strokes, no text.
 * - `shapePath(id)` is centred on the origin (x and y from -50 to 50), so a
 *   renderer can place, rotate and scale it with one transform;
 *   `shapePath(id, "box")` is the same shape in the box 0..100.
 * - Some shapes have two layers: `primary` plus an `accent` (duotone, drawn
 *   with lower opacity or a second colour). `shapePath` is both layers
 *   together, the full silhouette for one-colour use.
 * - `tile` marks shapes that fill the box and meet its edges at fixed
 *   points, made for quarter-turn (Truchet) grids.
 * - Ids are stable: never rename or remove one, saved designs and share
 *   links refer to them. New shapes are appended to their pack.
 *
 * Pure and deterministic. Paths are built on first use and cached.
 */
import { basics } from "./packs/basics";
import { bauhaus } from "./packs/bauhaus";
import { blobs } from "./packs/blobs";
import { decorative } from "./packs/decorative";
import { geometric } from "./packs/geometric";
import { lines } from "./packs/lines";
import { nature } from "./packs/nature";
import { organic } from "./packs/organic";
import { retro } from "./packs/retro";
import { stars } from "./packs/stars";
import { symbols } from "./packs/symbols";
import { tiles } from "./packs/tiles";
import { translatePath } from "./path-data";
import type { PackBuilders } from "./types";

export { flattenPath, parsePathData, pathBounds, translatePath, windingNumber } from "./path-data";
export type { PathBounds, PathCommand } from "./path-data";

/** All packs in display order. */
const PACKS = {
  basics,
  geometric,
  organic,
  blobs,
  stars,
  lines,
  retro,
  bauhaus,
  nature,
  symbols,
  tiles,
  decorative,
} as const satisfies Record<string, PackBuilders>;

type Packs = typeof PACKS;

export type ShapePackId = keyof Packs;

/** Every shape id of the library (a union of string literals). */
export type ShapeId = { [K in ShapePackId]: Extract<keyof Packs[K], string> }[ShapePackId];

/** Pack ids in display order. */
export const SHAPE_PACK_IDS = Object.keys(PACKS) as [ShapePackId, ...ShapePackId[]];

/** Packs whose every shape is a tile shape. */
const TILE_PACKS: ReadonlySet<ShapePackId> = new Set(["tiles"]);

export interface ShapePack {
  readonly id: ShapePackId;
  /** Shape ids in display order. */
  readonly shapes: readonly ShapeId[];
}

const packList: readonly ShapePack[] = SHAPE_PACK_IDS.map((id) => ({
  id,
  shapes: Object.keys(PACKS[id]) as ShapeId[],
}));

/** Every shape id, pack by pack in display order (usable as a `z.enum`). */
export const SHAPE_IDS = packList.flatMap((p) => p.shapes) as [ShapeId, ...ShapeId[]];

const packOf = new Map<string, ShapePackId>(
  packList.flatMap((p) => p.shapes.map((s) => [s, p.id] as const)),
);

export interface ShapeDef {
  readonly id: ShapeId;
  readonly pack: ShapePackId;
  /** Primary layer, centred box (-50..50). */
  readonly primary: string;
  /** Optional second layer (duotone), centred box; does not overlap the primary layer. */
  readonly accent?: string;
  /** Both layers: the full silhouette, centred box. */
  readonly path: string;
  /** Fills the box and meets its edges at fixed points (quarter-turn / Truchet grids). */
  readonly tile: boolean;
}

/** The packs in display order with their shape ids. */
export function listShapePacks(): readonly ShapePack[] {
  return packList;
}

/** Whether `value` is a shape id of the library. */
export function isShapeId(value: unknown): value is ShapeId {
  return typeof value === "string" && packOf.has(value);
}

const cache = new Map<ShapeId, ShapeDef>();

/** A shape by id, or `undefined` for unknown ids. */
export function getShape(id: string): ShapeDef | undefined {
  if (!isShapeId(id)) return undefined;
  let def = cache.get(id);
  if (def === undefined) {
    const pack = packOf.get(id) as ShapePackId;
    const builders: PackBuilders = PACKS[pack];
    const source = (builders[id] as () => ReturnType<PackBuilders[string]>)();
    const primary = typeof source === "string" ? source : source.d;
    const accent = typeof source === "string" ? undefined : source.accent;
    def = {
      id,
      pack,
      primary,
      ...(accent !== undefined ? { accent } : {}),
      path: accent !== undefined ? `${primary}${accent}` : primary,
      tile: TILE_PACKS.has(pack),
    };
    cache.set(id, def);
  }
  return def;
}

/** Where a path sits: `center` = -50..50 (default), `box` = 0..100. */
export type ShapeOrigin = "center" | "box";

const boxCache = new Map<string, string>();

function inBox(d: string): string {
  let out = boxCache.get(d);
  if (out === undefined) {
    out = translatePath(d, 50, 50);
    boxCache.set(d, out);
  }
  return out;
}

/** Path data of a shape (both layers). Unknown ids fall back to the circle. */
export function shapePath(id: string, origin: ShapeOrigin = "center"): string {
  const d = (getShape(id) ?? (getShape("circle") as ShapeDef)).path;
  return origin === "box" ? inBox(d) : d;
}

/** The layers of a shape for duotone rendering. Unknown ids fall back to the circle. */
export function shapeLayers(
  id: string,
  origin: ShapeOrigin = "center",
): { readonly primary: string; readonly accent?: string } {
  const def = getShape(id) ?? (getShape("circle") as ShapeDef);
  if (origin === "center") {
    return def.accent !== undefined
      ? { primary: def.primary, accent: def.accent }
      : { primary: def.primary };
  }
  return def.accent !== undefined
    ? { primary: inBox(def.primary), accent: inBox(def.accent) }
    : { primary: inBox(def.primary) };
}

/** Ids of the shapes in the given packs, in display order (unknown packs are skipped). */
export function shapesInPacks(packs: readonly string[]): ShapeId[] {
  const wanted = new Set(packs);
  return packList.filter((p) => wanted.has(p.id)).flatMap((p) => p.shapes);
}

/** Ids of all tile shapes (quarter-turn / Truchet use), in display order. */
export function tileShapeIds(): ShapeId[] {
  return SHAPE_IDS.filter((id) => TILE_PACKS.has(packOf.get(id) as ShapePackId));
}

/** The pack a shape belongs to, or `undefined` for unknown ids. */
export function shapePackOf(id: string): ShapePackId | undefined {
  return packOf.get(id);
}
