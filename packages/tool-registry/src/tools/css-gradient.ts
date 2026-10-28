/**
 * M1-AP07: CSS Gradient (docs/TOOLS.md B2). Linear, radial and conic CSS
 * gradients with eased stops and OKLCH interpolation; SVG preview included.
 */
import {
  COLOR_SPACES,
  EASINGS,
  GRADIENT_TYPES,
  HUE_INTERPOLATIONS,
  RADIAL_SHAPES,
  cssGradient,
  cssGradientTailwind,
  randomPalette,
} from "@musterli/engine";
import * as z from "zod";
import { paletteSchema } from "../common";
import { keepLocked } from "../randomize";
import { COLOR_ANIMATION } from "../animation";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "css-gradient";

// No `background`: the gradient always covers the whole canvas.
const schema = z.object({
  palette: paletteSchema,
  type: z.enum(GRADIENT_TYPES),
  angle: z.number().min(0).max(360),
  centerX: z.number().min(0).max(100),
  centerY: z.number().min(0).max(100),
  shape: z.enum(RADIAL_SHAPES),
  interpolation: z.enum(COLOR_SPACES),
  hue: z.enum(HUE_INTERPOLATIONS),
  easing: z.enum(EASINGS),
  steps: z.int().min(0).max(24),
  loop: z.boolean(),
});

export type CssGradientParams = z.output<typeof schema>;

const defaults: CssGradientParams = {
  palette: ["#ff7e5f", "#7b2ff7"],
  type: "linear",
  angle: 135,
  centerX: 50,
  centerY: 50,
  shape: "ellipse",
  interpolation: "oklch",
  hue: "shorter",
  easing: "ease-in-out",
  steps: 8,
  loop: false,
};

const preset = (id: string, params: Partial<CssGradientParams>): Preset<CssGradientParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const cssGradientTool = defineTool({
  id: ID,
  version: 1,
  category: ["gradients", "css-patterns", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("dawn", { palette: ["#ffd6a5", "#ff8fab", "#6a4c93"], angle: 160 }),
    preset("lagoon", { palette: ["#00b4d8", "#0077b6", "#03045e"], angle: 180, easing: "ease-in" }),
    preset("ember", {
      palette: ["#fff3b0", "#e09f3e", "#540b0e"],
      type: "radial",
      centerX: 30,
      centerY: 25,
      easing: "ease-out",
    }),
    preset("prism", {
      palette: ["#ff4d6d", "#4cc9f0"],
      type: "conic",
      angle: 0,
      hue: "longer",
      easing: "linear",
      loop: true,
    }),
    preset("meadow", {
      palette: ["#d8f3dc", "#95d5b2", "#2d6a4f"],
      angle: 90,
      interpolation: "srgb",
      easing: "linear",
    }),
    preset("dusk", {
      palette: ["#ff9e00", "#9d4edd", "#10002b"],
      type: "radial",
      shape: "circle",
      centerX: 50,
      centerY: 100,
    }),
    preset("citrus", {
      palette: ["#f9c74f", "#90be6d", "#f94144"],
      type: "conic",
      angle: 45,
      centerX: 40,
      centerY: 60,
      interpolation: "oklab",
      loop: true,
    }),
  ],
  controls: {
    groups: [
      COMMON_GROUPS.colors,
      { id: "gradient", labelKey: `tools.${ID}.groups.gradient` },
      { id: "easing", labelKey: `tools.${ID}.groups.easing` },
    ],
    order: [
      "palette",
      "interpolation",
      "hue",
      "type",
      "angle",
      "centerX",
      "centerY",
      "shape",
      "loop",
      "easing",
      "steps",
    ],
    params: {
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      interpolation: {
        group: "colors",
        optionLabelKeys: optionLabels(ID, "interpolation", COLOR_SPACES),
      },
      hue: {
        group: "colors",
        optionLabelKeys: optionLabels(ID, "hue", HUE_INTERPOLATIONS),
        visibleWhen: (p) => p.interpolation === "oklch",
      },
      type: { group: "gradient", optionLabelKeys: optionLabels(ID, "type", GRADIENT_TYPES) },
      angle: {
        group: "gradient",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: (p) => p.type !== "radial",
      },
      centerX: { group: "gradient", step: 1, unit: "%", visibleWhen: (p) => p.type !== "linear" },
      centerY: { group: "gradient", step: 1, unit: "%", visibleWhen: (p) => p.type !== "linear" },
      shape: {
        group: "gradient",
        optionLabelKeys: optionLabels(ID, "shape", RADIAL_SHAPES),
        visibleWhen: (p) => p.type === "radial",
      },
      loop: { group: "gradient" },
      easing: { group: "easing", optionLabelKeys: optionLabels(ID, "easing", EASINGS) },
      steps: {
        group: "easing",
        advanced: true,
        visibleWhen: (p) => p.easing !== "linear" || p.interpolation !== "srgb",
      },
    },
  },
  randomize(rng, current, locks) {
    const roll = rng.next();
    const type = roll < 0.5 ? "linear" : roll < 0.8 ? "radial" : "conic";
    const next: CssGradientParams = {
      palette: randomPalette(rng, rng.int(2, 4)),
      type,
      angle: rng.int(0, 71) * 5,
      centerX: rng.int(0, 20) * 5,
      centerY: rng.int(0, 20) * 5,
      shape: rng.pick(RADIAL_SHAPES),
      interpolation: rng.bool(0.8) ? "oklch" : rng.pick(["oklab", "srgb"] as const),
      hue: rng.bool(0.85) ? "shorter" : "longer",
      easing: rng.pick(EASINGS),
      // Technical setting: keep it as the user chose it.
      steps: current.steps,
      loop: rng.bool(type === "conic" ? 0.7 : 0.15),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "css",
    render(p, { width, height }) {
      return cssGradient({ ...p, colors: p.palette, width, height });
    },
  },
  exports: ["css", "svg", "png", "jpg", "webp"],
  animation: COLOR_ANIMATION,
  extraExports: [
    {
      id: "tailwind",
      labelKey: EXTRA_EXPORT_LABELS.tailwind,
      language: "html",
      render(p, { width, height }) {
        return cssGradientTailwind({ ...p, colors: p.palette, width, height });
      },
    },
  ],
});
