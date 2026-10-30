/**
 * M4c-AP04: Duotone and gradient map (docs/TOOLS.md L4). A photo (or the
 * built-in demo picture) mapped to two, three or any number of colours by
 * its luminance, with a tone curve, grain and a blend with the original.
 * Render kind `image-effect`: the editor runs `applyGradientMap` in a worker
 * at the preview resolution and again at full size for the export
 * (docs/ARCHITECTURE.md 4.14).
 */
import {
  DEMO_PHOTO_SIZE,
  LUMA_WEIGHTS,
  applyGradientMap,
  demoPhoto,
  type LumaWeights,
} from "@musterli/effects";
import { hexToOklch, oklchToHex } from "@musterli/engine";
import * as z from "zod";
import {
  EFFECT_PHOTO_RASTER_MAX_EDGE,
  colorSchema,
  effectPhotoAssetSchema,
  paletteSchema,
} from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "duotone";

export const DUOTONE_MODES = ["duotone", "tritone", "gradient"] as const;
export const LUMA_CHOICES = ["rec709", "rec601", "average", "custom"] as const;

const schema = z.object({
  /** The user's photo; `null` shows the demo picture. Local only. */
  photo: effectPhotoAssetSchema.nullable(),
  mode: z.enum(DUOTONE_MODES),
  shadows: colorSchema,
  midtones: colorSchema,
  highlights: colorSchema,
  /** Gradient stops for `gradient`, dark end first. */
  palette: paletteSchema,
  weights: z.enum(LUMA_CHOICES),
  red: z.number().min(0).max(100),
  green: z.number().min(0).max(100),
  blue: z.number().min(0).max(100),
  brightness: z.number().min(-100).max(100),
  contrast: z.number().min(-100).max(100),
  gamma: z.number().min(0.25).max(4),
  /** Grain strength, percent. */
  grain: z.number().min(0).max(100),
  /** Grain cell size in design pixels. */
  grainSize: z.number().min(1).max(6),
  /** Share of the effect over the original, percent. */
  amount: z.number().min(0).max(100),
});

export type DuotoneParams = z.output<typeof schema>;

const defaults: DuotoneParams = {
  photo: null,
  mode: "duotone",
  shadows: "#1d1a4f",
  midtones: "#c2477a",
  highlights: "#ff9f7a",
  palette: ["#0b1026", "#1f5f8b", "#25c2a0", "#f2f7a1"],
  weights: "rec709",
  red: 30,
  green: 59,
  blue: 11,
  brightness: 0,
  contrast: 10,
  gamma: 1,
  grain: 0,
  grainSize: 1.5,
  amount: 100,
};

const preset = (id: string, params: Partial<DuotoneParams>): Preset<DuotoneParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Gradient stops of the params, dark end first. */
export function duotoneStops(p: DuotoneParams): string[] {
  if (p.mode === "gradient") return [...p.palette];
  if (p.mode === "tritone") return [p.shadows, p.midtones, p.highlights];
  return [p.shadows, p.highlights];
}

function weightsOf(p: DuotoneParams): LumaWeights {
  return p.weights === "custom" ? { r: p.red, g: p.green, b: p.blue } : LUMA_WEIGHTS[p.weights];
}

const byLightness = (colors: readonly string[]): string[] =>
  [...colors].sort((a, b) => hexToOklch(a).l - hexToOklch(b).l);

