/**
 * M1-AP10: Polka Dots (docs/TOOLS.md A3, pulled into M1 by the roadmap).
 * Dots on a grid, an offset grid or scattered via Poisson-disk sampling.
 */
import {
  DOT_COLOR_MODES,
  DOT_LAYOUTS,
  DOT_SHAPES,
  polkaDotsSvg,
  randomPalette,
} from "@musterli/engine";
import * as z from "zod";
import { visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { COLOR_ANIMATION } from "../animation";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "polka-dots";

const schema = visualParamsSchema.extend({
  layout: z.enum(DOT_LAYOUTS),
  shape: z.enum(DOT_SHAPES),
  colorMode: z.enum(DOT_COLOR_MODES),
  /** Centre distance in percent of the shorter canvas edge, so the look survives resizing. */
  spacing: z.number().min(2).max(25),
  size: z.number().min(0.1).max(1),
  sizeVariance: z.number().min(0).max(1),
  jitter: z.number().min(0).max(1),
});

export type PolkaDotsParams = z.output<typeof schema>;

const defaults: PolkaDotsParams = {
  background: "#fdf0d5",
  palette: ["#c1121f", "#003049"],
  layout: "offset",
  shape: "circle",
  colorMode: "single",
  spacing: 8,
  size: 0.45,
  sizeVariance: 0,
  jitter: 0,
};

const preset = (id: string, params: Partial<PolkaDotsParams>): Preset<PolkaDotsParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const polkaDotsTool = defineTool({
  id: ID,
  version: 1,
  category: ["patterns", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("picnic", {
      palette: ["#ffffff", "#e63946"],
      background: "#e63946",
      layout: "grid",
      spacing: 10,
    }),
    preset("retro", {
      palette: ["#f4a261", "#2a9d8f", "#e9c46a"],
      background: "#264653",
      colorMode: "alternate",
      spacing: 9,
      size: 0.55,
    }),
    preset("pebbles", {
      palette: ["#6b705c", "#a5a58d", "#cb997e"],
      background: "#ffe8d6",
      layout: "scatter",
      colorMode: "random",
      spacing: 6,
      size: 0.8,
      sizeVariance: 0.6,
    }),
    preset("halo", {
      palette: ["#ffd60a", "#ffc300"],
      background: "#001d3d",
      shape: "ring",
      spacing: 12,
      size: 0.6,
    }),
    preset("mosaic", {
      palette: ["#118ab2", "#06d6a0", "#ef476f"],
      background: "#ffffff",
      layout: "grid",
      shape: "square",
      colorMode: "random",
      spacing: 5,
      size: 0.7,
    }),
    preset("fizz", {
      palette: ["#bde0fe", "#a2d2ff", "#cdb4db"],
      background: "#ffffff",
      layout: "scatter",
      shape: "ring",
      colorMode: "random",
      spacing: 7,
      size: 0.7,
      sizeVariance: 0.8,
    }),
    preset("speckle", {
      palette: ["#212529", "#495057"],
      background: "#f8f9fa",
      layout: "offset",
      spacing: 3,
      size: 0.35,
      jitter: 0.6,
      sizeVariance: 0.4,
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.layout, COMMON_GROUPS.shape, COMMON_GROUPS.colors],
    order: [
      "layout",
      "spacing",
      "jitter",
      "shape",
      "size",
      "sizeVariance",
      "colorMode",
      "palette",
      "background",
    ],
    params: {
      layout: { group: "layout", optionLabelKeys: optionLabels(ID, "layout", DOT_LAYOUTS) },
      spacing: { group: "layout", step: 0.5, unit: "%" },
      jitter: { group: "layout", step: 0.01, visibleWhen: (p) => p.layout !== "scatter" },
      shape: { group: "shape", optionLabelKeys: optionLabels(ID, "shape", DOT_SHAPES) },
      size: { group: "shape", step: 0.01 },
      sizeVariance: { group: "shape", step: 0.01 },
      colorMode: {
        group: "colors",
        optionLabelKeys: optionLabels(ID, "colorMode", DOT_COLOR_MODES),
      },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const palette = randomPalette(rng, rng.int(2, 4));
    const next: PolkaDotsParams = {
      // Background from the same palette generator, so it harmonises with the dots.
      background: rng.bool(0.5)
        ? current.background
        : (randomPalette(rng, 2)[0] ?? current.background),
      palette,
      layout: rng.pick(DOT_LAYOUTS),
      shape: rng.bool(0.6) ? "circle" : rng.pick(DOT_SHAPES),
      colorMode: rng.pick(DOT_COLOR_MODES),
      spacing: roundTo(rng.float(4, 14), 1),
      size: roundTo(rng.float(0.3, 0.8), 2),
      sizeVariance: rng.bool(0.6) ? 0 : roundTo(rng.float(0.1, 0.7), 2),
      jitter: rng.bool(0.7) ? 0 : roundTo(rng.float(0.1, 0.6), 2),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height }) {
      const spacing = (Math.min(width, height) * p.spacing) / 100;
      return polkaDotsSvg({ ...p, colors: p.palette, spacing, width, height, rng });
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
  animation: COLOR_ANIMATION,
});
