/**
 * M4-AP06: Bento grid (docs/TOOLS.md J3). Rounded tiles of different sizes
 * fill a grid without gaps; Space rolls a new arrangement. The layout comes
 * from `layoutSeed`, so locking it keeps the arrangement while colours
 * change. No free layout editor (PRODUCT.md non-goals): locks and re-roll only.
 *
 * M4-AP06b: content per tile (title, subtitle, icon, own graphic, background
 * picture) and a picture behind the grid, edited through the generic
 * `regionEditor` (click a tile in the preview, or the keyboard picker).
 *
 * Tile keys: `t<n>`, n = 1-based position of the tile in reading order
 * (row of its top-left cell, then column), as `bentoLayout` returns tiles.
 * For a given layout the keys are stable (colours, gap, radius, size and
 * seed do not move them). When the layout changes (new `layoutSeed`,
 * columns, rows, tile count, spans), content stays with its number: the
 * first tile keeps the first tile's content, and so on. Content whose
 * number is beyond the new tile count stays stored (and counts towards the
 * limit) but is not drawn; it shows again when the layout has that many
 * tiles. "Reset all" removes it.
 *
 * Text and icons (`tileContent`) are ordinary params: undo, share links,
 * saved designs. Uploaded pictures (`tileImages`, `backgroundImage`) are
 * local params: saved designs keep them on the device, share links never
 * carry them. Code exports reference pictures by placeholder file names.
 */
import {
  BENTO_CONTENTS,
  BENTO_FILLS,
  IMAGE_POSITIONS,
  SHAPE_IDS,
  shapePath,
  tileRect,
  bentoHtml,
  bentoLayout,
  bentoSvg,
  bentoTailwind,
  createRng,
  deriveSeed,
  paintTiles,
  randomPalette,
  type BentoCodeOptions,
  type BentoExtras,
  type BentoPicture,
  type BentoTile,
  type BentoUserContent,
  type PaintedTile,
} from "@musterli/engine";
import * as z from "zod";
import {
  IMAGE_ASSET_MAX_RASTER_LENGTH,
  PHOTO_ASSET_RASTER_MAX_EDGE,
  assetPlaceholderName,
  backgroundSchema,
  imageAssetSchema,
  paletteSchema,
  photoAssetSchema,
  type ImageAsset,
} from "../common";
import { keepLocked } from "../randomize";
import { SEED_AND_COLOR_ANIMATION } from "../animation";
import { defineRegionEditor, defineTool } from "../registry";
import { SHAPE_OPTION_LABEL_KEYS, shapePackGroups, shapePreview } from "../shapes";
import { imageAssetHref } from "../svg-asset";
import type { Preset, PreviewRegion, RenderContext } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "bento-grid";

/** Largest layout seed (a plain positive integer keeps share links short). */
export const BENTO_LAYOUT_SEED_MAX = 999_999;

/** Viewport width below which the code exports switch to the narrow layout. */
const BREAKPOINT = 768;

/** Most tiles a layout can have (8 × 8), and so the most tiles with content. */
export const BENTO_TILES_MAX = 64;
/** Most tiles with uploaded pictures (graphic or background). */
export const BENTO_TILE_IMAGES_MAX = 24;
/** Most characters of all uploaded tile pictures together (about 9 MB of base64). */
export const BENTO_TILE_IMAGES_BUDGET = 2 * IMAGE_ASSET_MAX_RASTER_LENGTH;
export const BENTO_TITLE_MAX = 80;
export const BENTO_SUBTITLE_MAX = 160;

/** `t1` to `t64`: the tile's 1-based position in reading order. */
export const BENTO_TILE_KEY_PATTERN = /^t(?:[1-9]|[1-5][0-9]|6[0-4])$/;
export const bentoTileKey = (index: number): string => `t${index + 1}`;
const tileKeySchema = z.string().max(3).regex(BENTO_TILE_KEY_PATTERN);

