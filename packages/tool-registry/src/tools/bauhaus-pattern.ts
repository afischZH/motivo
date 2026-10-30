/**
 * Shapes and stickers: Bauhaus pattern (docs/TOOLS.md A5). A grid of flat
 * tiles with bold quarter circles, half circles, rings, lenses, triangles
 * and stripes in quarter turns. The space bar deals a new grid.
 */
import {
  BAUHAUS_COLUMNS_MAX,
  BAUHAUS_COLUMNS_MIN,
  BAUHAUS_SETS,
  bauhausSvg,
  oklchToHex,
} from "@musterli/engine";
import * as z from "zod";
import { visualParamsSchema } from "../common";
import { SEED_AND_COLOR_ANIMATION } from "../animation";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels } from "./shared";

const ID = "bauhaus-pattern";

const schema = visualParamsSchema.extend({
  set: z.enum(BAUHAUS_SETS),
  columns: z.int().min(BAUHAUS_COLUMNS_MIN).max(BAUHAUS_COLUMNS_MAX),
  /** Gap between tiles in percent of a cell. */
  gap: z.number().min(0).max(30),
  /** Share of tiles with a figure in percent. */
  density: z.number().min(0).max(100),
  /** Tile corner radius in percent of a cell. */
  radius: z.number().min(0).max(50),
});

export type BauhausPatternParams = z.output<typeof schema>;

const defaults: BauhausPatternParams = {
  background: "#f4efe6",
  palette: ["#e63946", "#1d3557", "#f4a261", "#f4efe6", "#2a9d8f"],
  set: "mixed",
  columns: 8,
  gap: 0,
  density: 85,
  radius: 0,
};

const preset = (
  id: string,
  params: Partial<BauhausPatternParams>,
): Preset<BauhausPatternParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const bauhausPatternTool = defineTool({
  id: ID,
  version: 1,
  category: ["patterns", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("classic", {}),
    preset("primary", {
      palette: ["#d62828", "#003049", "#fcbf49", "#ffffff", "#111111"],
      background: "#111111",
      columns: 6,
      gap: 4,
    }),
    preset("curves", {
      set: "curves",
      palette: ["#264653", "#e9c46a", "#e76f51", "#f4f1de"],
      columns: 10,
    }),
    preset("angles", {
      set: "angles",
      palette: ["#000000", "#ffffff", "#ff4d00"],
      background: "#ffffff",
      columns: 7,
    }),
    preset("pastel", {
      palette: ["#ffb4a2", "#b5e2fa", "#f9f7c9", "#cdb4db", "#fffdf7"],
      background: "#fffdf7",
      columns: 9,
      gap: 6,
      radius: 18,
    }),
    preset("night", {
      palette: ["#0b132b", "#3a506b", "#5bc0be", "#f2d0a4"],
      background: "#0b132b",
      columns: 12,
      density: 90,
    }),
    preset("calm", {
      palette: ["#606c38", "#283618", "#dda15e", "#fefae0", "#bc6c25"],
      background: "#fefae0",
      columns: 5,
      density: 70,
    }),
    preset("mosaic", {
      palette: ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#073b4c"],
      background: "#ffffff",
      columns: 16,
      gap: 8,
      radius: 25,
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.shape, COMMON_GROUPS.layout, COMMON_GROUPS.colors],
    order: ["set", "density", "columns", "gap", "radius", "palette", "background"],
    params: {
      set: {
        group: "shape",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "set", BAUHAUS_SETS),
      },
      density: { group: "shape", step: 1, unit: "%" },
      columns: { group: "layout", step: 1 },
      gap: { group: "layout", step: 0.5, unit: "%" },
      radius: { group: "layout", step: 1, unit: "%" },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    // New colours and a new grid density; the seed deals the figures.
    const h = rng.float(0, 360);
    const count = rng.int(3, 5);
    const palette = Array.from({ length: count }, (_, i) =>
      oklchToHex({
        l: i === count - 1 ? 0.95 : rng.float(0.35, 0.8),
        c: i === count - 1 ? 0.02 : rng.float(0.08, 0.2),
        h: (h + i * rng.float(50, 140)) % 360,
      }),
    );
    const next: BauhausPatternParams = {
      ...current,
      palette,
      columns: rng.int(4, 14),
      density: rng.int(60, 100),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height }) {
      return bauhausSvg({
        width,
        height,
        background: p.background,
        colors: p.palette,
        set: p.set,
        columns: p.columns,
        gap: p.gap / 100,
        density: p.density / 100,
        radius: p.radius / 100,
        rng,
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  animation: SEED_AND_COLOR_ANIMATION,
});
