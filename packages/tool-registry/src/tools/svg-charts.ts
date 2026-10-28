/**
 * M3-AP08: SVG Charts (docs/TOOLS.md D5). Placeholder line, area and bar
 * charts with seeded random data for mockups; Space draws new data.
 */
import {
  CHART_POINTS_MAX,
  CHART_POINTS_MIN,
  CHART_SERIES_MAX,
  CHART_TYPES,
  chartSvg,
  randomPalette,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema, visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "svg-charts";

const schema = visualParamsSchema.extend({
  type: z.enum(CHART_TYPES),
  series: z.int().min(1).max(CHART_SERIES_MAX),
  points: z.int().min(CHART_POINTS_MIN).max(CHART_POINTS_MAX),
  trend: z.number().min(-1).max(1),
  volatility: z.number().min(0).max(1),
  smoothing: z.number().min(0).max(1),
  lineWidth: z.number().min(0.5).max(16),
  markers: z.boolean(),
  barGap: z.number().min(0).max(0.9),
  barRadius: z.number().min(0).max(1),
  axes: z.boolean(),
  grid: z.boolean(),
  axisColor: colorSchema,
  /** Margin around the plot in percent of the shorter canvas edge. */
  margin: z.number().min(0).max(30),
});

export type SvgChartsParams = z.output<typeof schema>;

const defaults: SvgChartsParams = {
  background: "#ffffff",
  palette: ["#6366f1", "#14b8a6", "#f59e0b"],
  type: "line",
  series: 2,
  points: 12,
  trend: 0.4,
  volatility: 0.5,
  smoothing: 0.6,
  lineWidth: 4,
  markers: false,
  barGap: 0.35,
  barRadius: 0.4,
  axes: true,
  grid: true,
  axisColor: "#94a3b8",
  margin: 10,
};

const preset = (id: string, params: Partial<SvgChartsParams>): Preset<SvgChartsParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

const isLine = (p: SvgChartsParams): boolean => p.type !== "bar";

export const svgChartsTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1200, height: 800 },
  presets: [
    preset("growth", {
      type: "area",
      series: 1,
      points: 16,
      trend: 0.8,
      volatility: 0.35,
      palette: ["#10b981", "#059669"],
    }),
    preset("dashboard", {
      background: "#0f172a",
      palette: ["#38bdf8", "#f472b6", "#a3e635"],
      axisColor: "#475569",
      series: 3,
      points: 10,
      trend: 0.1,
      markers: true,
      lineWidth: 3,
    }),
    preset("quarterly", {
      type: "bar",
      series: 2,
      points: 4,
      trend: 0.5,
      palette: ["#2563eb", "#93c5fd"],
      barGap: 0.4,
      barRadius: 0.3,
    }),
    preset("monthly", {
      type: "bar",
      series: 1,
      points: 12,
      trend: 0.2,
      volatility: 0.7,
      palette: ["#f97316", "#fdba74"],
      barGap: 0.25,
      barRadius: 1,
      grid: false,
    }),
    preset("sparkline", {
      series: 1,
      points: 24,
      trend: -0.2,
      volatility: 0.8,
      smoothing: 0.3,
      axes: false,
      grid: false,
      margin: 6,
      lineWidth: 6,
      palette: ["#e11d48", "#fb7185"],
    }),
    preset("minimal", {
      background: "#fafaf9",
      palette: ["#1c1917", "#a8a29e"],
      axisColor: "#d6d3d1",
      points: 8,
      smoothing: 0,
      markers: true,
      lineWidth: 2.5,
      grid: false,
    }),
    preset("stacked-waves", {
      type: "area",
      series: 3,
      points: 9,
      trend: 0,
      volatility: 0.6,
      smoothing: 1,
      axes: false,
      palette: ["#8b5cf6", "#ec4899", "#06b6d4"],
      background: "#faf5ff",
      axisColor: "#c4b5fd",
    }),
  ],
  controls: {
    groups: [
      { id: "data", labelKey: `tools.${ID}.groups.data` },
      COMMON_GROUPS.shape,
      COMMON_GROUPS.layout,
      COMMON_GROUPS.colors,
    ],
    order: [
      "type",
      "series",
      "points",
      "trend",
      "volatility",
      "smoothing",
      "lineWidth",
      "markers",
      "barGap",
      "barRadius",
      "axes",
      "grid",
      "margin",
      "palette",
      "axisColor",
      "background",
    ],
    params: {
      type: { group: "data", optionLabelKeys: optionLabels(ID, "type", CHART_TYPES) },
      series: { group: "data" },
      points: { group: "data" },
      trend: { group: "data", step: 0.05 },
      volatility: { group: "data", step: 0.01 },
      smoothing: { group: "shape", step: 0.01, visibleWhen: isLine },
      lineWidth: { group: "shape", step: 0.5, unit: "px", visibleWhen: isLine },
      markers: { group: "shape", visibleWhen: isLine },
      barGap: { group: "shape", step: 0.01, visibleWhen: (p) => p.type === "bar" },
      barRadius: { group: "shape", step: 0.01, visibleWhen: (p) => p.type === "bar" },
      axes: { group: "layout" },
      grid: { group: "layout" },
      margin: { group: "layout", step: 1, unit: "%" },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      axisColor: { group: "colors" },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    // Space mostly means "new data": keep the chart style, vary the data shape and colours.
    const next: SvgChartsParams = {
      ...current,
      palette: randomPalette(rng, Math.max(current.palette.length, 2)),
      trend: roundTo(rng.float(-0.6, 1), 2),
      volatility: roundTo(rng.float(0.2, 0.8), 2),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height }) {
      return chartSvg({ ...p, colors: p.palette, width, height, rng });
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
});
