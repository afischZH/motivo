/**
 * M6-AP01: Fractal Glass (docs/TOOLS.md E6). A photo (or the demo picture)
 * seen through reeded glass: parallel strips, each showing a scaled or
 * mirrored slice of its surroundings through a lens profile, optionally
 * shifted per strip (from the seed), blurred and with a gloss line. Render
 * kind `image-effect` (worker, docs/ARCHITECTURE.md 4.14); lengths are in
 * design pixels times the preview scale, so preview and export match.
 */
import {
  DEMO_PHOTO_SIZE,
  FRACTAL_GLASS_PROFILES,
  applyFractalGlass,
  demoPhoto,
  type FractalGlassOptions,
} from "@musterli/effects";
import * as z from "zod";
import { EFFECT_PHOTO_RASTER_MAX_EDGE, colorSchema, effectPhotoAssetSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset, RenderContext } from "../types";
import { hexToOklch } from "@musterli/engine";
import { COMMON_GROUPS, optionLabels, roundTo } from "./shared";

const ID = "fractal-glass";

/** Strip angles the space bar picks from (degrees); vertical reeds are the classic. */
const ANGLES = [0, 0, 0, 15, 30, 45, 90, 135] as const;

const schema = z.object({
  /** The user's photo; `null` shows the demo picture. Local only. */
  photo: effectPhotoAssetSchema.nullable(),
  /** Strip width in design pixels. */
  stripWidth: z.number().min(6).max(400),
  /** Strip direction in degrees, 0 = vertical. */
  angle: z.number().min(0).max(180),
  profile: z.enum(FRACTAL_GLASS_PROFILES),
  /** How wide a slice every strip shows, percent. */
  distortion: z.number().min(0).max(100),
  mirror: z.boolean(),
  /** Random shift per strip (from the seed), percent of a strip width. */
  jitter: z.number().min(0).max(100),
  /** Frosted glass: blur radius in design pixels. */
  blur: z.number().min(0).max(40),
  /** Gloss line and shade per strip, percent. */
  highlight: z.number().min(0).max(100),
  /** Glass colour, multiplied in by `tintAmount` percent. */
  tint: colorSchema,
  tintAmount: z.number().min(0).max(100),
});

export type FractalGlassParams = z.output<typeof schema>;

const defaults: FractalGlassParams = {
  photo: null,
  stripWidth: 48,
  angle: 0,
  profile: "rounded",
  distortion: 45,
  mirror: false,
  jitter: 0,
  blur: 0,
  highlight: 35,
  tint: "#bfe3e0",
  tintAmount: 0,
};

const preset = (id: string, params: Partial<FractalGlassParams>): Preset<FractalGlassParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Effect options for an input `scale` times the design size. */
export function fractalGlassOptions(
  p: FractalGlassParams,
  scale: number,
  seed: number,
): FractalGlassOptions {
  return {
    stripWidth: p.stripWidth * scale,
    angle: p.angle,
    distortion: p.distortion / 100,
    profile: p.profile,
    mirror: p.mirror,
    jitter: p.jitter / 100,
    blur: p.blur * scale,
    highlight: p.highlight / 100,
    tint: p.tint,
    tintAmount: p.tintAmount / 100,
    seed,
  };
}

const scaleOf = (width: number, ctx: RenderContext): number => width / Math.max(1, ctx.width);

export const fractalGlassTool = defineTool({
  id: ID,
  version: 1,
  category: ["image-effects"],
  schema,
  defaults,
  defaultSize: { ...DEMO_PHOTO_SIZE },
  localParams: ["photo"],
  photoSource: { param: "photo", sample: demoPhoto },
  presets: [
    preset("reeded", {}),
    preset("frosted", {
      stripWidth: 64,
      distortion: 30,
      blur: 10,
      highlight: 25,
      tint: "#d8ecf2",
      tintAmount: 25,
    }),
    preset("mirrored", { profile: "flat", mirror: true, distortion: 20, highlight: 20 }),
    preset("diagonal", { angle: 30, stripWidth: 40, distortion: 60, profile: "flat" }),
    preset("horizontal", { angle: 90, stripWidth: 36, profile: "ridged", distortion: 55 }),
    preset("fragments", {
      stripWidth: 72,
      profile: "flat",
      distortion: 35,
      jitter: 70,
      highlight: 15,
    }),
    preset("fine", { stripWidth: 14, profile: "ridged", distortion: 80, highlight: 45 }),
  ],
  brandPalette(colors, current) {
    // The most colourful brand colour tints the glass; a clear glass gets a light tint.
    const sorted = [...colors].sort((a, b) => hexToOklch(b).c - hexToOklch(a).c);
    return {
      tint: sorted[0] ?? current.tint,
      tintAmount: current.tintAmount > 0 ? current.tintAmount : 30,
    };
  },
  randomize(rng, current, locks) {
    const next: FractalGlassParams = {
      ...current,
      stripWidth: roundTo(rng.float(16, 120), 0),
      angle: rng.pick(ANGLES),
      distortion: roundTo(rng.float(15, 85), 0),
      jitter: rng.bool(0.35) ? roundTo(rng.float(20, 80), 0) : 0,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "image-effect",
    render(input, p, ctx) {
      return applyFractalGlass(input, fractalGlassOptions(p, scaleOf(input.width, ctx), ctx.seed));
    },
  },
  exports: ["png", "jpg", "webp"],
  controls: {
    groups: [
      { id: "photo", labelKey: `tools.${ID}.groups.photo` },
      { id: "strips", labelKey: `tools.${ID}.groups.strips` },
      { id: "glass", labelKey: `tools.${ID}.groups.glass` },
      COMMON_GROUPS.colors,
    ],
    order: [
      "photo",
      "stripWidth",
      "angle",
      "profile",
      "distortion",
      "mirror",
      "jitter",
      "blur",
      "highlight",
      "tint",
      "tintAmount",
    ],
    params: {
      photo: {
        group: "photo",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.photo.description`,
        image: { maxEdge: EFFECT_PHOTO_RASTER_MAX_EDGE, photo: true, rasterOnly: true },
      },
      stripWidth: { group: "strips", step: 1, unit: "px" },
      angle: { group: "strips", step: 1, unit: "°" },
      profile: {
        group: "strips",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "profile", FRACTAL_GLASS_PROFILES),
      },
      distortion: { group: "glass", step: 1, unit: "%" },
      mirror: { group: "glass" },
      jitter: { group: "glass", step: 1, unit: "%" },
      blur: { group: "glass", step: 0.5, unit: "px" },
      highlight: { group: "glass", step: 1, unit: "%" },
      tint: { group: "colors" },
      tintAmount: { group: "colors", step: 1, unit: "%" },
    },
  },
});
