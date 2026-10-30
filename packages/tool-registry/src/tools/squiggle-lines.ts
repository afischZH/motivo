/**
 * Shapes and stickers: squiggle lines (docs/TOOLS.md D8). Decorative wavy,
 * zigzag, looping and scribbled lines: one divider line, a stack of
 * parallel lines or scattered squiggles. Adds a CSS squiggly underline
 * built from one wavelength of the line.
 */
import {
  SQUIGGLE_COUNT_MAX,
  SQUIGGLE_LAYOUTS,
  SQUIGGLE_STYLES,
  formatNumber,
  oklchToHex,
  squiggleTileSvg,
  squigglesSvg,
} from "@musterli/engine";
import * as z from "zod";
import { visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "squiggle-lines";

const schema = visualParamsSchema.extend({
  style: z.enum(SQUIGGLE_STYLES),
  layout: z.enum(SQUIGGLE_LAYOUTS),
  count: z.int().min(1).max(SQUIGGLE_COUNT_MAX),
  /** Wavelength in percent of the shorter edge. */
  wavelength: z.number().min(1).max(100),
  /** Height, peak to peak, in percent of the shorter edge. */
  amplitude: z.number().min(0).max(60),
  /** Line width in per mille of the shorter edge. */
  stroke: z.number().min(2).max(200),
  /** Length of a scattered squiggle in percent of the shorter edge. */
  length: z.number().min(5).max(100),
  angle: z.number().min(-90).max(90),
});

export type SquiggleLinesParams = z.output<typeof schema>;

const defaults: SquiggleLinesParams = {
  background: "#fffbeb",
  palette: ["#111827", "#f97316", "#0ea5e9"],
  style: "wave",
  layout: "stack",
  count: 7,
  wavelength: 12,
  amplitude: 5,
  stroke: 12,
  length: 25,
  angle: -12,
};

const preset = (id: string, params: Partial<SquiggleLinesParams>): Preset<SquiggleLinesParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Underline tile at a fixed text size: wavelength, height and width in px for 1 em = 16 px. */
function underlineCss(p: SquiggleLinesParams): string {
  // Proportions of the design, scaled so one wave is about half an em wide.
  const lambda = 8;
  const ratio = lambda / Math.max(0.1, p.wavelength);
  const amp = Math.max(1, p.amplitude * ratio);
  const stroke = Math.max(1, (p.stroke / 10) * ratio);
  const color = p.palette[1] ?? p.palette[0] ?? "#111827";
  const tile = squiggleTileSvg({ style: p.style, lambda, amp, stroke, color });
  const n = (v: number) => formatNumber(v, 2);
  return (
    `.squiggle {\n` +
    `  text-decoration: none;\n` +
    `  padding-bottom: ${n(tile.height / 16 + 0.1)}em;\n` +
    `  background-image: url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(tile.svg)}");\n` +
    `  background-repeat: repeat-x;\n` +
    `  background-position: 0 100%;\n` +
    `  background-size: ${n(tile.width / 16)}em ${n(tile.height / 16)}em;\n` +
    `}\n`
  );
}

export const squiggleLinesTool = defineTool({
  id: ID,
  version: 1,
  category: ["patterns", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("stacked", {}),
    preset("divider", {
      layout: "single",
      palette: ["#4f46e5", "#4f46e5"],
      background: "#ffffff",
      wavelength: 40,
      amplitude: 22,
      stroke: 60,
      angle: 0,
    }),
    preset("zigzag", {
      style: "zigzag",
      palette: ["#e11d48", "#fbbf24"],
      background: "#1f2937",
      count: 9,
      wavelength: 8,
      amplitude: 4,
      stroke: 10,
      angle: 0,
    }),
    preset("loops", {
      style: "loops",
      palette: ["#0f766e", "#14b8a6"],
      background: "#f0fdfa",
      count: 5,
      wavelength: 8,
      amplitude: 9,
      stroke: 8,
      angle: 20,
    }),
    preset("confetti", {
      style: "wave",
      layout: "scatter",
      palette: ["#f43f5e", "#8b5cf6", "#22c55e", "#f59e0b", "#0ea5e9"],
      background: "#ffffff",
      count: 36,
      wavelength: 5,
      amplitude: 3,
      stroke: 9,
      length: 14,
    }),
    preset("scribbles", {
      style: "scribble",
      palette: ["#1e293b", "#64748b"],
      background: "#f8fafc",
      count: 12,
      wavelength: 6,
      amplitude: 6,
      stroke: 5,
      angle: -30,
    }),
    preset("bumps", {
      style: "bumps",
      layout: "stack",
      palette: ["#7c3aed", "#db2777"],
      background: "#fdf4ff",
      count: 8,
      wavelength: 7,
      amplitude: 4,
      stroke: 9,
      angle: 0,
    }),
    preset("memphis", {
      style: "zigzag",
      layout: "scatter",
      palette: ["#111111", "#ff5c8a", "#00b3a4", "#ffd23f"],
      background: "#fef9ef",
      count: 30,
      wavelength: 4,
      amplitude: 3,
      stroke: 10,
      length: 12,
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.shape, COMMON_GROUPS.layout, COMMON_GROUPS.colors],
    order: [
      "style",
      "wavelength",
      "amplitude",
      "stroke",
      "layout",
      "count",
      "length",
      "angle",
      "palette",
      "background",
    ],
    params: {
      style: {
        group: "shape",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "style", SQUIGGLE_STYLES),
      },
      wavelength: { group: "shape", step: 0.5, unit: "%" },
      amplitude: { group: "shape", step: 0.5, unit: "%" },
      stroke: { group: "shape", step: 1, unit: "‰" },
      layout: {
        group: "layout",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "layout", SQUIGGLE_LAYOUTS),
      },
      count: { group: "layout", step: 1, visibleWhen: (p) => p.layout !== "single" },
      length: { group: "layout", step: 1, unit: "%", visibleWhen: (p) => p.layout === "scatter" },
      angle: { group: "layout", step: 1, unit: "°", visibleWhen: (p) => p.layout !== "scatter" },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    // New line shape and colours; the layout stays.
    const h = rng.float(0, 360);
    const next: SquiggleLinesParams = {
      ...current,
      style: rng.pick(SQUIGGLE_STYLES),
      wavelength: rng.int(4, 20),
      amplitude: rng.int(2, 10),
      stroke: rng.int(5, 20),
      angle: rng.pick([0, 0, -15, 15, -30, 45]),
      palette: Array.from({ length: rng.int(2, 4) }, (_, i) =>
        oklchToHex({ l: rng.float(0.45, 0.7), c: 0.17, h: (h + i * rng.float(40, 120)) % 360 }),
      ),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height, t }) {
      return squigglesSvg({
        width,
        height,
        background: p.background,
        colors: p.palette,
        style: p.style,
        layout: p.layout,
        count: p.count,
        wavelength: p.wavelength / 100,
        amplitude: p.amplitude / 100,
        stroke: p.stroke / 1000,
        length: p.length / 100,
        angle: p.angle,
        rng,
        ...(t !== undefined ? { t } : {}),
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "css-underline",
      labelKey: EXTRA_EXPORT_LABELS.css,
      language: "css",
      render: (p) => underlineCss(p),
    },
  ],
  animation: { sources: ["time", "colors"] },
});
