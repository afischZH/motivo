/**
 * M4c-AP04: ASCII and dot-matrix art (docs/TOOLS.md L5). The photo (or the
 * built-in demo picture) is condensed into a grid of cells in the image
 * worker (`imageInput.derive`, fed by `photoSource`); `render` draws the grid
 * as characters, braille or dots in SVG, so preview, SVG, PNG, text and
 * HTML exports share one render path. An empty `grid` means the demo
 * picture, computed here and cached, so share links and presets show it.
 */
import {
  ASCII_CUSTOM_RAMP_MAX,
  ASCII_GRID_MAX_LENGTH,
  ASCII_GRID_PATTERN,
  ASCII_MODES,
  ASCII_RAMPS,
  DEMO_PHOTO_SIZE,
  asciiArtHtml,
  asciiArtSvg,
  asciiArtText,
  asciiGridSize,
  buildAsciiGrid,
  decodeAsciiGrid,
  demoPhoto,
  encodeAsciiGrid,
  type AsciiGrid,
  type AsciiRampId,
  type AsciiStyle,
} from "@musterli/effects";
import { hexToOklch, oklchToHex } from "@musterli/engine";
import * as z from "zod";
import { backgroundSchema, colorSchema, effectPhotoAssetSchemaWith } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset, RenderContext } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "ascii-art";

export const ASCII_RAMP_CHOICES = [
  ...(Object.keys(ASCII_RAMPS) as AsciiRampId[]),
  "custom",
] as const satisfies readonly (AsciiRampId | "custom")[];
export const ASCII_COLOR_MODES = ["single", "photo"] as const;
export const ASCII_DOT_MODES = ["size", "lit"] as const;
export const ASCII_DOT_SHAPES = ["round", "square"] as const;

/** Longest edge of the photo the grid is computed from (more is never needed). */
export const ASCII_PHOTO_MAX_EDGE = 1024;
/**
 * Longest data URI of the photo: the image input decodes files up to 5 MB
 * (base64 adds a third); a 1024 px JPEG is far smaller.
 */
export const ASCII_PHOTO_MAX_RASTER_LENGTH = 7_000_000;

/**
 * The photo of ASCII art (docs/TOOLS.md L5): raster only, at most
 * `ASCII_PHOTO_MAX_EDGE`, so an imported design cannot bring a photo the
 * image input would refuse to analyse.
 */
export const asciiPhotoAssetSchema = effectPhotoAssetSchemaWith({
  maxEdge: ASCII_PHOTO_MAX_EDGE,
  maxRasterLength: ASCII_PHOTO_MAX_RASTER_LENGTH,
});

const schema = z.object({
  /** The user's photo; `null` shows the demo picture. Local only. */
  photo: asciiPhotoAssetSchema.nullable(),
  /** Cells derived from the photo (`encodeAsciiGrid`); empty = demo picture. */
  grid: z.string().max(ASCII_GRID_MAX_LENGTH).regex(ASCII_GRID_PATTERN),
  mode: z.enum(ASCII_MODES),
  ramp: z.enum(ASCII_RAMP_CHOICES),
  customRamp: z
    .string()
    .min(1)
    .max(ASCII_CUSTOM_RAMP_MAX * 2),
  columns: z.int().min(16).max(240),
  /** Width / height of a character cell. */
  aspect: z.number().min(0.35).max(1),
  invert: z.boolean(),
  brightness: z.number().min(-100).max(100),
  contrast: z.number().min(-100).max(100),
  gamma: z.number().min(0.25).max(4),
  colorMode: z.enum(ASCII_COLOR_MODES),
  ink: colorSchema,
  background: backgroundSchema,
  dotMode: z.enum(ASCII_DOT_MODES),
  dotShape: z.enum(ASCII_DOT_SHAPES),
  /** Largest dot as a share of the cell, percent. */
  dotSize: z.number().min(30).max(100),
});

export type AsciiArtParams = z.output<typeof schema>;

