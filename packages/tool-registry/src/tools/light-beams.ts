/**
 * S2: Light beams (docs/TOOLS.md D11). Soft rays from a light source
 * through haze, like stage lights or sun through a window. Render kind
 * `webgl` with a CPU twin and live web embeds.
 */
import { randomPalette } from "@musterli/engine";
import {
  LIGHT_BEAMS_FRAGMENT,
  lightBeamsUniforms,
  renderLightBeamsCpu,
  type LightBeamsOptions,
} from "@musterli/shaders";
import * as z from "zod";
import { colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset, RenderContext, WebglRenderer } from "../types";
import { webEmbedExports } from "../web-embed";
import {
  SHADER_MOTION_ORDER,
  shaderLoopSeconds,
  shaderMotionControls,
  shaderMotionGroups,
  shaderMotionSchema,
} from "./shader-common";
import { COMMON_GROUPS, COMMON_LABELS, roundTo } from "./shared";

const ID = "light-beams";

const schema = z.object({
  /** Ramp from darkness to the brightest light. */
  palette: z.array(colorSchema).min(2).max(6),
  /** Source position, percent of the canvas (outside allowed). */
  sourceX: z.number().min(-50).max(150),
  sourceY: z.number().min(-50).max(150),
  direction: z.number().min(0).max(360),
  spread: z.number().min(10).max(360),
  density: z.number().min(1).max(24),
  sharpness: z.number().min(1).max(8),
  decay: z.number().min(0).max(4),
  intensity: z.number().min(0).max(2),
  /** Percent. */
  haze: z.number().min(0).max(100),
  ...shaderMotionSchema,
});

export type LightBeamsParams = z.output<typeof schema>;

const defaults: LightBeamsParams = {
  palette: ["#020617", "#1e3a8a", "#93c5fd", "#ffffff"],
  sourceX: 50,
  sourceY: -10,
  direction: 90,
  spread: 90,
  density: 4,
  sharpness: 2,
  decay: 0.8,
  intensity: 1,
  haze: 80,
  time: 0,
  speed: 0.3,
  grain: 5,
  vignette: 20,
};

const preset = (id: string, params: Partial<LightBeamsParams>): Preset<LightBeamsParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export function lightBeamsOptions(p: LightBeamsParams, ctx: RenderContext): LightBeamsOptions {
  return {
    sourceX: p.sourceX / 100,
    sourceY: p.sourceY / 100,
    direction: p.direction,
    spread: p.spread,
    density: p.density,
    sharpness: p.sharpness,
    decay: p.decay,
    intensity: p.intensity,
    haze: p.haze / 100,
    phase: p.time / 100,
    grain: p.grain / 100,
    vignette: p.vignette / 100,
    width: ctx.width,
    height: ctx.height,
    seed: ctx.seed,
  };
}

const render: WebglRenderer<LightBeamsParams> = {
  kind: "webgl",
  fragment: LIGHT_BEAMS_FRAGMENT,
  uniforms: (p, ctx) => lightBeamsUniforms(lightBeamsOptions(p, ctx), ctx.t ?? 0),
  palette: (p) => p.palette,
  loopSeconds: shaderLoopSeconds,
  reference: renderLightBeamsCpu,
};

export const lightBeamsTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1600, height: 1000 },
  presets: [
    preset("blue-hour", {}),
    preset("golden-rays", {
      palette: ["#05060a", "#1e293b", "#fbbf24", "#fff7ed"],
      sourceX: 30,
      sourceY: -20,
      direction: 70,
      spread: 120,
      density: 6,
      sharpness: 3,
      decay: 0.6,
      intensity: 1.2,
      haze: 50,
    }),
    preset("stage", {
      palette: ["#0a0a0a", "#4c1d95", "#e879f9", "#fdf4ff"],
      sourceX: 50,
      sourceY: 110,
      direction: 270,
      spread: 60,
      density: 3,
      sharpness: 4,
      decay: 0.5,
      haze: 60,
      vignette: 35,
    }),
    preset("cathedral", {
      palette: ["#1c1917", "#78716c", "#fde68a", "#fffbeb"],
      sourceX: 85,
      sourceY: -30,
      direction: 120,
      spread: 50,
      density: 9,
      sharpness: 5,
      decay: 0.4,
      intensity: 1.4,
      haze: 40,
    }),
    preset("forest-sun", {
      palette: ["#052e16", "#166534", "#bef264", "#fefce8"],
      sourceX: 70,
      sourceY: -15,
      direction: 105,
      spread: 140,
      density: 12,
      sharpness: 3,
      decay: 0.7,
      haze: 70,
      grain: 8,
    }),
    preset("sunburst", {
      palette: ["#7c2d12", "#ea580c", "#fdba74", "#fff7ed"],
      sourceX: 50,
      sourceY: 50,
      spread: 360,
      density: 7,
      sharpness: 2,
      decay: 1.2,
      intensity: 1.3,
      haze: 30,
      vignette: 40,
    }),
    preset("underwater", {
      palette: ["#082f49", "#0369a1", "#67e8f9", "#ecfeff"],
      sourceX: 40,
      sourceY: -40,
      direction: 80,
      spread: 70,
      density: 5,
      sharpness: 2.5,
      decay: 0.9,
      haze: 90,
      speed: 0.5,
    }),
  ],
  randomize(rng, current, locks) {
    const next: LightBeamsParams = {
      ...current,
      palette: randomPalette(rng, rng.int(3, 4)),
      density: roundTo(rng.float(2, 12), 1),
      sharpness: roundTo(rng.float(1.5, 5), 1),
      sourceX: rng.int(10, 90),
      time: rng.int(0, 99),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette: (colors) => ({ palette: colors.slice(0, 6) }),
  render,
  exports: ["png", "jpg", "webp"],
  extraExports: webEmbedExports("Light beams", render),
  animation: { sources: ["time", "colors"] },
  controls: {
    groups: [COMMON_GROUPS.colors, COMMON_GROUPS.shape, ...shaderMotionGroups(ID)],
    order: [
      "palette",
      "sourceX",
      "sourceY",
      "direction",
      "spread",
      "density",
      "sharpness",
      "decay",
      "intensity",
      "haze",
      ...SHADER_MOTION_ORDER,
    ],
    params: {
      palette: { group: "colors", kind: "palette", labelKey: COMMON_LABELS.palette },
      sourceX: { group: "shape", step: 1, unit: "%" },
      sourceY: { group: "shape", step: 1, unit: "%" },
      direction: { group: "shape", kind: "angle", step: 1, unit: "°" },
      spread: { group: "shape", step: 1, unit: "°" },
      density: { group: "shape", step: 0.1 },
      sharpness: { group: "shape", step: 0.1 },
      decay: { group: "shape", step: 0.05 },
      intensity: { group: "colors", step: 0.05 },
      haze: { group: "colors", step: 1, unit: "%" },
      ...shaderMotionControls(ID),
    },
  },
});
