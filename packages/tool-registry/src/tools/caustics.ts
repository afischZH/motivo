/**
 * S2: Caustics and cells (docs/TOOLS.md D10). Animated Voronoi cells as
 * pool-light caustics, shaded cells or crystal facets. Render kind
 * `webgl` with a CPU twin and live web embeds.
 */
import { randomPalette } from "@musterli/engine";
import {
  CAUSTICS_FRAGMENT,
  CAUSTICS_STYLES,
  causticsUniforms,
  renderCausticsCpu,
  type CausticsOptions,
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

const ID = "caustics";

const schema = z.object({
  /** Ramp from deep to bright. */
  palette: z.array(colorSchema).min(2).max(6),
  style: z.enum(CAUSTICS_STYLES),
  /** Cells per shorter edge. */
  scale: z.number().min(2).max(40),
  /** Percent. */
  jitter: z.number().min(0).max(100),
  warp: z.number().min(0).max(2),
  /** Percent. */
  edge: z.number().min(0).max(100),
  contrast: z.number().min(0.5).max(2),
  angle: z.number().min(0).max(360),
  ...shaderMotionSchema,
});

export type CausticsParams = z.output<typeof schema>;

const defaults: CausticsParams = {
  palette: ["#03243a", "#0e7490", "#67e8f9", "#ecfeff"],
  style: "caustics",
  scale: 6,
  jitter: 100,
  warp: 0.6,
  edge: 30,
  contrast: 1,
  angle: 0,
  time: 0,
  speed: 0.4,
  grain: 3,
  vignette: 10,
};

const preset = (id: string, params: Partial<CausticsParams>): Preset<CausticsParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export function causticsOptions(p: CausticsParams, seed: number): CausticsOptions {
  return {
    style: p.style,
    scale: p.scale,
    jitter: p.jitter / 100,
    warp: p.warp,
    edge: p.edge / 100,
    contrast: p.contrast,
    angle: p.angle,
    phase: p.time / 100,
    grain: p.grain / 100,
    vignette: p.vignette / 100,
    seed,
  };
}

const render: WebglRenderer<CausticsParams> = {
  kind: "webgl",
  fragment: CAUSTICS_FRAGMENT,
  uniforms: (p, ctx) => causticsUniforms(causticsOptions(p, ctx.seed), ctx.t ?? 0),
  palette: (p) => p.palette,
  loopSeconds: shaderLoopSeconds,
  reference: renderCausticsCpu,
};

export const causticsTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds", "patterns"],
  schema,
  defaults,
  defaultSize: { width: 1600, height: 1000 },
  presets: [
    preset("pool", {}),
    preset("tropical-lagoon", {
      palette: ["#064e3b", "#10b981", "#a7f3d0", "#f0fdf4"],
      scale: 4,
      warp: 1,
      edge: 45,
    }),
    preset("stained-glass", {
      style: "cells",
      palette: ["#1e1b4b", "#be185d", "#f59e0b", "#22d3ee", "#f8fafc"],
      scale: 8,
      warp: 0.2,
      edge: 25,
      grain: 6,
    }),
    preset("cell-culture", {
      style: "cells",
      palette: ["#fdf2f8", "#f9a8d4", "#db2777", "#831843"],
      scale: 12,
      jitter: 90,
      warp: 0.8,
      edge: 10,
      contrast: 1.2,
    }),
    preset("ice-crystal", {
      style: "crystal",
      palette: ["#0c4a6e", "#38bdf8", "#e0f2fe", "#ffffff"],
      scale: 7,
      warp: 0,
      edge: 20,
      vignette: 20,
    }),
    preset("amethyst", {
      style: "crystal",
      palette: ["#2e1065", "#7c3aed", "#c4b5fd", "#faf5ff"],
      scale: 5,
      warp: 0.3,
      edge: 40,
    }),
    preset("night-swim", {
      palette: ["#020617", "#1e3a8a", "#38bdf8", "#e0f2fe"],
      scale: 9,
      warp: 0.8,
      edge: 15,
      contrast: 1.3,
      vignette: 35,
    }),
  ],
  randomize(rng, current, locks) {
    const next: CausticsParams = {
      ...current,
      palette: randomPalette(rng, rng.int(3, 5)),
      scale: roundTo(rng.float(3, 12), 1),
      warp: roundTo(rng.float(0, 1.2), 2),
      angle: rng.int(0, 71) * 5,
      time: rng.int(0, 99),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette: (colors) => ({ palette: colors.slice(0, 6) }),
  render,
  exports: ["png", "jpg", "webp"],
  extraExports: webEmbedExports("Caustics and cells", render),
  animation: { sources: ["time", "colors"] },
  controls: {
    groups: [COMMON_GROUPS.colors, COMMON_GROUPS.shape, ...shaderMotionGroups(ID)],
    order: [
      "palette",
      "style",
      "scale",
      "jitter",
      "warp",
      "edge",
      "contrast",
      "angle",
      ...SHADER_MOTION_ORDER,
    ],
    params: {
      palette: { group: "colors", kind: "palette", labelKey: COMMON_LABELS.palette },
      style: {
        group: "shape",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "style", CAUSTICS_STYLES),
      },
      scale: { group: "shape", step: 0.1 },
      jitter: { group: "shape", step: 1, unit: "%" },
      warp: { group: "shape", step: 0.05 },
      edge: { group: "shape", step: 1, unit: "%" },
      contrast: { group: "colors", step: 0.05 },
      angle: { group: "shape", kind: "angle", step: 1, unit: "°", advanced: true },
      ...shaderMotionControls(ID),
    },
  },
});
