/**
 * M4-AP02/AP03: Geometric Patterns (docs/TOOLS.md A1), the flagship tool.
 * A grid of tiles (uniform or recursively split) with shapes from the
 * shape library, coloured per tile or per shape layer, optionally as
 * outlines, with duotone accent layers.
 *
 * Tile editing (AP03): `tileOverrides` maps cell ids (see the engine:
 * `<row>-<col>` plus `.<quadrant>` per split level) to the changed fields
 * of that tile (shape, colour, rotation). The generic `regionEditor` hook
 * lets the editor shell offer click and keyboard editing without any tool
 * code in the shell. Overrides are ordinary params: undo, share links and
 * saved designs carry them. Their number is capped (`TILE_OVERRIDES_MAX`),
 * so a share link stays well under its size limit.
 */
import {
  GEOMETRIC_CELL_ID_PATTERN,
  GEOMETRIC_COLOR_MODES,
  GEOMETRIC_GRID_MODES,
  GEOMETRIC_MAX_COLUMNS,
  GEOMETRIC_MAX_DEPTH,
  GEOMETRIC_ROTATION_MODES,
  SHAPE_IDS,
  SHAPE_PACK_IDS,
  geometricGrid,
  geometricPatternSvg,
  geometricSeed,
  geometricTiles,
  isShapeId,
  randomPalette,
  shapesInPacks,
  type GeometricTile,
  type ShapeId,
} from "@musterli/engine";
import * as z from "zod";
import { SEED_AND_COLOR_ANIMATION } from "../animation";
import { colorSchema, visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineRegionEditor, defineTool } from "../registry";
import {
  SHAPE_OPTION_LABEL_KEYS,
  shapePackGroups,
  shapePackLabelKey,
  shapePreview,
} from "../shapes";
import type { Preset, PreviewRegion, RenderContext } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "geometric-patterns";

/** Pack choice: a library pack, or `custom` = the hand-picked `shapes`. */
export const GEOMETRIC_PACKS = [...SHAPE_PACK_IDS, "custom"] as const;
export type GeometricPack = (typeof GEOMETRIC_PACKS)[number];

/** Most hand-picked shapes. */
export const GEOMETRIC_SHAPES_MAX = 24;
/** Most edited tiles per design (keeps share links small). */
export const TILE_OVERRIDES_MAX = 128;

/** What one tile override may change. Strict: unknown fields are rejected. */
export const tileOverrideSchema = z.strictObject({
  shape: z.enum(SHAPE_IDS).optional(),
  color: colorSchema.optional(),
  rotation: z.int().min(0).max(359).optional(),
});

export type TileOverride = z.output<typeof tileOverrideSchema>;

/** Overrides by cell id; ids must look like cell ids, at most `TILE_OVERRIDES_MAX`. */
export const tileOverridesSchema = z
  .record(z.string().max(24).regex(GEOMETRIC_CELL_ID_PATTERN), tileOverrideSchema)
  .refine((r) => Object.keys(r).length <= TILE_OVERRIDES_MAX, {
    message: `At most ${TILE_OVERRIDES_MAX} edited tiles`,
  });

const schema = visualParamsSchema.extend({
  pack: z.enum(GEOMETRIC_PACKS),
  /** Hand-picked shapes, used when `pack` is `custom`. */
  shapes: z.array(z.enum(SHAPE_IDS)).min(1).max(GEOMETRIC_SHAPES_MAX),
  gridMode: z.enum(GEOMETRIC_GRID_MODES),
  /** Tiles across (dynamic: root cells across). */
  columns: z.int().min(1).max(GEOMETRIC_MAX_COLUMNS),
  /** Most split levels (dynamic). */
  depth: z.int().min(1).max(GEOMETRIC_MAX_DEPTH),
  /** Chance that a cell splits into four (dynamic). */
  splitChance: z.number().min(0).max(1),
  /** Margin around the shape, share of the tile. */
  padding: z.number().min(0).max(0.45),
  /** Space between tiles in px. */
  gap: z.int().min(0).max(40),
  rotationMode: z.enum(GEOMETRIC_ROTATION_MODES),
  colorMode: z.enum(GEOMETRIC_COLOR_MODES),
  /** Tiles get a background colour from the palette. */
  tileFill: z.boolean(),
  duotoneOpacity: z.number().min(0).max(1),
  strokeOnly: z.boolean(),
  /** Outline width in units of the 100-unit shape box. */
  strokeWidth: z.number().min(1).max(12),
  tileOverrides: tileOverridesSchema,
});