export const duotoneTool = defineTool({
  id: ID,
  version: 1,
  category: ["image-effects"],
  schema,
  defaults,
  defaultSize: { ...DEMO_PHOTO_SIZE },
  localParams: ["photo"],
  photoSource: {
    param: "photo",
    sample: demoPhoto,
  },
  presets: [
    preset("indigo-coral", {}),
    preset("newsprint", {
      shadows: "#1b1b1b",
      highlights: "#f1e9d8",
      contrast: 25,
      grain: 45,
      grainSize: 1.2,
    }),
    preset("plum-mint", { shadows: "#3b1846", highlights: "#a8f0cf", contrast: 15 }),
    preset("sunset", {
      mode: "tritone",
      shadows: "#2a0f3d",
      midtones: "#e0466e",
      highlights: "#ffd27a",
      contrast: 20,
    }),
    preset("cyanotype", {
      shadows: "#0b2a5b",
      highlights: "#e8f1f5",
      gamma: 1.2,
      grain: 15,
      grainSize: 2,
    }),
    preset("sepia", {
      mode: "tritone",
      shadows: "#2b1a0e",
      midtones: "#a0703f",
      highlights: "#f6e7c8",
      amount: 85,
      grain: 20,
    }),
    preset("aurora", { mode: "gradient", contrast: 20, gamma: 1.1 }),
    preset("lime-navy", { shadows: "#0d1b4c", highlights: "#c6f432", contrast: 20 }),
    preset("rose-gold", {
      mode: "tritone",
      shadows: "#3d1f2b",
      midtones: "#c97b84",
      highlights: "#f7e1d7",
      contrast: 10,
      gamma: 1.1,
    }),
    preset("noir", {
      shadows: "#0a0a0a",
      highlights: "#f2f2f2",
      contrast: 35,
      grain: 25,
      grainSize: 1.5,
    }),
    preset("vapor", {
      mode: "gradient",
      palette: ["#2b0f54", "#ab1f65", "#ff4f69", "#ff8142", "#ffda45"],
      contrast: 15,
    }),
  ],
  brandPalette(colors) {
    const sorted = byLightness(colors);
    const dark = sorted[0] ?? defaults.shadows;
    const light = sorted[sorted.length - 1] ?? defaults.highlights;
    return {
      shadows: dark,
      highlights: light,
      midtones: sorted[Math.floor(sorted.length / 2)] ?? dark,
      palette: sorted.length >= 2 ? sorted.slice(0, 10) : [dark, light],
    };
  },
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const shift = rng.pick([150, 180, 200, 60, 90, -60, -90]);
    const dark = oklchToHex({ l: rng.float(0.16, 0.3), c: rng.float(0.05, 0.14), h: hue });
    const light = oklchToHex({
      l: rng.float(0.82, 0.95),
      c: rng.float(0.05, 0.13),
      h: (hue + shift + 360) % 360,
    });
    const mid = oklchToHex({
      l: rng.float(0.5, 0.65),
      c: rng.float(0.12, 0.2),
      h: (hue + shift / 2 + 360) % 360,
    });
    const stops = rng.int(3, 5);
    const palette = Array.from({ length: stops }, (_, i) => {
      const t = i / (stops - 1);
      return oklchToHex({
        l: roundTo(0.14 + t * 0.8, 3),
        c: roundTo(0.06 + Math.sin(t * Math.PI) * 0.12, 3),
        h: (hue + t * shift + 360) % 360,
      });
    });
    return keepLocked(
      { ...current, shadows: dark, midtones: mid, highlights: light, palette },
      current,
      locks,
    );
  },
  render: {
    kind: "image-effect",
    render(input, p, ctx) {
      // Grain cells are sized in design pixels: a preview at half size gets half-size cells.
      const scale = input.width / Math.max(1, ctx.width);
      return applyGradientMap(input, {
        stops: duotoneStops(p),
        weights: weightsOf(p),
        brightness: p.brightness,
        contrast: p.contrast,
        gamma: p.gamma,
        grain: p.grain / 100,
        grainCell: p.grainSize * scale,
        seed: ctx.seed,
        amount: p.amount / 100,
      });
    },
  },
  exports: ["png", "jpg", "webp"],
  controls: {
    groups: [
      { id: "photo", labelKey: `tools.${ID}.groups.photo` },
      COMMON_GROUPS.colors,
      { id: "tone", labelKey: `tools.${ID}.groups.tone` },
      { id: "texture", labelKey: `tools.${ID}.groups.texture` },
    ],
    order: [
      "photo",
      "mode",
      "shadows",
      "midtones",
      "highlights",
      "palette",
      "brightness",
      "contrast",
      "gamma",
      "weights",
      "red",
      "green",
      "blue",
      "grain",
      "grainSize",
      "amount",
    ],
    params: {
      photo: {
        group: "photo",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.photo.description`,
        image: { maxEdge: EFFECT_PHOTO_RASTER_MAX_EDGE, photo: true, rasterOnly: true },
      },
      mode: {
        group: "colors",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "mode", DUOTONE_MODES),
      },
      shadows: { group: "colors", visibleWhen: (p) => p.mode !== "gradient" },
      midtones: { group: "colors", visibleWhen: (p) => p.mode === "tritone" },
      highlights: { group: "colors", visibleWhen: (p) => p.mode !== "gradient" },
      palette: {
        group: "colors",
        labelKey: COMMON_LABELS.palette,
        visibleWhen: (p) => p.mode === "gradient",
      },
      brightness: { group: "tone", step: 1 },
      contrast: { group: "tone", step: 1 },
      gamma: { group: "tone", step: 0.05 },
      weights: {
        group: "tone",
        kind: "select",
        advanced: true,
        optionLabelKeys: optionLabels(ID, "weights", LUMA_CHOICES),
      },
      red: { group: "tone", step: 1, unit: "%", visibleWhen: (p) => p.weights === "custom" },
      green: { group: "tone", step: 1, unit: "%", visibleWhen: (p) => p.weights === "custom" },
      blue: { group: "tone", step: 1, unit: "%", visibleWhen: (p) => p.weights === "custom" },
      grain: { group: "texture", step: 1, unit: "%" },
      grainSize: {
        group: "texture",
        step: 0.1,
        unit: "px",
        visibleWhen: (p) => p.grain > 0,
      },
      amount: { group: "texture", step: 1, unit: "%" },
    },
  },
});