const defaults: AsciiArtParams = {
  photo: null,
  grid: "",
  mode: "ascii",
  ramp: "standard",
  customRamp: " .oO0@",
  columns: 120,
  aspect: 0.55,
  invert: false,
  brightness: 0,
  contrast: 10,
  gamma: 1,
  colorMode: "single",
  ink: "#1c1917",
  background: "#f5f1e8",
  dotMode: "size",
  dotShape: "round",
  dotSize: 90,
};

const preset = (id: string, params: Partial<AsciiArtParams>): Preset<AsciiArtParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export function asciiStyle(p: AsciiArtParams): AsciiStyle {
  return {
    mode: p.mode,
    ramp: p.ramp === "custom" ? p.customRamp : ASCII_RAMPS[p.ramp],
    invert: p.invert,
    brightness: p.brightness,
    contrast: p.contrast,
    gamma: p.gamma,
    colorMode: p.colorMode,
    ink: p.ink,
    background: p.background,
    dotMode: p.dotMode,
    dotShape: p.dotShape,
    dotSize: p.dotSize / 100,
  };
}

/** Recent grids of the demo picture, by size and settings (renders reuse them while sliders move). */
const sampleGrids = new Map<string, AsciiGrid>();
const SAMPLE_CACHE = 8;

/** The demo picture's grid for a canvas of `width` × `height`. */
export function sampleAsciiGrid(
  width: number,
  height: number,
  p: Pick<AsciiArtParams, "columns" | "aspect" | "mode">,
): AsciiGrid {
  const size = asciiGridSize(width, height, p.columns, p.aspect, p.mode);
  const key = `${size.cols}x${size.rows}:${(width / height).toFixed(4)}`;
  const hit = sampleGrids.get(key);
  if (hit) return hit;
  // Two samples per cell and axis: enough for a stable mean, cheap on the main thread.
  const grid = buildAsciiGrid(demoPhoto(size.cols * 2, size.rows * 2), size.cols, size.rows);
  if (sampleGrids.size >= SAMPLE_CACHE) {
    const oldest = sampleGrids.keys().next().value;
    if (oldest !== undefined) sampleGrids.delete(oldest);
  }
  sampleGrids.set(key, grid);
  return grid;
}

function gridOf(p: AsciiArtParams, ctx: RenderContext): AsciiGrid {
  return decodeAsciiGrid(p.grid) ?? sampleAsciiGrid(ctx.width, ctx.height, p);
}

/** Ink and ground pairs for "new variant", light ground first then dark. */
function colourScheme(rng: {
  float(a: number, b: number): number;
  bool(p?: number): boolean;
}): Pick<AsciiArtParams, "ink" | "background" | "invert"> {
  const hue = rng.float(0, 360);
  const dark = rng.bool(0.5);
  const ground = oklchToHex({
    l: dark ? rng.float(0.1, 0.2) : rng.float(0.93, 0.98),
    c: rng.float(0, 0.03),
    h: hue,
  });
  const ink = oklchToHex({
    l: dark ? rng.float(0.78, 0.92) : rng.float(0.15, 0.3),
    c: rng.float(0.02, 0.18),
    h: (hue + rng.float(-40, 40) + 360) % 360,
  });
  return { ink, background: ground, invert: dark };
}