export type GeometricPatternsParams = z.output<typeof schema>;

const defaults: GeometricPatternsParams = {
  background: "#f4efe6",
  palette: ["#1d3557", "#e63946", "#f4a261", "#2a9d8f"],
  pack: "bauhaus",
  shapes: ["quarter-circle", "semicircle", "circle", "diagonal-half"],
  gridMode: "uniform",
  columns: 8,
  depth: 2,
  splitChance: 0.45,
  padding: 0,
  gap: 0,
  rotationMode: "quarter",
  colorMode: "tile",
  tileFill: true,
  duotoneOpacity: 0.5,
  strokeOnly: false,
  strokeWidth: 4,
  tileOverrides: {},
};

const preset = (
  id: string,
  params: Partial<GeometricPatternsParams>,
): Preset<GeometricPatternsParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** The shapes the params draw from (deduplicated, in order). */
export function geometricShapesOf(p: GeometricPatternsParams): ShapeId[] {
  const list = p.pack === "custom" ? p.shapes : shapesInPacks([p.pack]);
  return [...new Set(list)];
}

// ---------------------------------------------------------------------------
// Layout (shared by render, tile and region editor)
// ---------------------------------------------------------------------------

interface Built {
  tiles: GeometricTile[];
  byId: Map<string, GeometricTile>;
}

/** Last layouts by params object; the editor asks several times per change. */
const builtCache = new WeakMap<object, { key: string; built: Built }>();

function build(p: GeometricPatternsParams, ctx: RenderContext): Built {
  const key = `${ctx.seed}:${ctx.width}x${ctx.height}`;
  const hit = builtCache.get(p);
  if (hit?.key === key) {
    // Keep the rng in step with a fresh render: the layout takes exactly one draw.
    ctx.rng.next();
    return hit.built;
  }
  const seed = geometricSeed(ctx.rng);
  const grid = geometricGrid({
    width: ctx.width,
    height: ctx.height,
    gridMode: p.gridMode,
    columns: p.columns,
    depth: p.depth,
    splitChance: p.splitChance,
    seed,
  });
  const tiles = geometricTiles({
    cells: grid.cells,
    seed,
    shapes: geometricShapesOf(p),
    palette: p.palette,
    colorMode: p.colorMode,
    rotationMode: p.rotationMode,
    tileFill: p.tileFill,
    overrides: p.tileOverrides,
  });
  const built = { tiles, byId: new Map(tiles.map((t) => [t.id, t])) };
  builtCache.set(p, { key, built });
  return built;
}

function renderSvg(p: GeometricPatternsParams, ctx: RenderContext): string {
  return geometricPatternSvg({
    width: ctx.width,
    height: ctx.height,
    tiles: build(p, ctx).tiles,
    background: p.background,
    padding: p.padding,
    gap: p.gap,
    duotoneOpacity: p.duotoneOpacity,
    strokeOnly: p.strokeOnly,
    strokeWidth: p.strokeWidth,
  });
}

// ---------------------------------------------------------------------------
// Tile editing (region editor)
// ---------------------------------------------------------------------------

/** Values of one tile in the edit popover. */
export type TileValues = {
  shape: ShapeId;
  color: string;
  rotation: number;
};

const tileFormSchema = z.object({
  shape: z.enum(SHAPE_IDS),
  color: colorSchema,
  rotation: z.int().min(0).max(359),
});

/** Part label of a split cell: quadrant digits 1-based, e.g. "3.1". */
function partOf(id: string): string {
  return id
    .split(".")
    .slice(1)
    .map((q) => String(Number(q) + 1))
    .join(".");
}

function regionOf(t: GeometricTile): PreviewRegion {
  const values = { row: t.row + 1, col: t.col + 1 };
  return {
    id: t.id,
    x: t.x,
    y: t.y,
    width: t.width,
    height: t.height,
    labelKey: t.level === 0 ? `tools.${ID}.tile.cell` : `tools.${ID}.tile.cellPart`,
    labelValues: t.level === 0 ? values : { ...values, part: partOf(t.id) },
    edited: t.edited,
  };
}

const ownOverride = (p: GeometricPatternsParams, id: string): TileOverride | undefined =>
  Object.prototype.hasOwnProperty.call(p.tileOverrides, id) ? p.tileOverrides[id] : undefined;

const tilePatchSchema = tileOverrideSchema.partial();

