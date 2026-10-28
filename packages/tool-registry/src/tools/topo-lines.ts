/**
 * M4b-AP01: Topographic contour lines (docs/TOOLS.md K1). A seeded fBm
 * height field with optional domain warp, traced with Marching Squares at
 * evenly spaced levels, as lines, filled bands or both.
 */
import {
  TOPO_COLOR_MODES,
  TOPO_LEVELS_MAX,
  TOPO_STYLES,
  hexToOklch,
  randomPalette,
  topoSvg,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema, visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "topo-lines";

const schema = visualParamsSchema.extend({
  /** Feature size in percent of the shorter edge. */
  scale: z.number().min(15).max(150),
  octaves: z.int().min(1).max(6),
  roughness: z.number().min(0).max(1),
  warp: z.number().min(0).max(1),
  levels: z.int().min(3).max(TOPO_LEVELS_MAX),
  style: z.enum(TOPO_STYLES),
  colorMode: z.enum(TOPO_COLOR_MODES),
  lineWidth: z.number().min(0.25).max(8),
  /** Every n-th line is wider; 0 = off. */
  majorEvery: z.int().min(0).max(10),
  lineColor: colorSchema,
});

export type TopoLinesParams = z.output<typeof schema>;

const defaults: TopoLinesParams = {
  background: "#f4f1ea",
  palette: ["#2d6a4f", "#b08968"],
  scale: 60,
  octaves: 4,
  roughness: 0.5,
  warp: 0.3,
  levels: 18,
  style: "lines",
  colorMode: "gradient",
  lineWidth: 1.5,
  majorEvery: 5,
  lineColor: "#1b1b1b",
};

const preset = (id: string, params: Partial<TopoLinesParams>): Preset<TopoLinesParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Darkest colour of a palette (by OKLCH lightness), for lines on top of bands. */
function darkest(colors: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestL = Infinity;
  for (const c of colors) {
    const l = hexToOklch(c).l;
    if (l < bestL) {
      bestL = l;
      best = c;
    }
  }
  return best;
}

export const topoLinesTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds", "patterns"],
  schema,
  defaults,
  defaultSize: { width: 1920, height: 1080 },
  presets: [
    preset("survey", {}),
    preset("lagoon", {
      style: "bands-lines",
      background: "#e9f5f2",
      palette: ["#d8f3dc", "#74c69d", "#2a9d8f", "#1d3557"],
      levels: 14,
      lineWidth: 1,
      majorEvery: 0,
      lineColor: "#10302f",
    }),
    preset("night-map", {
      background: "#0b1021",
      palette: ["#4cc9f0", "#7b2cbf"],
      levels: 28,
      lineWidth: 1,
      majorEvery: 0,
      scale: 80,
      warp: 0.5,
    }),
    preset("terraces", {
      style: "bands",
      background: "#f7e7ce",
      palette: ["#f2cc8f", "#e07a5f", "#81343f"],
      levels: 10,
      octaves: 3,
      roughness: 0.3,
    }),
    preset("marble", {
      background: "#fbfbfa",
      palette: ["#adb5bd", "#495057"],
      levels: 32,
      warp: 1,
      scale: 45,
      lineWidth: 0.75,
      majorEvery: 0,
    }),
    preset("alpine", {
      background: "#ffffff",
      palette: ["#264653", "#264653"],
      octaves: 6,
      roughness: 0.75,
      levels: 24,
      majorEvery: 4,
      lineWidth: 1,
      scale: 90,
      warp: 0.15,
    }),
    preset("candy", {
      style: "bands",
      colorMode: "cycle",
      background: "#ffd6e0",
      palette: ["#ffc8dd", "#bde0fe", "#cdb4db", "#fff1a8"],
      levels: 16,
      octaves: 2,
      roughness: 0.2,
      warp: 0.6,
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.shape, COMMON_GROUPS.layout, COMMON_GROUPS.colors],
    order: [
      "scale",
      "octaves",
      "roughness",
      "warp",
      "levels",
      "style",
      "lineWidth",
      "majorEvery",
      "colorMode",
      "palette",
      "lineColor",
      "background",
    ],
    params: {
      scale: { group: "shape", step: 1, unit: "%" },
      octaves: { group: "shape" },
      roughness: { group: "shape", step: 0.01 },
      warp: { group: "shape", step: 0.01 },
      levels: { group: "layout" },
      style: { group: "layout", optionLabelKeys: optionLabels(ID, "style", TOPO_STYLES) },
      lineWidth: {
        group: "layout",
        step: 0.25,
        unit: "px",
        visibleWhen: (p) => p.style !== "bands",
      },
      majorEvery: {
        group: "layout",
        descriptionKey: `tools.${ID}.params.majorEvery.description`,
        visibleWhen: (p) => p.style !== "bands",
      },
      colorMode: {
        group: "colors",
        optionLabelKeys: optionLabels(ID, "colorMode", TOPO_COLOR_MODES),
      },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      lineColor: { group: "colors", visibleWhen: (p) => p.style === "bands-lines" },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const next: TopoLinesParams = {
      ...current,
      palette: randomPalette(rng, rng.int(2, 4)),
      scale: rng.int(25, 120),
      octaves: rng.int(2, 6),
      roughness: roundTo(rng.float(0.2, 0.8), 2),
      warp: rng.bool(0.7) ? roundTo(rng.float(0, 0.8), 2) : 0,
      levels: rng.int(8, 30),
      majorEvery: rng.bool(0.5) ? rng.int(3, 6) : 0,
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors) {
    const line = darkest(colors);
    return line ? { palette: colors.slice(), lineColor: line } : { palette: colors.slice() };
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height, t }) {
      return topoSvg({
        ...p,
        scale: p.scale / 100,
        colors: p.palette,
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
