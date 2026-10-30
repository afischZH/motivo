/**
 * M6-AP01: Pixelate and posterize (docs/TOOLS.md E7). A photo (or the demo
 * picture) as large blocks (block mean) with few colours: evenly spaced
 * levels per channel or the nearest colour of a palette (brand palette).
 * Like dither, the effect runs on a fixed grid (design size / block size,
 * `render.grid`): the worker draws the photo at the grid size, so every
 * block is the mean of its area, and the result is enlarged with nearest
 * neighbour. The SVG export draws the same blocks as rectangles.
 */
import {
  DEMO_PHOTO_SIZE,
  POSTERIZE_LEVELS_MAX,
  POSTERIZE_LEVELS_MIN,
  POSTERIZE_MODES,
  applyPosterize,
  demoPhoto,
  pixelateShapeEstimate,
  pixelateSvg,
  resizeCover,
  type PixelBuffer,
  type PosterizeOptions,
} from "@musterli/effects";
import { hexToOklch, oklchToHex } from "@musterli/engine";
import * as z from "zod";
import { EFFECT_PHOTO_RASTER_MAX_EDGE, effectPhotoAssetSchema, paletteSchema } from "../common";
import { IMAGE_EFFECT_GRID_MAX_PIXELS } from "../photo-source";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { CanvasSize, Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "pixelate";

/**
 * Most rectangles an SVG export may hold (one per block, runs of equal
 * blocks merged): about 1 MB. The default design (1500 × 1000, 16 px
 * blocks) has about 5 900; a 12 MP photo needs blocks of at least 18 px.
 */
export const PIXELATE_SVG_MAX_SHAPES = 40_000;

/** Block sizes the space bar picks from when the colours stay (original mode). */
const BLOCKS = [8, 12, 16, 20, 24, 32, 40] as const;

const schema = z.object({
  /** The user's photo; `null` shows the demo picture. Local only. */
  photo: effectPhotoAssetSchema.nullable(),
  /** Edge of one block in design pixels; 1 only posterizes. */
  blockSize: z.int().min(1).max(128),
  colorMode: z.enum(POSTERIZE_MODES),
  /** Levels per channel (`levels` mode). */
  levels: z.int().min(POSTERIZE_LEVELS_MIN).max(POSTERIZE_LEVELS_MAX),
  /** Colours of the `palette` mode (brand palette lands here). */
  colors: paletteSchema,
  brightness: z.number().min(-100).max(100),
  contrast: z.number().min(-100).max(100),
  gamma: z.number().min(0.25).max(4),
});

export type PixelateParams = z.output<typeof schema>;

const defaults: PixelateParams = {
  photo: null,
  blockSize: 16,
  colorMode: "levels",
  levels: 6,
  colors: ["#1d1b3a", "#5b3f8c", "#c35b8f", "#f29e6d", "#fbe3b9"],
  brightness: 0,
  contrast: 10,
  gamma: 1,
};

const preset = (id: string, params: Partial<PixelateParams>): Preset<PixelateParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/**
 * The fixed block grid: design size / block size, scaled down (uniformly)
 * to at most `IMAGE_EFFECT_GRID_MAX_PIXELS`.
 */
export function pixelateGrid(p: PixelateParams, design: CanvasSize): CanvasSize {
  let w = design.width / p.blockSize;
  let h = design.height / p.blockSize;
  const k = Math.min(1, Math.sqrt(IMAGE_EFFECT_GRID_MAX_PIXELS / (w * h)));
  w *= k;
  h *= k;
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

/** Quantization options from the params. */
export function posterizeOptions(p: PixelateParams): PosterizeOptions {
  return {
    mode: p.colorMode,
    levels: p.levels,
    palette: p.colors,
    brightness: p.brightness,
    contrast: p.contrast,
    gamma: p.gamma,
  };
}

/** The blocks for an SVG export: `input` (design size) averaged down to the grid, quantized. */
function vectorBlocks(input: PixelBuffer, p: PixelateParams, design: CanvasSize): PixelBuffer {
  const grid = pixelateGrid(p, design);
  const blocks =
    input.width === grid.width && input.height === grid.height
      ? input
      : resizeCover(input, grid.width, grid.height);
  return applyPosterize(blocks, posterizeOptions(p));
}

const byLightness = (colors: readonly string[]): string[] =>
  [...colors].sort((a, b) => hexToOklch(a).l - hexToOklch(b).l);

export const pixelateTool = defineTool({
  id: ID,
  version: 1,
  category: ["image-effects"],
  schema,
  defaults,
  defaultSize: { ...DEMO_PHOTO_SIZE },
  localParams: ["photo"],
  photoSource: { param: "photo", sample: demoPhoto },
  presets: [
    preset("mosaic", {}),
    preset("retro", { blockSize: 10, levels: 3, contrast: 20 }),
    preset("chunky", { blockSize: 40, colorMode: "original", contrast: 0 }),
    preset("poster", { blockSize: 1, levels: 4, contrast: 15 }),
    preset("sunset", { blockSize: 12, colorMode: "palette" }),
    preset("muted", {
      blockSize: 20,
      colorMode: "palette",
      colors: ["#22223b", "#4a4e69", "#9a8c98", "#c9ada7", "#f2e9e4"],
    }),
    preset("fine", { blockSize: 6, levels: 8 }),
    preset("eight-bit", {
      blockSize: 14,
      colorMode: "palette",
      colors: [
        "#1a1c2c",
        "#5d275d",
        "#b13e53",
        "#ef7d57",
        "#ffcd75",
        "#a7f070",
        "#38b764",
        "#41a6f6",
      ],
    }),
    preset("ocean", {
      blockSize: 18,
      colorMode: "palette",
      colors: ["#03045e", "#0077b6", "#00b4d8", "#90e0ef", "#caf0f8"],
    }),
    preset("mono", {
      blockSize: 12,
      colorMode: "palette",
      colors: ["#111111", "#555555", "#aaaaaa", "#f5f5f5"],
      contrast: 20,
    }),
    preset("huge", { blockSize: 64, colorMode: "original", contrast: 5 }),
  ],
  brandPalette(colors) {
    return { colorMode: "palette" as const, colors: byLightness(colors).slice(0, 10) };
  },
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const shift = rng.pick([60, 90, 150, 180, -90]);
    const n = current.colors.length;
    const colors = Array.from({ length: n }, (_, i) => {
      const t = n > 1 ? i / (n - 1) : 0;
      return oklchToHex({
        l: roundTo(0.2 + t * 0.74, 3),
        c: roundTo(0.04 + Math.sin(t * Math.PI) * 0.14, 3),
        h: (hue + t * shift + 360) % 360,
      });
    });
    const next: PixelateParams = {
      ...current,
      colors,
      levels: current.colorMode === "levels" ? rng.int(3, 8) : current.levels,
      // Original colours have nothing to roll: a new block size shows a new variant instead.
      blockSize: current.colorMode === "original" ? rng.pick(BLOCKS) : current.blockSize,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "image-effect",
    grid: pixelateGrid,
    render(input, p) {
      return applyPosterize(input, posterizeOptions(p));
    },
    vector: {
      maxShapes: PIXELATE_SVG_MAX_SHAPES,
      shapes: (p, design) => pixelateShapeEstimate(pixelateGrid(p, design)),
      render: (input, p, ctx) => pixelateSvg(vectorBlocks(input, p, ctx), ctx),
    },
  },
  exports: ["png", "jpg", "webp", "svg"],
  controls: {
    groups: [
      { id: "photo", labelKey: `tools.${ID}.groups.photo` },
      { id: "blocks", labelKey: `tools.${ID}.groups.blocks` },
      COMMON_GROUPS.colors,
      { id: "tone", labelKey: `tools.${ID}.groups.tone` },
    ],
    order: [
      "photo",
      "blockSize",
      "colorMode",
      "levels",
      "colors",
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
      blockSize: { group: "blocks", step: 1, unit: "px" },
      colorMode: {
        group: "colors",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "colorMode", POSTERIZE_MODES),
      },
      levels: {
        group: "colors",
        step: 1,
        visibleWhen: (p) => p.colorMode === "levels",
        descriptionKey: `tools.${ID}.params.levels.description`,
      },
      colors: {
        group: "colors",
        labelKey: COMMON_LABELS.palette,
        visibleWhen: (p) => p.colorMode === "palette",
      },
      brightness: { group: "tone", step: 1 },
      contrast: { group: "tone", step: 1 },
      gamma: { group: "tone", step: 0.05 },
    },
  },
});