const regionEditor = defineRegionEditor<GeometricPatternsParams, TileValues>({
  titleKey: `tools.${ID}.tile.title`,
  schema: tileFormSchema,
  controls: {
    order: ["shape", "color", "rotation"],
    params: {
      shape: {
        kind: "thumbnails",
        labelKey: `tools.${ID}.tile.shape`,
        optionLabelKeys: SHAPE_OPTION_LABEL_KEYS,
        optionGroups: shapePackGroups(),
        optionPreview: (value, v, root) =>
          shapePreview(
            value,
            v.color,
            typeof root.background === "string" ? root.background : "transparent",
          ),
        lockable: false,
      },
      color: { kind: "color", labelKey: `tools.${ID}.tile.color`, lockable: false },
      rotation: {
        kind: "angle",
        labelKey: `tools.${ID}.tile.rotation`,
        step: 15,
        unit: "°",
        lockable: false,
      },
    },
  },
  regions: (p, ctx) => build(p, ctx).tiles.map(regionOf),
  values(p, id, ctx) {
    const t = build(p, ctx).byId.get(id);
    if (!t) return undefined;
    return { shape: isShapeId(t.shape) ? t.shape : "circle", color: t.color, rotation: t.rotation };
  },
  set(p, id, patch, ctx) {
    if (!build(p, ctx).byId.has(id)) return p;
    const parsed = tilePatchSchema.safeParse(patch);
    if (!parsed.success) return p;
    const existing = ownOverride(p, id);
    if (!existing && Object.keys(p.tileOverrides).length >= TILE_OVERRIDES_MAX) return p;
    const changes = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as TileOverride;
    if (Object.keys(changes).length === 0) return p;
    return { ...p, tileOverrides: { ...p.tileOverrides, [id]: { ...existing, ...changes } } };
  },
  reset(p, id) {
    if (id === null)
      return Object.keys(p.tileOverrides).length === 0 ? p : { ...p, tileOverrides: {} };
    if (!ownOverride(p, id)) return p;
    const next = Object.fromEntries(Object.entries(p.tileOverrides).filter(([key]) => key !== id));
    return { ...p, tileOverrides: next };
  },
  editedCount: (p) => Object.keys(p.tileOverrides).length,
  maxEdited: TILE_OVERRIDES_MAX,
});

// ---------------------------------------------------------------------------
// Controls and randomize
// ---------------------------------------------------------------------------

const PACK_LABEL_KEYS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(SHAPE_PACK_IDS.map((id) => [id, shapePackLabelKey(id)])),
  custom: `tools.${ID}.params.pack.options.custom`,
};

const firstColor = (p: GeometricPatternsParams): string => p.palette[0] ?? "#000000";

const isDynamic = (p: GeometricPatternsParams): boolean => p.gridMode === "dynamic";

