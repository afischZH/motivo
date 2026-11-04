/**
 * S2: Dot wave grid (docs/TOOLS.md D9). A regular grid of dots, squares,
 * dashes, crosses or rings whose size and colour follow noise, waves or
 * ripples. Render kind `webgl` (docs/ARCHITECTURE.md 4.15), with a CPU
 * twin for static motifs and the live web embeds (4.22).
 */
import { randomPalette } from "@musterli/engine";
import {
  DOT_WAVE_FIELDS,
  DOT_WAVE_FRAGMENT,
  DOT_WAVE_SHAPES,
  dotWaveUniforms,
  renderDotWaveCpu,
  type DotWaveOptions,
} from "@musterli/shaders";
import * as z from "zod";
import { colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset, WebglRenderer } from "../types";
import { webEmbedExports } from "../web-embed";
import {
  SHADER_MOTION_ORDER,
  shaderLoopSeconds,
  shaderMotionControls,
  shaderMotionGroups,
  shaderMotionSchema,
} from "./shader-common";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "dot-wave";

const schema = z.object({
  /** Colour ramp of the dots, low to high field values. */
  palette: z.array(colorSchema).min(1).max(5),
  background: colorSchema,
  field: z.enum(DOT_WAVE_FIELDS),
  shape: z.enum(DOT_WAVE_SHAPES),
  /** Cell size in design px. */
  spacing: z.number().min(6).max(120),
  /** Smallest and largest mark, percent of the cell. */
  minSize: z.number().min(0).max(100),
  maxSize: z.number().min(5).max(100),
  frequency: z.number().min(0.2).max(8),
  angle: z.number().min(0).max(360),
  warp: z.number().min(0).max(3),
  /** Percent. */
  fade: z.number().min(0).max(100),
  ...shaderMotionSchema,
});

export type DotWaveParams = z.output<typeof schema>;

const defaults: DotWaveParams = {
  palette: ["#3b82f6", "#a855f7", "#f472b6"],
  background: "#0b0b14",
  field: "waves",
  shape: "dot",
  spacing: 28,
  minSize: 10,
  maxSize: 85,
  frequency: 1.5,
  angle: 30,
  warp: 1,
  fade: 50,
  time: 0,
  speed: 0.5,
  grain: 0,
  vignette: 0,
};

const preset = (id: string, params: Partial<DotWaveParams>): Preset<DotWaveParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export function dotWaveOptions(p: DotWaveParams, seed: number): DotWaveOptions {
  return {
    field: p.field,
    shape: p.shape,
    spacing: p.spacing,
    minSize: p.minSize / 100,
    maxSize: p.maxSize / 100,
    frequency: p.frequency,
    angle: p.angle,
    warp: p.warp,
    fade: p.fade / 100,
    phase: p.time / 100,
    background: p.background,
    grain: p.grain / 100,
    vignette: p.vignette / 100,
    seed,
  };
}

const render: WebglRenderer<DotWaveParams> = {
  kind: "webgl",
  fragment: DOT_WAVE_FRAGMENT,
  uniforms: (p, ctx) => dotWaveUniforms(dotWaveOptions(p, ctx.seed), ctx.t ?? 0),
  palette: (p) =>
    p.palette.length === 1 ? [p.palette[0] ?? "#ffffff", p.palette[0] ?? "#ffffff"] : p.palette,
  loopSeconds: shaderLoopSeconds,
  reference: renderDotWaveCpu,
};

export const dotWaveTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds", "patterns"],
  schema,
  defaults,
  defaultSize: { width: 1600, height: 1000 },
  presets: [
    preset("signal", {}),
    preset("halftone-swell", {
      field: "noise",
      palette: ["#111827", "#111827"],
      background: "#f5f0e6",
      spacing: 18,
      minSize: 0,
      maxSize: 100,
      frequency: 1.2,
      fade: 0,
    }),
    preset("ripple-pond", {
      field: "ripple",
      palette: ["#0e7490", "#22d3ee", "#ecfeff"],
      background: "#042f2e",
      spacing: 24,
      frequency: 3,
      warp: 0.6,
      fade: 40,
    }),
    preset("dash-field", {
      shape: "dash",
      palette: ["#f97316", "#facc15"],
      background: "#18181b",
      spacing: 32,
      minSize: 20,
      maxSize: 100,
      frequency: 1,
      angle: 335,
      fade: 30,
    }),
    preset("plus-grid", {
      shape: "cross",
      field: "noise",
      palette: ["#a3e635", "#22c55e"],
      background: "#052e16",
      spacing: 36,
      minSize: 15,
      maxSize: 70,
      frequency: 1.6,
      fade: 20,
    }),
    preset("ring-radar", {
      shape: "ring",
      field: "ripple",
      palette: ["#6366f1", "#e0e7ff"],
      background: "#020617",
      spacing: 40,
      minSize: 20,
      maxSize: 95,
      frequency: 2,
      warp: 0.4,
      fade: 60,
      vignette: 30,
    }),
    preset("paper-squares", {
      shape: "square",
      field: "waves",
      palette: ["#be123c", "#1d4ed8"],
      background: "#fafaf9",
      spacing: 22,
      minSize: 5,
      maxSize: 80,
      frequency: 1.1,
      angle: 120,
      warp: 1.6,
      fade: 0,
      grain: 10,
    }),
  ],
  randomize(rng, current, locks) {
    // Space rolls colours and the flow; field, shape, grid and texture stay.
    const next: DotWaveParams = {
      ...current,
      palette: randomPalette(rng, rng.int(2, 4)),
      frequency: roundTo(rng.float(0.8, 3), 2),
      angle: rng.int(0, 71) * 5,
      warp: roundTo(rng.float(0, 1.8), 2),
      time: rng.int(0, 99),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette: (colors) => ({ palette: colors.slice(0, 5) }),
  render,
  exports: ["png", "jpg", "webp"],
  extraExports: webEmbedExports("Dot wave grid", render),
  animation: { sources: ["time", "colors"] },
  controls: {
    groups: [COMMON_GROUPS.colors, COMMON_GROUPS.shape, ...shaderMotionGroups(ID)],
    order: [
      "palette",
      "background",
      "field",
      "shape",
      "spacing",
      "minSize",
      "maxSize",
      "frequency",
      "angle",
      "warp",
      "fade",
      ...SHADER_MOTION_ORDER,
    ],
    params: {
      palette: { group: "colors", kind: "palette", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
      field: {
        group: "shape",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "field", DOT_WAVE_FIELDS),
      },
      shape: {
        group: "shape",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "shape", DOT_WAVE_SHAPES),
      },
      spacing: { group: "shape", step: 1, unit: "px" },
      minSize: { group: "shape", step: 1, unit: "%" },
      maxSize: { group: "shape", step: 1, unit: "%" },
      frequency: { group: "shape", step: 0.05 },
      angle: { group: "shape", kind: "angle", step: 1, unit: "°" },
      warp: { group: "shape", step: 0.05, visibleWhen: (p) => p.field !== "noise" },
      fade: { group: "shape", step: 1, unit: "%" },
      ...shaderMotionControls(ID),
    },
  },
});
