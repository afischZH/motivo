/**
 * M4b-AP01: Flow fields (docs/TOOLS.md K2). Lines traced through a seeded
 * noise or curl-noise direction field, evenly spaced (Jobard-Lefer) or free,
 * with tapering and colours by palette, angle or position.
 */
import {
  FLOW_COLOR_MODES,
  FLOW_FIELD_MODES,
  FLOW_LINES_MAX,
  FLOW_SEEDINGS,
  FLOW_TAPERS,
  flowSvg,
  randomPalette,
} from "@musterli/engine";
import * as z from "zod";
import { visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "flow-field";

const schema = visualParamsSchema.extend({
  mode: z.enum(FLOW_FIELD_MODES),
  /** Feature size in percent of the shorter edge. */
  scale: z.number().min(10).max(200),
  octaves: z.int().min(1).max(5),
  turbulence: z.number().min(0).max(2),
  /** Main direction in degrees (noise mode). */
  direction: z.number().min(0).max(360),
  seeding: z.enum(FLOW_SEEDINGS),
  /** Distance between lines in percent of the shorter edge. */
  spacing: z.number().min(1).max(10),
  /** Share of the spacing lines keep from each other; 0 = lines may cross. */
  separation: z.number().min(0).max(1),
  /** Longest line in percent of the shorter edge. */
  length: z.number().min(5).max(200),
  /** Integration step in per mille of the shorter edge. */
  step: z.number().min(1).max(10),
  maxLines: z.int().min(50).max(FLOW_LINES_MAX),
  lineWidth: z.number().min(0.25).max(16),
  taper: z.enum(FLOW_TAPERS),
  colorMode: z.enum(FLOW_COLOR_MODES),
  /** Line opacity in percent. */
  opacity: z.number().min(10).max(100),
});

export type FlowFieldParams = z.output<typeof schema>;

const defaults: FlowFieldParams = {
  background: "#0f1222",
  palette: ["#f72585", "#7209b7", "#4cc9f0"],
  mode: "noise",
  scale: 60,
  octaves: 2,
  turbulence: 0.6,
  direction: 0,
  seeding: "poisson",
  spacing: 2,
  separation: 0.5,
  length: 60,
  step: 3,
  maxLines: 1500,
  lineWidth: 2,
  taper: "none",
  colorMode: "angle",
  opacity: 100,
};

const preset = (id: string, params: Partial<FlowFieldParams>): Preset<FlowFieldParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const flowFieldTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds", "patterns"],
  schema,
  defaults,
  defaultSize: { width: 1920, height: 1080 },
  presets: [
    preset("current", {}),
    preset("silk", {
      background: "#f6f1eb",
      palette: ["#1d3557", "#e63946"],
      seeding: "random",
      separation: 0,
      maxLines: 2500,
      length: 150,
      step: 4,
      lineWidth: 0.75,
      opacity: 30,
      colorMode: "position",
      turbulence: 0.8,
    }),
    preset("whirlpool", {
      mode: "curl",
      background: "#101418",
      palette: ["#ffbe0b", "#fb5607", "#ff006e", "#8338ec"],
      spacing: 2.5,
      separation: 0.6,
      lineWidth: 4,
      taper: "both",
      colorMode: "palette",
      length: 80,
    }),
    preset("breeze", {
      background: "#eaf4fb",
      palette: ["#90e0ef", "#0077b6", "#03045e"],
      turbulence: 0.25,
      direction: 20,
      spacing: 1.8,
      length: 40,
      lineWidth: 2.5,
      taper: "tail",
      colorMode: "position",
    }),
    preset("ink", {
      mode: "curl",
      background: "#f8f5ee",
      palette: ["#1b1b1b", "#3d3d3d"],
      scale: 45,
      octaves: 3,
      spacing: 1.8,
      separation: 0.35,
      lineWidth: 1,
      colorMode: "palette",
      length: 120,
      step: 4,
    }),
    preset("meadow", {
      background: "#f1f7e9",
      palette: ["#95d5b2", "#52b788", "#2d6a4f"],
      direction: 270,
      turbulence: 0.3,
      scale: 30,
      seeding: "grid",
      spacing: 1.5,
      separation: 0,
      length: 12,
      lineWidth: 3,
      taper: "tail",
      colorMode: "palette",
    }),
    preset("dune", {
      background: "#2b1d14",
      palette: ["#f4a261", "#e9c46a", "#e76f51"],
      turbulence: 1.2,
      scale: 120,
      octaves: 1,
      spacing: 3,
      separation: 0.8,
      length: 200,
      lineWidth: 1.5,
      colorMode: "angle",
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.shape, COMMON_GROUPS.layout, COMMON_GROUPS.colors],
    order: [
      "mode",
      "scale",
      "octaves",
      "turbulence",
      "direction",
      "seeding",
      "spacing",
      "separation",
      "length",
      "step",
      "maxLines",
      "lineWidth",
      "taper",
      "colorMode",
      "opacity",
      "palette",
      "background",
    ],
    params: {
      mode: { group: "shape", optionLabelKeys: optionLabels(ID, "mode", FLOW_FIELD_MODES) },
      scale: { group: "shape", step: 1, unit: "%" },
      octaves: { group: "shape" },
      turbulence: { group: "shape", step: 0.01, visibleWhen: (p) => p.mode === "noise" },
      direction: { group: "shape", step: 1, unit: "°", visibleWhen: (p) => p.mode === "noise" },
      seeding: { group: "layout", optionLabelKeys: optionLabels(ID, "seeding", FLOW_SEEDINGS) },
      spacing: { group: "layout", step: 0.1, unit: "%" },
      separation: {
        group: "layout",
        step: 0.01,
        descriptionKey: `tools.${ID}.params.separation.description`,
      },
      length: { group: "layout", step: 1, unit: "%" },
      step: { group: "layout", step: 0.5, unit: "‰", advanced: true },
      maxLines: { group: "layout", step: 50, advanced: true },
      lineWidth: { group: "layout", step: 0.25, unit: "px" },
      taper: { group: "layout", optionLabelKeys: optionLabels(ID, "taper", FLOW_TAPERS) },
      colorMode: {
        group: "colors",
        optionLabelKeys: optionLabels(ID, "colorMode", FLOW_COLOR_MODES),
      },
      opacity: { group: "colors", step: 1, unit: "%" },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const next: FlowFieldParams = {
      ...current,
      palette: randomPalette(rng, rng.int(2, 4)),
      scale: rng.int(25, 150),
      octaves: rng.int(1, 4),
      turbulence: roundTo(rng.float(0.2, 1.4), 2),
      direction: rng.int(0, 359),
      spacing: roundTo(rng.float(1.2, 4), 1),
      separation: roundTo(rng.float(0.3, 0.8), 2),
      length: rng.int(20, 160),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height, t }) {
      return flowSvg({
        ...p,
        colors: p.palette,
        opacity: p.opacity / 100,
        width,
        height,
        rng,
        ...(t !== undefined ? { t } : {}),
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  animation: { sources: ["time", "seeds", "colors"] },
});