export const geometricPatternsTool = defineTool({
  id: ID,
  version: 1,
  category: ["patterns", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("atelier", {}),
    preset("truchet-maze", {
      background: "#fdf6e3",
      palette: ["#264653", "#2a9d8f"],
      pack: "custom",
      shapes: ["truchet-arcs"],
      columns: 12,
      colorMode: "layer",
      tileFill: false,
      rotationMode: "quarter",
    }),
    preset("mosaic", {
      background: "#fefae0",
      palette: ["#283618", "#606c38", "#dda15e", "#bc6c25", "#fefae0"],
      pack: "geometric",
      gridMode: "dynamic",
      columns: 6,
      depth: 3,
      splitChance: 0.5,
      padding: 0.08,
      gap: 2,
      rotationMode: "quarter",
      duotoneOpacity: 0.55,
    }),
    preset("night-garden", {
      background: "#0b132b",
      palette: ["#5bc0be", "#f6ae2d", "#f26419", "#e0fbfc"],
      pack: "nature",
      gridMode: "dynamic",
      columns: 5,
      depth: 2,
      splitChance: 0.55,
      padding: 0.14,
      tileFill: false,
      rotationMode: "none",
      duotoneOpacity: 0.45,
    }),
    preset("blueprint", {
      background: "#1d4e89",
      palette: ["#f1faee", "#a8dadc"],
      pack: "basics",
      columns: 9,
      padding: 0.16,
      rotationMode: "free",
      colorMode: "layer",
      tileFill: false,
      strokeOnly: true,
      strokeWidth: 3,
      duotoneOpacity: 0.7,
    }),
    preset("patchwork", {
      background: "#fff8f0",
      palette: ["#9e2a2b", "#e09f3e", "#335c67", "#fff3b0"],
      pack: "tiles",
      columns: 10,
      gap: 0,
      rotationMode: "quarter",
      tileFill: true,
    }),
    preset("shooting-stars", {
      background: "#22223b",
      palette: ["#f2e9e4", "#c9ada7", "#9a8c98"],
      pack: "stars",
      gridMode: "dynamic",
      columns: 7,
      depth: 2,
      splitChance: 0.4,
      padding: 0.18,
      rotationMode: "free",
      tileFill: false,
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.shape, COMMON_GROUPS.layout, COMMON_GROUPS.colors],
    order: [
      "pack",
      "shapes",
      "gridMode",
      "columns",
      "depth",
      "splitChance",
      "rotationMode",
      "padding",
      "gap",
      "colorMode",
      "tileFill",
      "duotoneOpacity",
      "strokeOnly",
      "strokeWidth",
      "palette",
      "background",
      "tileOverrides",
    ],
    params: {
      pack: { group: "shape", kind: "select", optionLabelKeys: PACK_LABEL_KEYS },
      shapes: {
        group: "shape",
        kind: "thumbnails",
        optionLabelKeys: SHAPE_OPTION_LABEL_KEYS,
        optionGroups: shapePackGroups(),
        optionPreview: (value, p) => shapePreview(value, firstColor(p), p.background),
        visibleWhen: (p) => p.pack === "custom",
      },
      gridMode: {
        group: "layout",
        optionLabelKeys: optionLabels(ID, "gridMode", GEOMETRIC_GRID_MODES),
      },
      columns: { group: "layout", step: 1 },
      depth: { group: "layout", step: 1, visibleWhen: isDynamic },
      splitChance: { group: "layout", step: 0.01, visibleWhen: isDynamic },
      rotationMode: {
        group: "layout",
        optionLabelKeys: optionLabels(ID, "rotationMode", GEOMETRIC_ROTATION_MODES),
      },
      padding: { group: "layout", step: 0.01 },
      gap: { group: "layout", step: 1, unit: "px" },
      colorMode: {
        group: "colors",
        optionLabelKeys: optionLabels(ID, "colorMode", GEOMETRIC_COLOR_MODES),
      },
      tileFill: { group: "colors" },
      duotoneOpacity: { group: "colors", step: 0.01 },
      strokeOnly: { group: "colors" },
      strokeWidth: { group: "colors", step: 0.5, visibleWhen: (p) => p.strokeOnly },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
      tileOverrides: { kind: "hidden", lockable: false },
    },
  },
  randomize(rng, current, locks) {
    const colors = randomPalette(rng, rng.int(3, 6));
    const background = colors.pop() ?? current.background;
    // A hand-picked shape list is the user's own work: Space keeps it.
    const pack = current.pack === "custom" ? "custom" : rng.pick(SHAPE_PACK_IDS);
    const tiles = pack === "tiles";
    const gridMode = rng.bool(0.4) ? "dynamic" : "uniform";
    const next: GeometricPatternsParams = {
      background: rng.bool(0.4) ? current.background : background,
      palette: colors.length >= 2 ? colors : randomPalette(rng, 3),
      pack,
      shapes: current.shapes,
      gridMode,
      columns: gridMode === "dynamic" ? rng.int(3, 8) : rng.int(5, 14),
      depth: rng.int(1, 3),
      splitChance: roundTo(rng.float(0.3, 0.7), 2),
      padding: tiles ? 0 : roundTo(rng.float(0, 0.2), 2),
      gap: rng.bool(0.7) ? 0 : rng.int(2, 8),
      rotationMode: tiles ? "quarter" : rng.pick(GEOMETRIC_ROTATION_MODES),
      colorMode: rng.bool(0.75) ? "tile" : "layer",
      tileFill: tiles ? true : rng.bool(0.5),
      duotoneOpacity: roundTo(rng.float(0.3, 0.8), 2),
      strokeOnly: !tiles && rng.bool(0.15),
      strokeWidth: rng.int(2, 6),
      // Edited tiles are manual work: a new variant keeps them.
      tileOverrides: current.tileOverrides,
    };
    return keepLocked(next, current, locks);
  },
  render: { kind: "svg", render: renderSvg },
  tile: {
    // Whole cells always fill the canvas, so the design is its own repeat tile.
    render: (p, ctx) => ({ svg: renderSvg(p, ctx), width: ctx.width, height: ctx.height }),
  },
  regionEditor,
  exports: ["svg", "css", "png", "jpg", "webp"],
  // GIF: new seeds and palette cycling. Edited tiles keep their own colours.
  animation: SEED_AND_COLOR_ANIMATION,
});
