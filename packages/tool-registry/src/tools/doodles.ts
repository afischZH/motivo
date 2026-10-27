/**
 * M3-AP08: Doodle Backgrounds (docs/TOOLS.md A4). Hand-drawn looking
 * strokes (own procedural shapes, noise on the control points, round caps),
 * spread with Poisson-disk sampling.
 */
import { DOODLE_SHAPES, doodlesSvg, randomPalette } from "@motivo/engine";
import * as z from "zod";
import { visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "doodles";

const schema = visualParamsSchema.extend({
  shape: z.enum(DOODLE_SHAPES),
  /** Minimum distance between doodles in percent of the shorter canvas edge. */
  spacing: z.number().min(4).max(40),
  size: z.number().min(0.2).max(1.5),
  sizeVariance: z.number().min(0).max(1),
  /** Maximum random rotation in degrees. */
  rotation: z.number().min(0).max(180),
  wobble: z.number().min(0).max(1),
  strokeWidth: z.number().min(0.5).max(24),
});

export type DoodlesParams = z.output<typeof schema>;

const defaults: DoodlesParams = {
  background: "#fdf6e3",
  palette: ["#264653", "#e76f51", "#2a9d8f", "#e9c46a"],
  shape: "mixed",
  spacing: 12,
  size: 0.7,
  sizeVariance: 0.3,
  rotation: 180,
  wobble: 0.4,
  strokeWidth: 4,
};

const preset = (id: string, params: Partial<DoodlesParams>): Preset<DoodlesParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const doodlesTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds", "patterns"],
  schema,
  defaults,
  presets: [
    preset("notebook", {
      background: "#ffffff",
      palette: ["#1d3557", "#457b9d"],
      spacing: 10,
      strokeWidth: 3,
      wobble: 0.5,
    }),
    preset("chalkboard", {
      background: "#22312b",
      palette: ["#f1faee", "#a8dadc", "#ffd166"],
      spacing: 11,
      wobble: 0.7,
      strokeWidth: 3.5,
    }),
    preset("party", {
      background: "#ffe5ec",
      palette: ["#ff006e", "#8338ec", "#3a86ff", "#fb5607"],
      shape: "squiggle",
      spacing: 9,
      size: 0.8,
      strokeWidth: 5,
    }),
    preset("stars", {
      background: "#0b132b",
      palette: ["#ffd60a", "#ffc300", "#ffffff"],
      shape: "star",
      spacing: 9,
      size: 0.6,
      sizeVariance: 0.6,
      strokeWidth: 2.5,
      rotation: 40,
    }),
    preset("spirals", {
      background: "#f1faee",
      palette: ["#e63946", "#1d3557"],
      shape: "spiral",
      spacing: 14,
      size: 0.85,
      wobble: 0.25,
      strokeWidth: 3,
    }),
    preset("blueprint", {
      background: "#1e3a8a",
      palette: ["#dbeafe", "#93c5fd"],
      shape: "cross",
      spacing: 7,
      size: 0.45,
      sizeVariance: 0,
      rotation: 0,
      wobble: 0.3,
      strokeWidth: 2,
    }),
    preset("bold", {
      background: "#fefae0",
      palette: ["#283618", "#bc6c25", "#dda15e"],
      spacing: 18,
      size: 0.8,
      sizeVariance: 0.2,
      wobble: 0.3,
      strokeWidth: 9,
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.layout, COMMON_GROUPS.shape, COMMON_GROUPS.colors],
    order: [
      "spacing",
      "rotation",
      "shape",
      "size",
      "sizeVariance",
      "wobble",
      "strokeWidth",
      "palette",
      "background",
    ],
    params: {
      spacing: { group: "layout", step: 0.5, unit: "%" },
      rotation: { group: "layout", step: 1, unit: "°" },
      shape: { group: "shape", optionLabelKeys: optionLabels(ID, "shape", DOODLE_SHAPES) },
      size: { group: "shape", step: 0.01 },
      sizeVariance: { group: "shape", step: 0.01 },
      wobble: { group: "shape", step: 0.01 },
      strokeWidth: { group: "shape", step: 0.5, unit: "px" },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const colors = randomPalette(rng, rng.int(3, 5));
    const next: DoodlesParams = {
      background: rng.bool(0.6) ? current.background : (colors.pop() ?? current.background),
      palette: colors.length >= 2 ? colors : randomPalette(rng, 3),
      shape: rng.bool(0.6) ? "mixed" : rng.pick(DOODLE_SHAPES),
      spacing: roundTo(rng.float(8, 18), 1),
      size: roundTo(rng.float(0.5, 0.95), 2),
      sizeVariance: roundTo(rng.float(0, 0.6), 2),
      rotation: rng.bool(0.7) ? 180 : rng.int(0, 60),
      wobble: roundTo(rng.float(0.15, 0.7), 2),
      strokeWidth: rng.int(4, 14) / 2,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height }) {
      const spacing = (Math.min(width, height) * p.spacing) / 100;
      return doodlesSvg({ ...p, colors: p.palette, spacing, width, height, rng });
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
  gating: {},
});
