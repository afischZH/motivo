/**
 * S2: Liquid chrome (docs/TOOLS.md C7). Polished metal from a warped
 * noise height field: normals by finite differences, a fake environment
 * from the palette, a specular highlight and an optional rainbow shimmer.
 * Render kind `webgl` with a CPU twin and live web embeds.
 */
import { randomPalette } from "@musterli/engine";
import {
  LIQUID_CHROME_FRAGMENT,
  liquidChromeUniforms,
  renderLiquidChromeCpu,
  type LiquidChromeOptions,
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
import { COMMON_GROUPS, COMMON_LABELS, roundTo } from "./shared";

const ID = "liquid-chrome";

const schema = z.object({
  /** Environment ramp: shadow to sky. */
  palette: z.array(colorSchema).min(2).max(6),
  highlight: colorSchema,
  frequency: z.number().min(0.2).max(6),
  warp: z.number().min(0).max(3),
  detail: z.int().min(1).max(6),
  relief: z.number().min(0.05).max(2),
  bands: z.number().min(0.5).max(6),
  light: z.number().min(0).max(360),
  /** Percent. */
  specular: z.number().min(0).max(100),
  /** Percent. */
  iridescence: z.number().min(0).max(100),
  angle: z.number().min(0).max(360),
  ...shaderMotionSchema,
});

export type LiquidChromeParams = z.output<typeof schema>;

const defaults: LiquidChromeParams = {
  palette: ["#0b0c10", "#3a3f4b", "#c9ced8", "#6b7280", "#f8fafc"],
  highlight: "#ffffff",
  frequency: 0.8,
  warp: 0.7,
  detail: 3,
  relief: 0.35,
  bands: 1.5,
  light: 300,
  specular: 60,
  iridescence: 0,
  angle: 0,
  time: 0,
  speed: 0.4,
  grain: 4,
  vignette: 10,
};

const preset = (id: string, params: Partial<LiquidChromeParams>): Preset<LiquidChromeParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export function liquidChromeOptions(p: LiquidChromeParams, seed: number): LiquidChromeOptions {
  return {
    frequency: p.frequency,
    warp: p.warp,
    detail: p.detail,
    relief: p.relief,
    bands: p.bands,
    light: p.light,
    specular: p.specular / 100,
    iridescence: p.iridescence / 100,
    angle: p.angle,
    phase: p.time / 100,
    grain: p.grain / 100,
    vignette: p.vignette / 100,
    highlight: p.highlight,
    seed,
  };
}

const render: WebglRenderer<LiquidChromeParams> = {
  kind: "webgl",
  fragment: LIQUID_CHROME_FRAGMENT,
  uniforms: (p, ctx) => liquidChromeUniforms(liquidChromeOptions(p, ctx.seed), ctx.t ?? 0),
  palette: (p) => p.palette,
  loopSeconds: shaderLoopSeconds,
  reference: renderLiquidChromeCpu,
};

export const liquidChromeTool = defineTool({
  id: ID,
  version: 1,
  category: ["gradients", "backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1600, height: 1000 },
  presets: [
    preset("mercury", {}),
    preset("soft-silver", { relief: 0.2, detail: 2, bands: 1, specular: 40 }),
    preset("gold-leaf", {
      palette: ["#111827", "#8a6d1f", "#d4af37", "#fff7d6", "#fffbeb"],
      highlight: "#fffbeb",
      relief: 0.15,
      detail: 2,
      bands: 1,
    }),
    preset("oil-slick", {
      palette: ["#1e1b4b", "#6d28d9", "#f0abfc", "#a5f3fc", "#ffffff"],
      relief: 0.25,
      iridescence: 80,
    }),
    preset("black-chrome", {
      palette: ["#000000", "#111827", "#4b5563", "#111827", "#9ca3af"],
      relief: 0.4,
      bands: 2.5,
      specular: 80,
      vignette: 30,
    }),
    preset("rose-metal", {
      palette: ["#3b0a1a", "#9f1239", "#fda4af", "#fff1f2"],
      highlight: "#fff1f2",
      frequency: 0.6,
      warp: 1.1,
      relief: 0.3,
      bands: 1.8,
    }),
    preset("ice-folds", {
      palette: ["#082f49", "#0ea5e9", "#e0f2fe", "#7dd3fc", "#f0f9ff"],
      frequency: 1.4,
      warp: 0.5,
      relief: 0.25,
      bands: 2,
      iridescence: 20,
    }),
  ],
  randomize(rng, current, locks) {
    // Space rolls the shape and the light; colours stay unless unlocked palette is rolled.
    const next: LiquidChromeParams = {
      ...current,
      palette: rng.float(0, 1) < 0.5 ? current.palette : randomPalette(rng, rng.int(3, 5)),
      frequency: roundTo(rng.float(0.5, 1.4), 2),
      warp: roundTo(rng.float(0.4, 1.2), 2),
      light: rng.int(0, 71) * 5,
      angle: rng.int(0, 71) * 5,
      time: rng.int(0, 99),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette: (colors) => ({ palette: colors.slice(0, 6) }),
  render,
  exports: ["png", "jpg", "webp"],
  extraExports: webEmbedExports("Liquid chrome", render),
  animation: { sources: ["time", "colors"] },
  controls: {
    groups: [COMMON_GROUPS.colors, COMMON_GROUPS.shape, ...shaderMotionGroups(ID)],
    order: [
      "palette",
      "highlight",
      "frequency",
      "warp",
      "detail",
      "relief",
      "bands",
      "light",
      "specular",
      "iridescence",
      "angle",
      ...SHADER_MOTION_ORDER,
    ],
    params: {
      palette: { group: "colors", kind: "palette", labelKey: COMMON_LABELS.palette },
      highlight: { group: "colors" },
      frequency: { group: "shape", step: 0.05 },
      warp: { group: "shape", step: 0.05 },
      detail: { group: "shape", step: 1, advanced: true },
      relief: { group: "shape", step: 0.01 },
      bands: { group: "shape", step: 0.05 },
      light: { group: "shape", kind: "angle", step: 1, unit: "°" },
      specular: { group: "shape", step: 1, unit: "%" },
      iridescence: { group: "colors", step: 1, unit: "%" },
      angle: { group: "shape", kind: "angle", step: 1, unit: "°", advanced: true },
      ...shaderMotionControls(ID),
    },
  },
});
