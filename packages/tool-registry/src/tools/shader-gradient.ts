/**
 * M5-AP01: Shader gradient (docs/TOOLS.md C4). A fragment shader on the
 * GPU: seeded simplex noise with domain warping, a colour ramp from the
 * palette, optional Bayer dithering, grain and vignette. Render kind
 * `webgl` (docs/ARCHITECTURE.md 4.15): the editor draws it in its shader
 * worker for the preview and, in tiles, for every export; Node renders
 * static motifs with the CPU twin of the same algorithm.
 */
import { randomPalette } from "@musterli/engine";
import {
  SHADER_DITHERS,
  SHADER_GRADIENT_FRAGMENT,
  SHADER_GRADIENT_STYLES,
  renderShaderGradientCpu,
  shaderGradientUniforms,
  type ShaderGradientOptions,
} from "@musterli/shaders";
import * as z from "zod";
import { colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "shader-gradient";

export const SHADER_GRADIENT_COLORS_MIN = 2;
export const SHADER_GRADIENT_COLORS_MAX = 6;

/** Seconds of one preview loop at speed 1. */
export const SHADER_LOOP_SECONDS = 12;

const schema = z.object({
  /** Colour ramp, evenly spaced, mixed in OKLab. */
  palette: z.array(colorSchema).min(SHADER_GRADIENT_COLORS_MIN).max(SHADER_GRADIENT_COLORS_MAX),
  style: z.enum(SHADER_GRADIENT_STYLES),
  /** Waves per shorter edge. */
  frequency: z.number().min(0.2).max(6),
  /** How far the field spreads over the ramp. */
  amplitude: z.number().min(0).max(2),
  /** Domain warping strength. */
  warp: z.number().min(0).max(3),
  /** fbm octaves. */
  detail: z.int().min(1).max(6),
  angle: z.number().min(0).max(360),
  zoom: z.number().min(0.25).max(4),
  /** Loop phase in percent: the still frame of every export. */
  time: z.number().min(0).max(100),
  /** Live preview only: loops per `SHADER_LOOP_SECONDS`, 0 = still. */
  speed: z.number().min(0).max(2),
  dither: z.enum(SHADER_DITHERS),
  /** Ramp steps with dithering. */
  levels: z.int().min(2).max(16),
  /** Dither cell in design pixels. */
  ditherScale: z.int().min(1).max(8),
  /** Percent. */
  grain: z.number().min(0).max(100),
  /** Percent. */
  vignette: z.number().min(0).max(100),
});

export type ShaderGradientParams = z.output<typeof schema>;

const defaults: ShaderGradientParams = {
  palette: ["#1e1b4b", "#7c3aed", "#f472b6", "#fde68a"],
  style: "liquid",
  frequency: 1.2,
  amplitude: 1,
  warp: 0.9,
  detail: 4,
  angle: 0,
  zoom: 1,
  time: 0,
  speed: 0.5,
  dither: "off",
  levels: 6,
  ditherScale: 2,
  grain: 8,
  vignette: 15,
};

const preset = (
  id: string,
  params: Partial<ShaderGradientParams>,
): Preset<ShaderGradientParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Shader options of the params (percentages to fractions). */
export function shaderGradientOptions(
  p: ShaderGradientParams,
  seed: number,
): ShaderGradientOptions {
  return {
    style: p.style,
    frequency: p.frequency,
    amplitude: p.amplitude,
    warp: p.warp,
    detail: p.detail,
    angle: p.angle,
    zoom: p.zoom,
    phase: p.time / 100,
    dither: p.dither,
    levels: p.levels,
    ditherScale: p.ditherScale,
    grain: p.grain / 100,
    vignette: p.vignette / 100,
    seed,
  };
}

const dithered = (p: ShaderGradientParams) => p.dither !== "off";

export const shaderGradientTool = defineTool({
  id: ID,
  version: 1,
  category: ["gradients"],
  schema,
  defaults,
  defaultSize: { width: 1600, height: 1000 },
  presets: [
    preset("liquid", {}),
    preset("silk", {
      style: "silk",
      palette: ["#0f172a", "#334155", "#94a3b8", "#e2e8f0"],
      frequency: 2.2,
      warp: 1.1,
      angle: 25,
      grain: 4,
      vignette: 25,
    }),
    preset("streaked", {
      style: "streaked",
      palette: ["#0c4a6e", "#0ea5e9", "#f0abfc", "#fff7ed"],
      frequency: 1.6,
      warp: 1.2,
      angle: 335,
      grain: 6,
      vignette: 10,
    }),
    preset("grainy", {
      style: "grainy",
      palette: ["#fb7185", "#f97316", "#facc15", "#fef3c7"],
      frequency: 1.6,
      warp: 1.4,
      grain: 45,
      vignette: 0,
    }),
    preset("marble", {
      style: "marble",
      palette: ["#f8fafc", "#cbd5e1", "#475569", "#0f172a"],
      frequency: 1.5,
      warp: 1.2,
      detail: 5,
      angle: 60,
      grain: 3,
      vignette: 20,
    }),
    preset("ripple", {
      style: "ripple",
      palette: ["#022c22", "#059669", "#a7f3d0", "#ecfeff"],
      frequency: 1.1,
      warp: 1,
      grain: 5,
      vignette: 30,
    }),
    preset("aurora", {
      style: "aurora",
      palette: ["#020617", "#065f46", "#22d3ee", "#a78bfa"],
      frequency: 1.3,
      warp: 1.3,
      grain: 10,
      vignette: 35,
    }),
    preset("retro-dither", {
      style: "liquid",
      palette: ["#1a1c2c", "#5d275d", "#b13e53", "#ef7d57", "#ffcd75"],
      frequency: 1,
      warp: 1,
      dither: "bayer4",
      levels: 5,
      ditherScale: 4,
      grain: 0,
      vignette: 0,
      speed: 0.3,
    }),
  ],
  randomize(rng, current, locks) {
    // Space rolls colours and the flow; style, texture, zoom, detail and
    // speed stay. The noise itself follows the new seed.
    const next: ShaderGradientParams = {
      ...current,
      palette: randomPalette(rng, rng.int(3, 5)),
      frequency: roundTo(rng.float(0.8, 2), 2),
      amplitude: roundTo(rng.float(0.85, 1.3), 2),
      warp: roundTo(rng.float(0.5, 1.6), 2),
      angle: rng.int(0, 71) * 5,
      time: rng.int(0, 99),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette: (colors) => ({ palette: colors.slice(0, SHADER_GRADIENT_COLORS_MAX) }),
  render: {
    kind: "webgl",
    fragment: SHADER_GRADIENT_FRAGMENT,
    uniforms: (p, ctx) => shaderGradientUniforms(shaderGradientOptions(p, ctx.seed), ctx.t ?? 0),
    palette: (p) => p.palette,
    loopSeconds: (p) => (p.speed > 0 ? SHADER_LOOP_SECONDS / p.speed : 0),
    reference: renderShaderGradientCpu,
  },
  exports: ["png", "jpg", "webp"],
  animation: { sources: ["time", "colors"] },
  controls: {
    groups: [
      COMMON_GROUPS.colors,
      COMMON_GROUPS.shape,
      { id: "motion", labelKey: `tools.${ID}.groups.motion` },
      { id: "texture", labelKey: `tools.${ID}.groups.texture` },
    ],
    order: [
      "palette",
      "style",
      "frequency",
      "amplitude",
      "warp",
      "detail",
      "angle",
      "zoom",
      "time",
      "speed",
      "dither",
      "levels",
      "ditherScale",
      "grain",
      "vignette",
    ],
    params: {
      palette: { group: "colors", kind: "palette", labelKey: COMMON_LABELS.palette },
      style: {
        group: "shape",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "style", SHADER_GRADIENT_STYLES),
      },
      frequency: { group: "shape", step: 0.05 },
      amplitude: { group: "shape", step: 0.05 },
      warp: { group: "shape", step: 0.05 },
      detail: { group: "shape", step: 1, advanced: true },
      angle: { group: "shape", kind: "angle", step: 1, unit: "°" },
      zoom: { group: "shape", step: 0.05, advanced: true },
      time: {
        group: "motion",
        step: 1,
        unit: "%",
        descriptionKey: `tools.${ID}.params.time.description`,
      },
      speed: {
        group: "motion",
        step: 0.05,
        descriptionKey: `tools.${ID}.params.speed.description`,
      },
      dither: {
        group: "texture",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "dither", SHADER_DITHERS),
      },
      levels: { group: "texture", step: 1, visibleWhen: dithered },
      ditherScale: { group: "texture", step: 1, unit: "px", visibleWhen: dithered },
      grain: { group: "texture", step: 1, unit: "%" },
      vignette: { group: "texture", step: 1, unit: "%" },
    },
  },
});