export const asciiArtTool = defineTool({
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
  imageInput: {
    derivedKeys: ["grid"],
    deriveOn: ["columns", "aspect", "mode"],
    maxEdge: ASCII_PHOTO_MAX_EDGE,
    sample: () => demoPhoto(DEMO_PHOTO_SIZE.width / 4, DEMO_PHOTO_SIZE.height / 4),
    derive(pixels, p) {
      const size = asciiGridSize(pixels.width, pixels.height, p.columns, p.aspect, p.mode);
      return { grid: encodeAsciiGrid(buildAsciiGrid(pixels, size.cols, size.rows)) };
    },
  },
  presets: [
    preset("classic", {}),
    preset("terminal", {
      ink: "#4ade80",
      background: "#0a0f0a",
      invert: true,
      ramp: "detailed",
      columns: 140,
    }),
    preset("colour", {
      colorMode: "photo",
      background: "#000000",
      invert: true,
      ramp: "detailed",
      contrast: 20,
    }),
    preset("led", {
      mode: "dots",
      dotMode: "lit",
      ink: "#ffb020",
      background: "#120c06",
      invert: true,
      columns: 80,
      aspect: 1,
      dotSize: 80,
    }),
    preset("halftone", {
      mode: "dots",
      dotMode: "size",
      ink: "#14213d",
      background: "#fdf6e3",
      columns: 100,
      aspect: 1,
      dotSize: 100,
    }),
    preset("braille", {
      mode: "braille",
      ink: "#e2e8f0",
      background: "#0f172a",
      invert: true,
      columns: 110,
    }),
    preset("blocks", {
      ramp: "blocks",
      ink: "#3b0764",
      background: "#faf5ff",
      columns: 90,
      aspect: 0.5,
    }),
  ],
  randomize(rng, current, locks) {
    const ramps = ASCII_RAMP_CHOICES.filter((r) => r !== "custom");
    const next: AsciiArtParams = {
      ...current,
      ...colourScheme(rng),
      ramp: current.ramp === "custom" ? "custom" : rng.pick(ramps),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, ctx) {
      return asciiArtSvg(gridOf(p, ctx), asciiStyle(p), ctx.width, ctx.height);
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "text",
      labelKey: EXTRA_EXPORT_LABELS.plainText,
      language: "text",
      render: (p, ctx) => asciiArtText(gridOf(p, ctx), asciiStyle(p)),
    },
    {
      id: "html",
      labelKey: EXTRA_EXPORT_LABELS.htmlPre,
      language: "html",
      render: (p, ctx) => asciiArtHtml(gridOf(p, ctx), asciiStyle(p), ctx.width, ctx.height),
    },
  ],
  controls: {
    groups: [
      { id: "photo", labelKey: `tools.${ID}.groups.photo` },
      { id: "characters", labelKey: `tools.${ID}.groups.characters` },
      COMMON_GROUPS.colors,
      { id: "tone", labelKey: `tools.${ID}.groups.tone` },
    ],
    order: [
      "photo",
      "mode",
      "ramp",
      "customRamp",
      "columns",
      "aspect",
      "dotMode",
      "dotShape",
      "dotSize",
      "colorMode",
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
        image: { maxEdge: ASCII_PHOTO_MAX_EDGE, photo: true, rasterOnly: true },
      },
      grid: { kind: "hidden" },
      mode: {
        group: "characters",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "mode", ASCII_MODES),
      },
      ramp: {
        group: "characters",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "ramp", ASCII_RAMP_CHOICES),
        visibleWhen: (p) => p.mode === "ascii",
      },
      customRamp: {
        group: "characters",
        kind: "text",
        descriptionKey: `tools.${ID}.params.customRamp.description`,
        visibleWhen: (p) => p.mode === "ascii" && p.ramp === "custom",
      },
      columns: { group: "characters", step: 1 },
      aspect: { group: "characters", step: 0.01, advanced: true },
      dotMode: {
        group: "characters",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "dotMode", ASCII_DOT_MODES),
        visibleWhen: (p) => p.mode === "dots",
      },
      dotShape: {
        group: "characters",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "dotShape", ASCII_DOT_SHAPES),
        visibleWhen: (p) => p.mode === "dots",
      },
      dotSize: {
        group: "characters",
        step: 1,
        unit: "%",
        visibleWhen: (p) => p.mode === "dots",
      },
      colorMode: {
        group: "colors",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "colorMode", ASCII_COLOR_MODES),
      },
      ink: { group: "colors", visibleWhen: (p) => p.colorMode === "single" },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
      invert: { group: "tone" },
      brightness: { group: "tone", step: 1 },
      contrast: { group: "tone", step: 1 },
      gamma: { group: "tone", step: 0.05 },
    },
  },
});

/** Lightness of the ink against the ground, for tests of the colour schemes. */
export function inkContrast(p: Pick<AsciiArtParams, "ink" | "background">): number {
  const ground = p.background === "transparent" ? "#ffffff" : p.background;
  return Math.abs(hexToOklch(p.ink).l - hexToOklch(ground).l);
}
