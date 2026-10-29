/**
 * M6-AP01: God Rays (docs/TOOLS.md E5). Light shafts from a point light
 * over a photo (or the demo picture): the bright parts above a threshold
 * scatter toward the viewer, sampled along the way to the light with a
 * decay, added or screened in the ray colour. Render kind `image-effect`
 * (worker, docs/ARCHITECTURE.md 4.14); the rays are computed on a capped
 * grid inside the effect, so no `render.grid` is needed.
 */
import {
  DEMO_PHOTO_SIZE,
  GOD_RAYS_BLENDS,
  GOD_RAYS_SAMPLES_MAX,
  LUMA_WEIGHTS,
  applyGodRays,
  demoPhoto,
  type GodRaysOptions,
} from "@musterli/effects";
import { hexToOklch, oklchToHex } from "@musterli/engine";
import * as z from "zod";
import { EFFECT_PHOTO_RASTER_MAX_EDGE, colorSchema, effectPhotoAssetSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, optionLabels, roundTo } from "./shared";

const ID = "god-rays";

const schema = z.object({
  /** The user's photo; `null` shows the demo picture. Local only. */
  photo: effectPhotoAssetSchema.nullable(),
  /** Light position in percent of the width and height (may lie outside the picture). */
  lightX: z.number().min(-25).max(125),
  lightY: z.number().min(-25).max(125),
  /** Strength of the rays in percent. */
  intensity: z.number().min(0).max(200),
  /** How fast a ray fades on its way from the light, percent. */
  decay: z.number().min(0).max(100),
  /** Share of the way to the light every pixel samples, percent. */
  length: z.number().min(10).max(100),
  /** Samples per ray (capped: the cost is pixels × samples). */
  samples: z.int().min(8).max(GOD_RAYS_SAMPLES_MAX),
  /** Brightness from which a pixel shines, percent. */
  threshold: z.number().min(0).max(100),
  color: colorSchema,
  blend: z.enum(GOD_RAYS_BLENDS),
  /** Darkens the picture under the rays, percent. */
  darken: z.number().min(0).max(80),
});

export type GodRaysParams = z.output<typeof schema>;

/** The demo picture's sun (docs: `demoPhoto`), so the defaults shine from it. */
const defaults: GodRaysParams = {
  photo: null,
  lightX: 64.7,
  lightY: 38,
  intensity: 100,
  decay: 50,
  length: 90,
  samples: 64,
  threshold: 60,
  color: "#ffe2b0",
  blend: "add",
  darken: 15,
};

const preset = (id: string, params: Partial<GodRaysParams>): Preset<GodRaysParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Effect options from the params (all lengths are fractions, so no scale is needed). */
export function godRaysOptions(p: GodRaysParams): GodRaysOptions {
  return {
    x: p.lightX / 100,
    y: p.lightY / 100,
    intensity: p.intensity / 100,
    decay: p.decay / 100,
    length: p.length / 100,
    samples: p.samples,
    threshold: p.threshold / 100,
    color: p.color,
    blend: p.blend,
    darken: p.darken / 100,
    weights: LUMA_WEIGHTS.rec709,
  };
}

export const godRaysTool = defineTool({
  id: ID,
  version: 1,
  category: ["image-effects"],
  schema,
  defaults,
  defaultSize: { ...DEMO_PHOTO_SIZE },
  localParams: ["photo"],
  photoSource: { param: "photo", sample: demoPhoto },
  presets: [
    preset("golden-hour", {}),
    preset("morning-mist", {
      color: "#e8f1ff",
      intensity: 80,
      decay: 30,
      threshold: 45,
      blend: "screen",
      darken: 0,
    }),
    preset("spotlight", {
      lightX: 50,
      lightY: -10,
      color: "#ffffff",
      intensity: 140,
      decay: 20,
      length: 100,
      threshold: 35,
      darken: 55,
    }),
    preset("cathedral", {
      lightX: 30,
      lightY: 5,
      color: "#fff3d6",
      intensity: 120,
      decay: 10,
      length: 100,
      samples: 96,
      threshold: 50,
      darken: 35,
    }),
    preset("neon", {
      color: "#ff4fd8",
      intensity: 130,
      decay: 40,
      threshold: 55,
      blend: "screen",
      darken: 30,
    }),
    preset("subtle", { intensity: 50, decay: 70, length: 60, samples: 48, darken: 0 }),
    preset("eclipse", {
      color: "#ffb36b",
      intensity: 170,
      decay: 25,
      length: 100,
      threshold: 70,
      darken: 65,
    }),
  ],
  brandPalette(colors) {
    // The lightest brand colour reads best as light.
    const sorted = [...colors].sort((a, b) => hexToOklch(b).l - hexToOklch(a).l);
    return { color: sorted[0] ?? defaults.color };
  },
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const next: GodRaysParams = {
      ...current,
      lightX: roundTo(rng.float(15, 85), 1),
      lightY: roundTo(rng.float(5, 55), 1),
      color: oklchToHex({ l: rng.float(0.86, 0.95), c: rng.float(0.03, 0.12), h: hue }),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "image-effect",
    render(input, p) {
      return applyGodRays(input, godRaysOptions(p));
    },
  },
  exports: ["png", "jpg", "webp"],
  controls: {
    groups: [
      { id: "photo", labelKey: `tools.${ID}.groups.photo` },
      { id: "light", labelKey: `tools.${ID}.groups.light` },
      { id: "rays", labelKey: `tools.${ID}.groups.rays` },
      COMMON_GROUPS.colors,
    ],
    order: [
      "photo",
      "lightX",
      "lightY",
      "threshold",
      "intensity",
      "length",
      "decay",
      "samples",
      "color",
      "blend",
      "darken",
    ],
    params: {
      photo: {
        group: "photo",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.photo.description`,
        image: { maxEdge: EFFECT_PHOTO_RASTER_MAX_EDGE, photo: true, rasterOnly: true },
      },
      lightX: { group: "light", step: 0.5, unit: "%" },
      lightY: { group: "light", step: 0.5, unit: "%" },
      threshold: {
        group: "light",
        step: 1,
        unit: "%",
        descriptionKey: `tools.${ID}.params.threshold.description`,
      },
      intensity: { group: "rays", step: 1, unit: "%" },
      length: { group: "rays", step: 1, unit: "%" },
      decay: { group: "rays", step: 1, unit: "%" },
      samples: {
        group: "rays",
        step: 1,
        advanced: true,
        descriptionKey: `tools.${ID}.params.samples.description`,
      },
      color: { group: "colors" },
      blend: {
        group: "colors",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "blend", GOD_RAYS_BLENDS),
      },
      darken: { group: "colors", step: 1, unit: "%" },
    },
  },
});
