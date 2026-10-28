/**
 * M2-AP01: Grid Patterns (docs/TOOLS.md A3). Graph-paper lines, dot grids,
 * plus marks or square tiles with an optional major grid and fade.
 */
import {
  GRID_FADES,
  GRID_LINE_STYLES,
  GRID_STYLES,
  gridPatternSvg,
  randomPalette,
} from "@musterli/engine";
import * as z from "zod";
import { visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "grid-patterns";

const schema = visualParamsSchema.extend({
  style: z.enum(GRID_STYLES),
  /** Cell size in percent of the shorter canvas edge, so the look survives resizing. */
  cellSize: z.number().min(2).max(25),
  /** Line width, dot radius or tile gap relative to the cell size. */
  weight: z.number().min(0.01).max(0.5),
  lineStyle: z.enum(GRID_LINE_STYLES),
  /** Every n-th line is major (second colour); 0 = no major grid. */
  majorEvery: z.int().min(0).max(10),
  fade: z.enum(GRID_FADES),
});

export type GridPatternsParams = z.output<typeof schema>;

const defaults: GridPatternsParams = {
  background: "#f7f9fc",
  palette: ["#d3dbe8", "#8a9bb8"],
  style: "lines",
  cellSize: 5,
  weight: 0.03,
  lineStyle: "solid",
  majorEvery: 5,
  fade: "none",
};

const preset = (id: string, params: Partial<GridPatternsParams>): Preset<GridPatternsParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const gridPatternsTool = defineTool({
  id: ID,
  version: 1,
  category: ["patterns", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("blueprint", {
      background: "#12355b",
      palette: ["#3d6a9c", "#a9c6e8"],
      cellSize: 4,
      weight: 0.04,
      majorEvery: 4,
    }),
    preset("notebook", {
      background: "#fffdf6",
      palette: ["#9aa7bd", "#e07a7a"],
      style: "dots",
      cellSize: 4,
      weight: 0.09,
      majorEvery: 0,
    }),
    preset("spotlight", {
      background: "#0d0d12",
      palette: ["#5a5a82", "#8f8fbf"],
      cellSize: 6,
      weight: 0.035,
      lineStyle: "dashed",
      majorEvery: 0,
      fade: "radial",
    }),
    preset("marks", {
      background: "#f2efe9",
      palette: ["#9a8f80", "#3d362c"],
      style: "crosses",
      cellSize: 7,
      weight: 0.03,
      majorEvery: 3,
    }),
    preset("tiles", {
      background: "#ffffff",
      palette: ["#e9eef2", "#ffcf5c"],
      style: "squares",
      cellSize: 8,
      weight: 0.08,
      majorEvery: 4,
    }),
    preset("stitches", {
      background: "#1f3a2e",
      palette: ["#9fd1b8", "#d8f0e3"],
      cellSize: 9,
      weight: 0.04,
      lineStyle: "dotted",
      majorEvery: 0,
      fade: "edges",
    }),
    preset("terminal", {
      background: "#050806",
      palette: ["#1d7a40", "#2bd96b"],
      style: "dots",
      cellSize: 3,
      weight: 0.14,
      majorEvery: 8,
      fade: "radial",
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.layout, COMMON_GROUPS.shape, COMMON_GROUPS.colors],
    order: [
      "style",
      "cellSize",
      "majorEvery",
      "fade",
      "weight",
      "lineStyle",
      "palette",
      "background",
    ],
    params: {
      style: { group: "layout", optionLabelKeys: optionLabels(ID, "style", GRID_STYLES) },
      cellSize: { group: "layout", step: 0.5, unit: "%" },
      majorEvery: { group: "layout" },
      fade: { group: "layout", optionLabelKeys: optionLabels(ID, "fade", GRID_FADES) },
      weight: { group: "shape", step: 0.01 },
      lineStyle: {
        group: "shape",
        optionLabelKeys: optionLabels(ID, "lineStyle", GRID_LINE_STYLES),
        visibleWhen: (p) => p.style === "lines",
      },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const palette = randomPalette(rng, 2);
    const next: GridPatternsParams = {
      background: rng.bool(0.5)
        ? current.background
        : (randomPalette(rng, 2)[0] ?? current.background),
      palette,
      style: rng.pick(GRID_STYLES),
      cellSize: roundTo(rng.float(3, 12), 1),
      weight: roundTo(rng.float(0.02, 0.12), 2),
      lineStyle: rng.bool(0.6) ? "solid" : rng.pick(GRID_LINE_STYLES),
      majorEvery: rng.bool(0.5) ? 0 : rng.int(2, 6),
      fade: rng.bool(0.5) ? "none" : rng.pick(GRID_FADES),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width, height }) {
      const cell = (Math.min(width, height) * p.cellSize) / 100;
      return gridPatternSvg({ ...p, colors: p.palette, cell, width, height });
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
});
