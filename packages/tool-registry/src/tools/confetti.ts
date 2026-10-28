/**
 * M2-AP01: Confetti (docs/TOOLS.md A3). Rotated chips, dots, triangles and
 * squiggles spread evenly with Poisson-disk sampling.
 */
import { CONFETTI_SHAPES, confettiSvg, randomPalette } from "@motivo/engine";
import * as z from "zod";
import { visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "confetti";

const schema = visualParamsSchema.extend({
  shape: z.enum(CONFETTI_SHAPES),
  /** Minimum distance between pieces in percent of the shorter canvas edge. */
  spacing: z.number().min(2).max(25),
  size: z.number().min(0.1).max(1),
  sizeVariance: z.number().min(0).max(1),
  /** Maximum random rotation in degrees. */
  rotation: z.number().min(0).max(180),
});

export type ConfettiParams = z.output<typeof schema>;

const defaults: ConfettiParams = {
  background: "#fffaf2",
  palette: ["#ff5d73", "#ffc145", "#3ec1d3", "#7a5cfa"],
  shape: "mixed",
  spacing: 7,
  size: 0.55,
  sizeVariance: 0.3,
  rotation: 180,
};

const preset = (id: string, params: Partial<ConfettiParams>): Preset<ConfettiParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const confettiTool = defineTool({
  id: ID,
  version: 1,
  category: ["patterns", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("party", {
      background: "#1b1340",
      palette: ["#ff4f81", "#ffd23f", "#3bceac", "#ee6c4d", "#ffffff"],
      spacing: 6,
    }),
    preset("pastel", {
      background: "#fff8f3",
      palette: ["#f4a7b9", "#9fd3f2", "#b5e3a1", "#f7cf7a"],
      shape: "circle",
      spacing: 6,
      size: 0.7,
      sizeVariance: 0.5,
    }),
    preset("gilded", {
      background: "#141414",
      palette: ["#d4af37", "#f1d98a", "#a67c1f"],
      shape: "rect",
      spacing: 5,
      size: 0.6,
    }),
    preset("streamers", {
      background: "#f4f1ff",
      palette: ["#6c4ee3", "#f0568f", "#26b5a6"],
      shape: "squiggle",
      spacing: 9,
      size: 0.75,
      sizeVariance: 0.2,
    }),
    preset("sprinkles", {
      background: "#fde2e4",
      palette: ["#e63973", "#3a86ff", "#ffbe0b", "#8338ec", "#06d6a0"],
      shape: "rect",
      spacing: 3.5,
      size: 0.7,
      sizeVariance: 0.1,
    }),
    preset("prism", {
      background: "#0b2027",
      palette: ["#40798c", "#70a9a1", "#cfd7c7", "#f6f1d1"],
      shape: "triangle",
      spacing: 8,
      size: 0.6,
      sizeVariance: 0.6,
    }),
    preset("parade", {
      background: "#fefefe",
      palette: ["#d62828", "#003049", "#f77f00"],
      spacing: 10,
      size: 0.5,
      sizeVariance: 0,
      rotation: 25,
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.layout, COMMON_GROUPS.shape, COMMON_GROUPS.colors],
    order: ["spacing", "rotation", "shape", "size", "sizeVariance", "palette", "background"],
    params: {
      spacing: { group: "layout", step: 0.5, unit: "%" },
      rotation: { group: "layout", step: 1, unit: "°" },
      shape: { group: "shape", optionLabelKeys: optionLabels(ID, "shape", CONFETTI_SHAPES) },
      size: { group: "shape", step: 0.01 },
      sizeVariance: { group: "shape", step: 0.01 },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const next: ConfettiParams = {
      background: rng.bool(0.5)
        ? current.background
        : (randomPalette(rng, 2)[0] ?? current.background),
      palette: randomPalette(rng, rng.int(3, 6)),
      shape: rng.bool(0.5) ? "mixed" : rng.pick(CONFETTI_SHAPES),
      spacing: roundTo(rng.float(4, 12), 1),
      size: roundTo(rng.float(0.35, 0.8), 2),
      sizeVariance: roundTo(rng.float(0, 0.6), 2),
      rotation: rng.bool(0.7) ? 180 : Math.round(rng.float(0, 90)),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height }) {
      const spacing = (Math.min(width, height) * p.spacing) / 100;
      return confettiSvg({ ...p, colors: p.palette, spacing, width, height, rng });
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
});