/** Text and icon of one tile (shareable). Strict: unknown fields are rejected. */
export const tileContentSchema = z.strictObject({
  title: z.string().max(BENTO_TITLE_MAX),
  subtitle: z.string().max(BENTO_SUBTITLE_MAX),
  showIcon: z.boolean(),
  icon: z.enum(SHAPE_IDS),
  graphicPosition: z.enum(IMAGE_POSITIONS),
  /** Size of the own graphic in percent of the free area. */
  graphicSize: z.int().min(20).max(100),
});
export type TileContent = z.output<typeof tileContentSchema>;

/** Uploaded pictures of one tile (local only). */
export const tileImagesSchema = z.strictObject({
  graphic: imageAssetSchema.nullable(),
  background: imageAssetSchema.nullable(),
});
export type TileImages = z.output<typeof tileImagesSchema>;

const assetLength = (a: ImageAsset | null): number =>
  a === null ? 0 : a.kind === "svg" ? a.svg.length : a.href.length;

export const tileContentRecordSchema = z
  .record(tileKeySchema, tileContentSchema)
  .refine((r) => Object.keys(r).length <= BENTO_TILES_MAX, {
    message: `At most ${BENTO_TILES_MAX} tiles with content`,
  });

export const tileImagesRecordSchema = z
  .record(tileKeySchema, tileImagesSchema)
  .refine((r) => Object.keys(r).length <= BENTO_TILE_IMAGES_MAX, {
    message: `At most ${BENTO_TILE_IMAGES_MAX} tiles with pictures`,
  })
  .refine(
    (r) =>
      Object.values(r).reduce(
        (n, v) => n + assetLength(v.graphic) + assetLength(v.background),
        0,
      ) <= BENTO_TILE_IMAGES_BUDGET,
    { message: "Tile pictures too large together" },
  );

const EMPTY_CONTENT: TileContent = {
  title: "",
  subtitle: "",
  showIcon: false,
  icon: "star",
  graphicPosition: "center",
  graphicSize: 100,
};
const EMPTY_IMAGES: TileImages = { graphic: null, background: null };

const schema = z.object({
  columns: z.int().min(2).max(8),
  rows: z.int().min(2).max(8),
  tiles: z.int().min(1).max(64),
  minSpan: z.int().min(1).max(4),
  maxSpan: z.int().min(1).max(8),
  layoutSeed: z.int().min(0).max(BENTO_LAYOUT_SEED_MAX),
  gap: z.int().min(0).max(64),
  radius: z.int().min(0).max(64),
  padding: z.int().min(0).max(128),
  fill: z.enum(BENTO_FILLS),
  palette: paletteSchema,
  background: backgroundSchema,
  content: z.enum(BENTO_CONTENTS),
  breakpointColumns: z.int().min(1).max(4),
  /** The user's text and icons per tile key; see the module comment. */
  tileContent: tileContentRecordSchema,
  /** The user's pictures per tile key. Local only. */
  tileImages: tileImagesRecordSchema,
  /** Picture behind the whole grid (cover). Local only. */
  backgroundImage: photoAssetSchema.nullable(),
});

export type BentoGridParams = z.output<typeof schema>;

const defaults: BentoGridParams = {
  columns: 4,
  rows: 3,
  tiles: 6,
  minSpan: 1,
  maxSpan: 3,
  layoutSeed: 7,
  gap: 16,
  radius: 24,
  padding: 24,
  fill: "palette-random",
  palette: ["#e0e7ff", "#c7d2fe", "#fbcfe8", "#fde68a", "#bbf7d0"],
  background: "#f8fafc",
  content: "mixed",
  breakpointColumns: 2,
  tileContent: {},
  tileImages: {},
  backgroundImage: null,
};

/** Params added in M4-AP06b (links and designs from before lack them). */
const ADDED_IN_AP06B = ["tileContent", "tileImages", "backgroundImage"] as const;

