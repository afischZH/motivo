/**
 * M4-AP06: Bento grid (docs/TOOLS.md J3). Rounded tiles of different sizes
 * fill a grid without gaps; Space rolls a new arrangement. The layout comes
 * from `layoutSeed`, so locking it keeps the arrangement while colours
 * change. No free layout editor (PRODUCT.md non-goals): locks and re-roll only.
 */
import {
  BENTO_CONTENTS,
  BENTO_FILLS,
  bentoHtml,
  bentoLayout,
  bentoSvg,
  bentoTailwind,
  createRng,
  deriveSeed,
  paintTiles,
  randomPalette,
  type BentoCodeOptions,
  type PaintedTile,
} from "@musterli/engine";
import * as z from "zod";
import { backgroundSchema, paletteSchema } from "../common";
import { keepLocked } from "../randomize";
import { SEED_AND_COLOR_ANIMATION } from "../animation";
import { defineTool } from "../registry";
import type { Preset, RenderContext } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "bento-grid";

/** Largest layout seed (a plain positive integer keeps share links short). */
export const BENTO_LAYOUT_SEED_MAX = 999_999;

/** Viewport width below which the code exports switch to the narrow layout. */
const BREAKPOINT = 768;

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
};

const preset = (id: string, params: Partial<BentoGridParams>): Preset<BentoGridParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

function painted(p: BentoGridParams, ctx: RenderContext): PaintedTile[] {
  const layout = bentoLayout(createRng(p.layoutSeed), {
    columns: p.columns,
    rows: p.rows,
    tiles: p.tiles,
    minSpan: p.minSpan,
    maxSpan: Math.max(p.minSpan, p.maxSpan),
  });
  // Colours and placeholders follow the design seed, the arrangement the layout seed.
  const rng = createRng(deriveSeed(ctx.seed, "bento-paint"));
  return paintTiles(rng, layout.tiles, p.palette, p.fill, p.content);
}

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
      return bentoSvg(painted(p, ctx), codeOptions(p, ctx));
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
        return bentoHtml(painted(p, ctx), codeOptions(p, ctx));
      },
    },
    {
      id: "tailwind",
      labelKey: EXTRA_EXPORT_LABELS.tailwind,
      language: "html",
      render(p, ctx) {
        return bentoTailwind(painted(p, ctx), codeOptions(p, ctx));
      },
    },
  ],
});
