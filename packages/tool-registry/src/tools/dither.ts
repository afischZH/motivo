/**
 * M5-AP02: Dither (docs/TOOLS.md E4). A photo (or the demo picture)
 * reduced to a small palette with error diffusion (Floyd and Steinberg,
 * Atkinson, Stucki) or ordered Bayer thresholds, on a coarse pixel grid.
 * Error diffusion depends on the resolution, so the effect runs on a fixed
 * grid (design size / pixel size, `render.grid`) and the result is scaled
 * to the preview or export: every size shows the same dither pattern
 * (docs/ARCHITECTURE.md 4.16).
 */
import {
  DEMO_PHOTO_SIZE,
  DITHER_ALGORITHMS,
  DITHER_COLOR_MODES,
  LUMA_WEIGHTS,
  applyDither,
  demoPhoto,
  type DitherOptions,
} from "@musterli/effects";
import { hexToOklch, oklchToHex } from "@musterli/engine";
import * as z from "zod";
import {
  EFFECT_PHOTO_RASTER_MAX_EDGE,
  colorSchema,
  effectPhotoAssetSchema,
  paletteSchema,
} from "../common";
import { IMAGE_EFFECT_GRID_MAX_PIXELS } from "../photo-source";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { CanvasSize, Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "dither";

export const DITHER_PALETTES = ["mono", "gray", "handheld", "cga", "custom"] as const;
export type DitherPaletteId = (typeof DITHER_PALETTES)[number];

/**
 * Fixed palettes (own values): four greys, four greens in the spirit of
 * early handheld consoles, and the four-colour look of early PC graphics.
 */
export const DITHER_FIXED_PALETTES: Readonly<
  Record<Exclude<DitherPaletteId, "mono" | "custom">, readonly string[]>
> = {
  gray: ["#000000", "#555555", "#aaaaaa", "#ffffff"],
  handheld: ["#1b2d1a", "#3e6b35", "#8db26a", "#d3e6a7"],
  cga: ["#000000", "#55ffff", "#ff55ff", "#ffffff"],
};

const schema = z.object({
  /** The user's photo; `null` shows the demo picture. Local only. */
  photo: effectPhotoAssetSchema.nullable(),
  algorithm: z.enum(DITHER_ALGORITHMS),
  palette: z.enum(DITHER_PALETTES),
  /** 1-bit colours. */
  ink: colorSchema,
  paper: colorSchema,
  /** Colours of the custom palette (brand palette lands here). */
  colors: paletteSchema,
  /** Colour matching of the custom and CGA palettes (`tone` for 1-bit, greys and greens). */
  colorMode: z.enum(DITHER_COLOR_MODES),
  /** Edge of one dither pixel in design pixels. */
  pixelSize: z.int().min(1).max(16),
  serpentine: z.boolean(),
  brightness: z.number().min(-100).max(100),
  contrast: z.number().min(-100).max(100),
  gamma: z.number().min(0.25).max(4),
});

export type DitherParams = z.output<typeof schema>;

const defaults: DitherParams = {
  photo: null,
  algorithm: "floyd-steinberg",
  palette: "mono",
  ink: "#111111",
  paper: "#f4f1ea",
  colors: ["#1b1f3b", "#c2405d", "#f2a65a", "#f7ecd8"],
  colorMode: "color",
  pixelSize: 2,
  serpentine: true,
  brightness: 0,
  contrast: 15,
  gamma: 1,
};

const preset = (id: string, params: Partial<DitherParams>): Preset<DitherParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** The palette the effect uses. */
export function ditherPalette(p: DitherParams): readonly string[] {
  if (p.palette === "mono") return [p.ink, p.paper];
  if (p.palette === "custom") return p.colors;
  return DITHER_FIXED_PALETTES[p.palette];
}

/** Colour matching in effect: 1-bit, greys and greens always by brightness. */
export function ditherColorMode(p: DitherParams): DitherOptions["mode"] {
  return p.palette === "custom" || p.palette === "cga" ? p.colorMode : "tone";
}

/**
 * The fixed dither grid: design size / pixel size, scaled down (uniformly)
 * to at most `IMAGE_EFFECT_GRID_MAX_PIXELS`.
 */
export function ditherGrid(p: DitherParams, design: CanvasSize): CanvasSize {
  let w = design.width / p.pixelSize;
  let h = design.height / p.pixelSize;
  const k = Math.min(1, Math.sqrt(IMAGE_EFFECT_GRID_MAX_PIXELS / (w * h)));
  w *= k;
  h *= k;
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

const byLightness = (colors: readonly string[]): string[] =>
  [...colors].sort((a, b) => hexToOklch(a).l - hexToOklch(b).l);

export const ditherTool = defineTool({
  id: ID,
  version: 1,
  category: ["image-effects"],
  schema,
  defaults,
  defaultSize: { ...DEMO_PHOTO_SIZE },
  localParams: ["photo"],
  photoSource: { param: "photo", sample: demoPhoto },
  presets: [
    preset("one-bit", {}),
    preset("atkinson", {
      algorithm: "atkinson",
      ink: "#1f1d1a",
      paper: "#efe9dc",
      contrast: 25,
    }),
    preset("handheld", { palette: "handheld", pixelSize: 4, contrast: 20 }),
    preset("cga", { palette: "cga", algorithm: "bayer4", pixelSize: 3, colorMode: "color" }),
    preset("ordered", {
      algorithm: "bayer8",
      ink: "#0d1b2a",
      paper: "#e0e1dd",
      pixelSize: 3,
    }),
    preset("grayscale", { palette: "gray", algorithm: "stucki", pixelSize: 2, contrast: 10 }),
    preset("sunset", { palette: "custom", algorithm: "floyd-steinberg", pixelSize: 3 }),
    preset("blueprint", {
      algorithm: "atkinson",
      ink: "#e8f1ff",
      paper: "#0b3d91",
      pixelSize: 2,
      contrast: 20,
    }),
    preset("newspaper", {
      algorithm: "bayer4",
      ink: "#22201c",
      paper: "#ece6d6",
      pixelSize: 2,
      contrast: 20,
    }),
    preset("vaporwave", {
      palette: "custom",
      algorithm: "stucki",
      colors: ["#2b0f54", "#ab1f65", "#ff4f69", "#47e5bc", "#fff4e0"],
      pixelSize: 3,
    }),
    preset("big-pixels", {
      palette: "handheld",
      algorithm: "bayer2",
      pixelSize: 8,
      contrast: 25,
    }),
  ],
  brandPalette(colors) {
    const sorted = byLightness(colors);
    return {
      palette: "custom" as const,
      colors: sorted.slice(0, 10),
      ink: sorted[0] ?? defaults.ink,
      paper: sorted[sorted.length - 1] ?? defaults.paper,
    };
  },
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const ink = oklchToHex({ l: rng.float(0.12, 0.3), c: rng.float(0.02, 0.12), h: hue });
    const paper = oklchToHex({
      l: rng.float(0.88, 0.97),
      c: rng.float(0.01, 0.08),
      h: (hue + rng.pick([0, 40, 180]) + 360) % 360,
    });
    const shift = rng.pick([60, 90, 150, 180, -90]);
    const n = current.colors.length;
    const colors = Array.from({ length: n }, (_, i) => {
      const t = n > 1 ? i / (n - 1) : 0;
      return oklchToHex({
        l: roundTo(0.18 + t * 0.75, 3),
        c: roundTo(0.05 + Math.sin(t * Math.PI) * 0.14, 3),
        h: (hue + t * shift + 360) % 360,
      });
    });
    const fixed = current.palette !== "mono" && current.palette !== "custom";
    const next: DitherParams = {
      ...current,
      ink,
      paper,
      colors,
      // Fixed palettes have no colours to roll: a new algorithm shows a new variant instead.
      algorithm: fixed ? rng.pick(DITHER_ALGORITHMS) : current.algorithm,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "image-effect",
    grid: ditherGrid,
    render(input, p) {
      return applyDither(input, {
        algorithm: p.algorithm,
        palette: ditherPalette(p),
        mode: ditherColorMode(p),
        weights: LUMA_WEIGHTS.rec709,
        serpentine: p.serpentine,
        brightness: p.brightness,
        contrast: p.contrast,
        gamma: p.gamma,
      });
    },
  },
  exports: ["png", "jpg", "webp"],
  controls: {
    groups: [
      { id: "photo", labelKey: `tools.${ID}.groups.photo` },
      { id: "dither", labelKey: `tools.${ID}.groups.dither` },
      COMMON_GROUPS.colors,
      { id: "tone", labelKey: `tools.${ID}.groups.tone` },
    ],
    order: [
      "photo",
      "algorithm",
      "pixelSize",
      "serpentine",
      "palette",
      "ink",
      "paper",
      "colors",
      "colorMode",
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
      algorithm: {
        group: "dither",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "algorithm", DITHER_ALGORITHMS),
      },
      pixelSize: { group: "dither", step: 1, unit: "px" },
      serpentine: {
        group: "dither",
        advanced: true,
        visibleWhen: (p) => !p.algorithm.startsWith("bayer"),
      },
      palette: {
        group: "colors",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "palette", DITHER_PALETTES),
      },
      ink: { group: "colors", visibleWhen: (p) => p.palette === "mono" },
      paper: { group: "colors", visibleWhen: (p) => p.palette === "mono" },
      colors: {
        group: "colors",
        labelKey: COMMON_LABELS.palette,
        visibleWhen: (p) => p.palette === "custom",
      },
      colorMode: {
        group: "colors",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "colorMode", DITHER_COLOR_MODES),
        visibleWhen: (p) => p.palette === "custom" || p.palette === "cga",
      },
      brightness: { group: "tone", step: 1 },
      contrast: { group: "tone", step: 1 },
      gamma: { group: "tone", step: 0.05 },
    },
  },
});