const preset = (id: string, params: Partial<BentoGridParams>): Preset<BentoGridParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** The arrangement: depends on the layout params only (cached per params object). */
const layouts = new WeakMap<BentoGridParams, readonly BentoTile[]>();
function layoutOf(p: BentoGridParams): readonly BentoTile[] {
  let tiles = layouts.get(p);
  if (!tiles) {
    tiles = bentoLayout(createRng(p.layoutSeed), {
      columns: p.columns,
      rows: p.rows,
      tiles: p.tiles,
      minSpan: p.minSpan,
      maxSpan: Math.max(p.minSpan, p.maxSpan),
    }).tiles;
    layouts.set(p, tiles);
  }
  return tiles;
}

function painted(p: BentoGridParams, ctx: RenderContext): PaintedTile[] {
  // Colours and placeholders follow the design seed, the arrangement the layout seed.
  const rng = createRng(deriveSeed(ctx.seed, "bento-paint"));
  return paintTiles(rng, layoutOf(p), p.palette, p.fill, p.content);
}

function picture(asset: ImageAsset | null, placeholder: string): BentoPicture | undefined {
  if (!asset) return undefined;
  const href = imageAssetHref(asset);
  return href ? { href, codeUrl: assetPlaceholderName(placeholder, asset) } : undefined;
}

/** The user's content per tile (reading order) for the engine; `undefined` without any. */
export function bentoExtras(p: BentoGridParams, count: number): BentoExtras | undefined {
  const hasTiles = Object.keys(p.tileContent).length > 0 || Object.keys(p.tileImages).length > 0;
  if (!hasTiles && !p.backgroundImage) return undefined;
  const contents: (BentoUserContent | undefined)[] = [];
  for (let i = 0; i < count; i++) {
    const key = bentoTileKey(i);
    const c = p.tileContent[key];
    const im = p.tileImages[key];
    if (!c && !im) {
      contents.push(undefined);
      continue;
    }
    const content = c ?? EMPTY_CONTENT;
    const graphic = picture(im?.graphic ?? null, `tile-${i + 1}-graphic`);
    const background = picture(im?.background ?? null, `tile-${i + 1}-background`);
    contents.push({
      title: content.title,
      subtitle: content.subtitle,
      ...(content.showIcon ? { icon: shapePath(content.icon) } : {}),
      ...(graphic
        ? { graphic: { ...graphic, position: content.graphicPosition, size: content.graphicSize } }
        : {}),
      ...(background ? { background } : {}),
    });
  }
  const backgroundImage = picture(p.backgroundImage, "bento-background");
  return { contents, ...(backgroundImage ? { backgroundImage } : {}) };
}

// ---------------------------------------------------------------------------
// Tile editor (generic region editor of the shell)
// ---------------------------------------------------------------------------

/** Values of the tile popover: text and icon plus the local pictures. */
const tileFormSchema = tileContentSchema.extend({
  graphic: imageAssetSchema.nullable(),
  background: imageAssetSchema.nullable(),
});
type TileValues = z.output<typeof tileFormSchema>;
const tilePatchSchema = tileFormSchema.partial();

/** The record without one key. */
const without = <T>(r: Readonly<Record<string, T>>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));

/** Own keys only: `"toString" in {}` is true. */
const has = (r: object, key: string): boolean => Object.prototype.hasOwnProperty.call(r, key);

const same = (a: object, b: object): boolean =>
  Object.entries(a).every(([k, v]) => (b as Record<string, unknown>)[k] === v);

function tileRegion(
  p: BentoGridParams,
  t: BentoTile,
  i: number,
  ctx: RenderContext,
): PreviewRegion {
  const key = bentoTileKey(i);
  const r = tileRect(t, codeOptions(p, ctx));
  return {
    id: key,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    labelKey: `tools.${ID}.tile.label`,
    labelValues: { index: i + 1, cols: t.colSpan, rows: t.rowSpan },
    edited: has(p.tileContent, key) || has(p.tileImages, key),
  };
}

const editedKeys = (p: BentoGridParams): Set<string> =>
  new Set([...Object.keys(p.tileContent), ...Object.keys(p.tileImages)]);

