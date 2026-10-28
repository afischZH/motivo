/**
 * M4b-AP02: Terrazzo (docs/TOOLS.md K5). Stone chips in two or three size
 * classes on a base colour, placed without overlap, with speckles and grain.
 * Seamless by default: the chips wrap across the tile edges, the canvas
 * repeats the tile, and CSS and the PNG tile export use the same tile.
 */
import {
  TERRAZZO_SHAPES,
  randomPalette,
  terrazzoLayout,
  terrazzoSvg,
  terrazzoTileSvg,
  type TerrazzoLayout,
} from "@musterli/engine";
import * as z from "zod";
import { TRANSPARENT, visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { SEED_AND_COLOR_ANIMATION } from "../animation";
import { defineTool } from "../registry";
import type { Preset, RenderContext } from "../types";
import { gradientGrain } from "./grain";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "terrazzo";

const schema = visualParamsSchema.extend({
  /** Repeat a square tile whose chips wrap across its edges. */
  seamless: z.boolean(),
  /** Edge of the repeat tile in px. */
  tileSize: z.int().min(160).max(1600),
  /** Radius of the largest chips in px. */
  chipSize: z.number().min(4).max(120),
  sizeClasses: z.int().min(2).max(3),
  sizeVariance: z.number().min(0).max(0.8),
  /** Share of the surface covered by chips, percent. */
  density: z.number().min(5).max(70),
  shape: z.enum(TERRAZZO_SHAPES),
  irregularity: z.number().min(0).max(1),
  /** Minimum space between chips in px. */
  gap: z.number().min(0).max(20),
  /** How much more often the first palette colour appears, percent. */
  dominance: z.number().min(0).max(90),
  /** Tiny speckles between the chips, percent. */
  speckles: z.number().min(0).max(100),
  /** Grain strength in percent (opacity of the grain layer). */
  grain: z.number().min(0).max(100),
});

export type TerrazzoParams = z.output<typeof schema>;

const defaults: TerrazzoParams = {
  background: "#f3ede3",
  palette: ["#c8553d", "#2f3e46", "#84a98c", "#e9c46a"],
  seamless: true,
  tileSize: 480,
  chipSize: 28,
  sizeClasses: 3,
  sizeVariance: 0.4,
  density: 40,
  shape: "angular",
  irregularity: 0.5,
  gap: 3,
  dominance: 20,
  speckles: 40,
  grain: 8,
};

const preset = (id: string, params: Partial<TerrazzoParams>): Preset<TerrazzoParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

function layoutOf(p: TerrazzoParams, ctx: RenderContext): TerrazzoLayout {
  const edge = p.seamless ? p.tileSize : 0;
  return terrazzoLayout({
    width: p.seamless ? edge : ctx.width,
    height: p.seamless ? edge : ctx.height,
    wrap: p.seamless,
    rng: ctx.rng,
    colors: p.palette,
    dominance: p.dominance / 100,
    shape: p.shape,
    chipSize: p.chipSize,
    sizeClasses: p.sizeClasses === 2 ? 2 : 3,
    sizeVariance: p.sizeVariance,
    density: p.density / 100,
    irregularity: p.irregularity,
    gap: p.gap,
    speckles: p.speckles / 100,
  });
}

export const terrazzoTool = defineTool({
  id: ID,
  version: 1,
  category: ["patterns", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("classic", {}),
    preset("venetian", {
      background: "#efe2cf",
      palette: ["#a44a3f", "#d4a373", "#6b4f3a", "#f5f0e6"],
      chipSize: 18,
      density: 50,
      speckles: 70,
      shape: "mixed",
    }),
    preset("midnight", {
      background: "#14161f",
      palette: ["#e9c46a", "#f8f9fa", "#6c757d"],
      chipSize: 22,
      density: 30,
      dominance: 40,
      speckles: 60,
      grain: 12,
    }),
    preset("pastel", {
      background: "#fbf7f4",
      palette: ["#f4a6b5", "#a8d5e2", "#f9d38c", "#b8e0c2"],
      shape: "pebble",
      chipSize: 34,
      irregularity: 0.3,
      density: 35,
      speckles: 20,
      dominance: 0,
    }),
    preset("pebbles", {
      background: "#e8e1d5",
      palette: ["#9c8f80", "#5e5348", "#cfc5b8", "#3b342e"],
      shape: "pebble",
      chipSize: 40,
      sizeClasses: 2,
      density: 55,
      irregularity: 0.4,
      gap: 4,
      speckles: 0,
    }),
    preset("pop", {
      background: "#ffffff",
      palette: ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"],
      chipSize: 24,
      irregularity: 0.8,
      density: 30,
      dominance: 0,
      speckles: 30,
      grain: 0,
    }),
    preset("granite", {
      background: "#cfd2d4",
      palette: ["#2b2d2f", "#6c7075", "#f1f1f1", "#9a9ea3"],
      chipSize: 10,
      density: 55,
      speckles: 100,
      irregularity: 0.7,
      gap: 1,
      dominance: 30,
      grain: 15,
    }),
  ],
  controls: {
    groups: [
      COMMON_GROUPS.shape,
      COMMON_GROUPS.layout,
      COMMON_GROUPS.colors,
      { id: "effects", labelKey: `tools.${ID}.groups.effects` },
    ],
    order: [
      "shape",
      "chipSize",
      "sizeClasses",
      "sizeVariance",
      "irregularity",
      "density",
      "gap",
      "seamless",
      "tileSize",
      "palette",
      "dominance",
      "background",
      "speckles",
      "grain",
    ],
    params: {
      shape: {
        group: "shape",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "shape", TERRAZZO_SHAPES),
      },
      chipSize: { group: "shape", step: 1, unit: "px" },
      sizeClasses: { group: "shape", step: 1 },
      sizeVariance: { group: "shape", step: 0.01, advanced: true },
      irregularity: { group: "shape", step: 0.01 },
      density: { group: "layout", step: 1, unit: "%" },
      gap: { group: "layout", step: 0.5, unit: "px" },
      seamless: { group: "layout" },
      tileSize: { group: "layout", step: 10, unit: "px", visibleWhen: (p) => p.seamless },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      dominance: { group: "colors", step: 1, unit: "%" },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
      speckles: { group: "effects", step: 1, unit: "%" },
      grain: { group: "effects", step: 1, unit: "%" },
    },
  },
  randomize(rng, current, locks) {
    const colors = randomPalette(rng, rng.int(4, 6));
    const dark = rng.bool(0.25);
    // Base from the light or dark end of the ramp, chips from the rest.
    const base = (dark ? colors.pop() : colors.shift()) ?? current.background;
    const next: TerrazzoParams = {
      ...current,
      background: current.background === TRANSPARENT ? TRANSPARENT : base,
      palette: colors.length >= 2 ? colors : randomPalette(rng, 3),
      chipSize: rng.int(12, 48),
      sizeClasses: rng.bool(0.7) ? 3 : 2,
      sizeVariance: roundTo(rng.float(0.2, 0.6), 2),
      density: rng.int(25, 55),
      shape: rng.pick(TERRAZZO_SHAPES),
      irregularity: roundTo(rng.float(0.2, 0.8), 2),
      dominance: rng.int(0, 50),
      speckles: rng.bool(0.3) ? 0 : rng.int(20, 80),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, ctx) {
      return terrazzoSvg({
        layout: layoutOf(p, ctx),
        background: p.background,
        grain: gradientGrain(ctx.seed, p.grain),
        width: ctx.width,
        height: ctx.height,
      });
    },
  },
  tile: {
    render(p, ctx) {
      const layout = layoutOf(p, ctx);
      return {
        svg: terrazzoTileSvg({
          layout,
          background: p.background,
          grain: gradientGrain(ctx.seed, p.grain),
        }),
        width: layout.width,
        height: layout.height,
      };
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
  animation: SEED_AND_COLOR_ANIMATION,
});
