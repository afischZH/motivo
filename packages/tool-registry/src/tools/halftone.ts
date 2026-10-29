/**
 * M5-AP02: Halftone (docs/TOOLS.md E2). A photo (or the built-in demo
 * picture) as dots, lines, squares or diamonds on a rotated grid; the mean
 * darkness of each cell sets the shape's size. Render kind `image-effect`
 * (worker, docs/ARCHITECTURE.md 4.14); the SVG export draws the same cells
 * as vector shapes (`render.vector`, 4.16).
 */
import {
  DEMO_PHOTO_SIZE,
  HALFTONE_SHAPES,
  LUMA_WEIGHTS,
  applyHalftone,
  demoPhoto,
  halftoneCellEstimate,
  halftoneSvg,
  type HalftoneOptions,
} from "@musterli/effects";
import { hexToOklch, oklchToHex } from "@musterli/engine";
import * as z from "zod";
import {
  EFFECT_PHOTO_RASTER_MAX_EDGE,
  TRANSPARENT,
  backgroundSchema,
  colorSchema,
  effectPhotoAssetSchema,
} from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset, RenderContext } from "../types";
import { COMMON_GROUPS, optionLabels } from "./shared";

const ID = "halftone";

/**
 * Most shapes an SVG export may hold: about 1 MB of path data (a dot is
 * about 16 bytes). The default 1500 × 1000 design at 12 px cells has about
 * 10 600; a 12 MP photo needs cells of at least 14 px.
 */
export const HALFTONE_SVG_MAX_SHAPES = 70_000;

/** Screen angles the space bar picks from (degrees). */
const ANGLES = [0, 15, 22.5, 30, 45, 60, 75] as const;

const schema = z.object({
  /** The user's photo; `null` shows the demo picture. Local only. */
  photo: effectPhotoAssetSchema.nullable(),
  shape: z.enum(HALFTONE_SHAPES),
  /** Cell edge in design pixels. */
  cellSize: z.number().min(4).max(64),
  /** Screen angle in degrees. */
  angle: z.number().min(0).max(180),
  ink: colorSchema,
  background: backgroundSchema,
  /** Shapes for the light parts (light ink on dark paper). */
  invert: z.boolean(),
  brightness: z.number().min(-100).max(100),
  contrast: z.number().min(-100).max(100),
  gamma: z.number().min(0.25).max(4),
});

export type HalftoneParams = z.output<typeof schema>;

const defaults: HalftoneParams = {
  photo: null,
  shape: "circle",
  cellSize: 12,
  angle: 45,
  ink: "#1a1a1a",
  background: "#f7f4ec",
  invert: false,
  brightness: 0,
  contrast: 15,
  gamma: 1,
};

const preset = (id: string, params: Partial<HalftoneParams>): Preset<HalftoneParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Effect options for an input `scale` times the design size. */
export function halftoneOptions(p: HalftoneParams, scale: number): HalftoneOptions {
  return {
    cell: p.cellSize * scale,
    angle: p.angle,
    shape: p.shape,
    ink: p.ink,
    paper: p.background,
    weights: LUMA_WEIGHTS.rec709,
    invert: p.invert,
    brightness: p.brightness,
    contrast: p.contrast,
    gamma: p.gamma,
  };
}

const scaleOf = (width: number, ctx: RenderContext): number => width / Math.max(1, ctx.width);

const byLightness = (colors: readonly string[]): string[] =>
  [...colors].sort((a, b) => hexToOklch(a).l - hexToOklch(b).l);

export const halftoneTool = defineTool({
  id: ID,
  version: 1,
  category: ["image-effects"],
  schema,
  defaults,
  defaultSize: { ...DEMO_PHOTO_SIZE },
  localParams: ["photo"],
  photoSource: { param: "photo", sample: demoPhoto },
  presets: [
    preset("classic", {}),
    preset("newsprint", {
      cellSize: 7,
      ink: "#22201c",
      background: "#ece6d6",
      contrast: 25,
    }),
    preset("pop-art", {
      cellSize: 20,
      angle: 15,
      ink: "#d7263d",
      background: "#ffe45c",
      contrast: 35,
    }),
    preset("engraving", {
      shape: "line",
      cellSize: 8,
      angle: 30,
      ink: "#1d2b4f",
      background: "#f4efe3",
      contrast: 20,
    }),
    preset("mosaic", {
      shape: "square",
      cellSize: 16,
      angle: 0,
      ink: "#0f4c5c",
      background: "#e9f2ef",
    }),
    preset("diamonds", {
      shape: "diamond",
      cellSize: 14,
      angle: 0,
      ink: "#3b1f5c",
      background: "#f6e9ff",
      contrast: 20,
    }),
    preset("night", {
      cellSize: 10,
      ink: "#f2f5ff",
      background: "#14182b",
      invert: true,
      contrast: 20,
    }),
  ],
  brandPalette(colors, current) {
    const sorted = byLightness(colors);
    const dark = sorted[0] ?? defaults.ink;
    const light = sorted[sorted.length - 1] ?? defaults.ink;
    const paper = current.background === TRANSPARENT ? TRANSPARENT : current.invert ? dark : light;
    return { ink: current.invert ? light : dark, background: paper };
  },
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const dark = oklchToHex({ l: rng.float(0.15, 0.32), c: rng.float(0.02, 0.15), h: hue });
    const light = oklchToHex({
      l: rng.float(0.9, 0.97),
      c: rng.float(0.01, 0.07),
      h: (hue + rng.pick([0, 30, 60, 180]) + 360) % 360,
    });
    const next: HalftoneParams = {
      ...current,
      angle: rng.pick(ANGLES),
      ink: current.invert ? light : dark,
      background: current.background === TRANSPARENT ? TRANSPARENT : current.invert ? dark : light,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "image-effect",
    render(input, p, ctx) {
      return applyHalftone(input, halftoneOptions(p, scaleOf(input.width, ctx)));
    },
    vector: {
      maxShapes: HALFTONE_SVG_MAX_SHAPES,
      shapes: (p, design) => halftoneCellEstimate(design.width, design.height, p.cellSize),
      render: (input, p, ctx) =>
        halftoneSvg(input, halftoneOptions(p, scaleOf(input.width, ctx)), ctx),
    },
  },
  exports: ["png", "jpg", "webp", "svg"],
  controls: {
    groups: [
      { id: "photo", labelKey: `tools.${ID}.groups.photo` },
      { id: "screen", labelKey: `tools.${ID}.groups.screen` },
      COMMON_GROUPS.colors,
      { id: "tone", labelKey: `tools.${ID}.groups.tone` },
    ],
    order: [
      "photo",
      "shape",
      "cellSize",
      "angle",
      "ink",
      "background",
      "invert",
      "brightness",
      "contrast",
      "gamma",
    ],
    params: {
      photo: {
        group: "photo",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.photo.description`,
        image: { maxEdge: EFFECT_PHOTO_RASTER_MAX_EDGE, photo: true, rasterOnly: true },
      },
      shape: {
        group: "screen",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "shape", HALFTONE_SHAPES),
      },
      cellSize: { group: "screen", step: 1, unit: "px" },
      angle: { group: "screen", step: 1, unit: "°" },
      ink: { group: "colors" },
      background: { group: "colors", labelKey: `tools.${ID}.params.background.label` },
      invert: { group: "colors" },
      brightness: { group: "tone", step: 1 },
      contrast: { group: "tone", step: 1 },
      gamma: { group: "tone", step: 0.05 },
    },
  },
});