const regionEditor = defineRegionEditor<BentoGridParams, TileValues>({
  titleKey: `tools.${ID}.tile.title`,
  schema: tileFormSchema,
  controls: {
    order: [
      "title",
      "subtitle",
      "showIcon",
      "icon",
      "graphic",
      "graphicPosition",
      "graphicSize",
      "background",
    ],
    params: {
      title: { labelKey: `tools.${ID}.tile.fields.title`, lockable: false },
      subtitle: { labelKey: `tools.${ID}.tile.fields.subtitle`, lockable: false },
      showIcon: { labelKey: `tools.${ID}.tile.fields.showIcon`, lockable: false },
      icon: {
        kind: "thumbnails",
        labelKey: `tools.${ID}.tile.fields.icon`,
        optionLabelKeys: SHAPE_OPTION_LABEL_KEYS,
        optionGroups: shapePackGroups(),
        optionPreview: (value) => shapePreview(value, "#334155", "#f1f5f9"),
        visibleWhen: (v) => v.showIcon,
        lockable: false,
      },
      graphic: {
        kind: "image",
        labelKey: `tools.${ID}.tile.fields.graphic`,
        lockable: false,
      },
      graphicPosition: {
        labelKey: `tools.${ID}.tile.fields.graphicPosition`,
        optionLabelKeys: optionLabels(ID, "imagePosition", IMAGE_POSITIONS),
        visibleWhen: (v) => v.graphic !== null,
        lockable: false,
      },
      graphicSize: {
        labelKey: `tools.${ID}.tile.fields.graphicSize`,
        unit: "%",
        step: 5,
        visibleWhen: (v) => v.graphic !== null,
        lockable: false,
      },
      background: {
        kind: "image",
        labelKey: `tools.${ID}.tile.fields.background`,
        lockable: false,
        // Two upload fields in the popover: a pasted picture goes to the graphic.
        image: { paste: false },
      },
    },
  },
  regions: (p, ctx) => layoutOf(p).map((t, i) => tileRegion(p, t, i, ctx)),
  values(p, id) {
    const index = Number(id.slice(1)) - 1;
    if (!BENTO_TILE_KEY_PATTERN.test(id) || index >= layoutOf(p).length) return undefined;
    return { ...EMPTY_CONTENT, ...p.tileContent[id], ...EMPTY_IMAGES, ...p.tileImages[id] };
  },
  set(p, id, patch, ctx) {
    const current = regionEditor.values(p, id, ctx) as TileValues | undefined;
    if (!current) return p;
    const parsed = tilePatchSchema.safeParse(patch);
    if (!parsed.success) return p;
    const changes = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    );
    const next = { ...current, ...changes } as TileValues;
    const { graphic, background, ...text } = next;
    const content: TileContent = text;
    const images: TileImages = { graphic, background };
    const keys = editedKeys(p);
    if (!keys.has(id) && keys.size >= BENTO_TILES_MAX) return p;

    const tileContent = same(content, EMPTY_CONTENT)
      ? without(p.tileContent, id)
      : { ...p.tileContent, [id]: content };
    const tileImages =
      graphic === null && background === null
        ? without(p.tileImages, id)
        : { ...p.tileImages, [id]: images };

    const contentOk = tileContentRecordSchema.safeParse(tileContent);
    const imagesOk = tileImagesRecordSchema.safeParse(tileImages);
    if (!contentOk.success || !imagesOk.success) return p;
    return { ...p, tileContent: contentOk.data, tileImages: imagesOk.data };
  },
  reset(p, id) {
    if (id === null) {
      if (editedKeys(p).size === 0) return p;
      return { ...p, tileContent: {}, tileImages: {} };
    }
    if (!has(p.tileContent, id) && !has(p.tileImages, id)) return p;
    return { ...p, tileContent: without(p.tileContent, id), tileImages: without(p.tileImages, id) };
  },
  editedCount: (p) => editedKeys(p).size,
  maxEdited: BENTO_TILES_MAX,
});

function codeOptions(p: BentoGridParams, ctx: RenderContext): BentoCodeOptions {
  return {
    width: ctx.width,
    height: ctx.height,
    columns: p.columns,
    rows: p.rows,
    gap: p.gap,
    padding: p.padding,
    radius: p.radius,
    background: p.background,
    breakpointColumns: p.breakpointColumns,
    breakpoint: BREAKPOINT,
  };
}

export const bentoGridTool = defineTool({
  id: ID,
  version: 1,
  category: ["css-effects", "backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1200, height: 800 },
  localParams: ["tileImages", "backgroundImage"],
  // "Weiterverwenden in": a design of another tool becomes the grid background.
  imageTargets: [{ param: "backgroundImage" }],
  migrateParams(raw) {
    if (ADDED_IN_AP06B.every((key) => key in raw)) return raw;
    const out: Record<string, unknown> = { ...raw };
    for (const key of ADDED_IN_AP06B) if (!(key in out)) out[key] = defaults[key];
    return out;
  },
  regionEditor,
  presets: [
    preset("feature-section", {
      columns: 3,
      rows: 2,
      tiles: 4,
      maxSpan: 2,
      layoutSeed: 3,
      fill: "single",
      palette: ["#f1f5f9", "#e2e8f0"],
      background: "#ffffff",
      content: "title",
      radius: 20,
    }),
    preset("portfolio", {
      columns: 4,
      rows: 4,
      tiles: 7,
      maxSpan: 3,
      layoutSeed: 21,
      palette: ["#fca5a5", "#fdba74", "#fcd34d", "#86efac", "#93c5fd", "#c4b5fd"],
      background: "#fffbeb",
      content: "empty",
      gap: 12,
      radius: 16,
    }),
    preset("dashboard", {
      columns: 6,
      rows: 4,
      tiles: 9,
      minSpan: 1,
      maxSpan: 4,
      layoutSeed: 42,
      fill: "palette-order",
      palette: ["#1e293b", "#334155", "#0f766e"],
      background: "#020617",
      content: "lines",
      gap: 12,
      radius: 14,
      padding: 20,
    }),
    preset("story", {
      columns: 2,
      rows: 5,
      tiles: 5,
      maxSpan: 2,
      layoutSeed: 11,
      palette: ["#fecdd3", "#fda4af", "#fb7185", "#ffe4e6"],
      background: "#fff1f2",
      content: "mixed",
      breakpointColumns: 1,
    }),
    preset("mosaic", {
      columns: 8,
      rows: 6,
      tiles: 20,
      minSpan: 1,
      maxSpan: 3,
      layoutSeed: 5,
      palette: ["#0ea5e9", "#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7"],
      background: "#ffffff",
      content: "empty",
      gap: 8,
      radius: 10,
      padding: 16,
    }),
    preset("calm", {
      columns: 4,
      rows: 3,
      tiles: 5,
      minSpan: 1,
      maxSpan: 2,
      layoutSeed: 13,
      fill: "palette-order",
      palette: ["#e7e5e4", "#d6d3d1", "#a8a29e"],
      background: "#fafaf9",
      content: "icon",
      gap: 20,
      radius: 32,
      padding: 32,
    }),
    preset("blocks", {
      columns: 6,
      rows: 6,
      tiles: 8,
      minSpan: 2,
      maxSpan: 4,
      layoutSeed: 8,
      palette: ["#312e81", "#4338ca", "#6366f1", "#a5b4fc"],
      background: "#1e1b4b",
      content: "title",
      gap: 10,
      radius: 18,
    }),
    preset("landing", {
      columns: 4,
      rows: 3,
      tiles: 5,
      maxSpan: 2,
      layoutSeed: 17,
      fill: "palette-order",
      palette: ["#4f46e5", "#e0e7ff", "#c7d2fe", "#eef2ff"],
      background: "#ffffff",
      content: "mixed",
      radius: 28,
    }),
    preset("night", {
      columns: 4,
      rows: 4,
      tiles: 8,
      maxSpan: 2,
      layoutSeed: 33,
      palette: ["#18181b", "#27272a", "#3f3f46"],
      background: "#09090b",
      content: "icon",
      gap: 10,
      radius: 18,
    }),
    preset("earthy", {
      columns: 3,
      rows: 3,
      tiles: 5,
      maxSpan: 2,
      layoutSeed: 8,
      palette: ["#ddbea9", "#cb997e", "#b7b7a4", "#a5a58d", "#ffe8d6"],
      background: "#fefae0",
      content: "title",
      gap: 14,
      radius: 22,
    }),
    preset("gallery", {
      columns: 5,
      rows: 4,
      tiles: 10,
      minSpan: 1,
      maxSpan: 2,
      layoutSeed: 64,
      fill: "single",
      palette: ["#cbd5e1", "#94a3b8"],
      background: "#ffffff",
      content: "empty",
      gap: 6,
      radius: 4,
      padding: 12,
    }),
  ],
  controls: {
    groups: [
      { id: "grid", labelKey: `tools.${ID}.groups.grid` },
      COMMON_GROUPS.colors,
      { id: "tiles", labelKey: `tools.${ID}.groups.tiles` },
    ],
    order: [
      "layoutSeed",
      "columns",
      "rows",
      "tiles",
      "minSpan",
      "maxSpan",
      "breakpointColumns",
      "palette",
      "fill",
      "background",
      "backgroundImage",
      "content",
      "gap",
      "radius",
      "padding",
    ],
    params: {
      layoutSeed: {
        group: "grid",
        kind: "number",
        descriptionKey: `tools.${ID}.params.layoutSeed.description`,
      },
      columns: { group: "grid" },
      rows: { group: "grid" },
      tiles: { group: "grid" },
      minSpan: { group: "grid", advanced: true },
      maxSpan: { group: "grid", advanced: true },
      breakpointColumns: {
        group: "grid",
        advanced: true,
        descriptionKey: `tools.${ID}.params.breakpointColumns.description`,
      },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      fill: { group: "colors", optionLabelKeys: optionLabels(ID, "fill", BENTO_FILLS) },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
      backgroundImage: {
        group: "colors",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.backgroundImage.description`,
        image: { maxEdge: PHOTO_ASSET_RASTER_MAX_EDGE, photo: true },
      },
      tileContent: { kind: "hidden" },
      tileImages: { kind: "hidden" },
      content: { group: "tiles", optionLabelKeys: optionLabels(ID, "content", BENTO_CONTENTS) },
      gap: { group: "tiles", unit: "px" },
      radius: { group: "tiles", unit: "px" },
      padding: { group: "tiles", unit: "px" },
    },
  },
  randomize(rng, current, locks) {
    const next: BentoGridParams = {
      ...current,
      layoutSeed: rng.int(0, BENTO_LAYOUT_SEED_MAX),
      palette: randomPalette(rng, rng.int(3, 6)),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, ctx) {
      const tiles = painted(p, ctx);
      return bentoSvg(tiles, codeOptions(p, ctx), bentoExtras(p, tiles.length));
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  animation: SEED_AND_COLOR_ANIMATION,
  extraExports: [
    {
      id: "css-grid",
      labelKey: EXTRA_EXPORT_LABELS.cssGrid,
      language: "html",
      render(p, ctx) {
        const tiles = painted(p, ctx);
        return bentoHtml(tiles, codeOptions(p, ctx), bentoExtras(p, tiles.length));
      },
    },
    {
      id: "tailwind",
      labelKey: EXTRA_EXPORT_LABELS.tailwind,
      language: "html",
      render(p, ctx) {
        const tiles = painted(p, ctx);
        return bentoTailwind(tiles, codeOptions(p, ctx), bentoExtras(p, tiles.length));
      },
    },
  ],
});
