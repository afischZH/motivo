/**
 * M2-AP06: Palette from image (docs/TOOLS.md F4). The user picks an image in
 * the editor's generic image input; it is decoded and downsampled in the
 * browser and clustered with seeded k-means++ in OKLab (`extractPalette`).
 * The result lands in the `colors` param, so `render` and the code exports
 * stay pure functions of params (one render path). Space re-runs k-means
 * with a new seed; `count` re-runs it with another cluster count.
 *
 * Until the user picks an image, the built-in sample picture stands in; the
 * defaults and presets hold its palettes for seed 1 (checked by a test).
 */
import {
  EXTRACT_SORTS,
  colorList,
  cssVariables,
  extractPalette,
  formatShare,
  sampleImagePixels,
  sortExtracted,
  swatchesSvg,
  tailwindConfig,
  tailwindTheme,
  type NamedColor,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COLOR_TOOL_SIZE, DISPLAY_GROUP, displayHints, swatchDisplayShape } from "./color-shared";
import { EXTRA_EXPORT_LABELS, optionLabels, roundTo } from "./shared";

const ID = "palette-from-image";

export const IMAGE_PALETTE_MIN = 3;
export const IMAGE_PALETTE_MAX = 10;
/** Longest edge of the pixels that are clustered; larger images are downsampled first. */
export const IMAGE_PALETTE_MAX_EDGE = 256;

const extractedSchema = z.object({
  color: colorSchema,
  share: z.number().min(0).max(1),
});

const schema = z.object({
  count: z.int().min(IMAGE_PALETTE_MIN).max(IMAGE_PALETTE_MAX),
  sort: z.enum(EXTRACT_SORTS),
  /** Derived from the image, largest share first. Not in share links. */
  colors: z.array(extractedSchema).min(1).max(IMAGE_PALETTE_MAX),
  shares: z.boolean(),
  ...swatchDisplayShape,
});

export type PaletteFromImageParams = z.output<typeof schema>;
type Extracted = PaletteFromImageParams["colors"][number];

/** The colours as shown: at most `count`, in the chosen order. */
export function shownColors(p: PaletteFromImageParams): Extracted[] {
  return sortExtracted(p.colors.slice(0, p.count), p.sort);
}

const named = (p: PaletteFromImageParams): NamedColor[] =>
  shownColors(p).map((c, i) => ({ name: String(i + 1), color: c.color }));

/** `[hex, share]` pairs keep the preset table below readable. */
type Pairs = readonly (readonly [string, number])[];
const fromPairs = (pairs: Pairs): Extracted[] => pairs.map(([color, share]) => ({ color, share }));

/*
 * Palettes of the sample picture for seed 1, one per colour count, as
 * `deriveFromImage(tool, sampleImagePixels(), params, 1)` returns them.
 * A test recomputes them, so they cannot drift from the algorithm.
 */
const SAMPLE = {
  3: [
    ["#2b495a", 0.5219],
    ["#7b598f", 0.3049],
    ["#e79986", 0.1732],
  ],
  4: [
    ["#254f54", 0.386],
    ["#855e92", 0.2422],
    ["#453e73", 0.2045],
    ["#e99b86", 0.1673],
  ],
  5: [
    ["#203b53", 0.2556],
    ["#865e92", 0.2315],
    ["#484b7a", 0.2138],
    ["#e99b86", 0.1673],
    ["#33634a", 0.1318],
  ],
  6: [
    ["#243b5c", 0.2593],
    ["#564d82", 0.2135],
    ["#906393", 0.1911],
    ["#eb9d85", 0.1584],
    ["#36674d", 0.1029],
    ["#244c3c", 0.0748],
  ],
  8: [
    ["#233a5b", 0.2457],
    ["#7e5b92", 0.1903],
    ["#4c4c7d", 0.1765],
    ["#36674d", 0.1029],
    ["#e89282", 0.0881],
    ["#244c3c", 0.0748],
    ["#ba718f", 0.0723],
    ["#fcc088", 0.0494],
  ],
  10: [
    ["#6f548f", 0.1567],
    ["#203455", 0.1504],
    ["#244d6a", 0.1212],
    ["#4b4178", 0.1046],
    ["#916393", 0.1021],
    ["#264f3e", 0.0922],
    ["#38694f", 0.0855],
    ["#ea9582", 0.0768],
    ["#c7768b", 0.0615],
    ["#fcc088", 0.049],
  ],
} satisfies Readonly<Record<number, Pairs>>;

const display = { shares: true, labels: "hex", contrast: false } as const;

const defaults: PaletteFromImageParams = {
  count: 5,
  sort: "share",
  colors: fromPairs(SAMPLE[5]),
  ...display,
};

const preset = (
  id: string,
  count: keyof typeof SAMPLE,
  params: Partial<PaletteFromImageParams> = {},
): Preset<PaletteFromImageParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, count, colors: fromPairs(SAMPLE[count]), ...params },
  seed: 1,
});

export const paletteFromImageTool = defineTool({
  id: ID,
  version: 1,
  category: ["colors"],
  schema,
  defaults,
  defaultSize: COLOR_TOOL_SIZE,
  presets: [
    preset("dominant", 5),
    preset("trio", 3),
    preset("light-to-dark", 6, { sort: "lightness" }),
    preset("color-wheel", 8, { sort: "hue" }),
    preset("full-spectrum", 10, { sort: "hue", shares: false }),
    preset("quiet", 4, { sort: "lightness", shares: false, labels: "none" }),
    preset("contrast-check", 5, { sort: "lightness", contrast: true }),
  ],
  controls: {
    groups: [{ id: "palette", labelKey: `tools.${ID}.groups.palette` }, DISPLAY_GROUP],
    order: ["count", "sort", "colors", "shares", "labels", "contrast"],
    params: {
      count: {
        group: "palette",
        descriptionKey: `tools.${ID}.params.count.description`,
        lockable: false,
      },
      sort: {
        group: "palette",
        optionLabelKeys: optionLabels(ID, "sort", EXTRACT_SORTS),
        lockable: false,
      },
      colors: { kind: "hidden", lockable: false },
      shares: { group: "display", lockable: false },
      ...displayHints<PaletteFromImageParams>(),
    },
  },
  // Space only draws a new seed: the editor re-runs k-means on the image with it.
  randomize: (_rng, current, locks) => keepLocked({ ...current }, current, locks),
  render: {
    kind: "svg",
    render(p, { width, height }) {
      return swatchesSvg({
        width,
        height,
        swatches: shownColors(p).map((c) => ({
          color: c.color,
          ...(p.shares ? { title: formatShare(c.share) } : {}),
        })),
        label: p.labels,
        contrast: p.contrast,
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  paletteOutput: (p) => shownColors(p).map((c) => c.color),
  extraExports: [
    {
      id: "css-variables",
      labelKey: EXTRA_EXPORT_LABELS.cssVariables,
      language: "css",
      render: (p) => cssVariables("palette", named(p)),
    },
    {
      id: "hex-list",
      labelKey: EXTRA_EXPORT_LABELS.hexList,
      language: "text",
      render: (p) => colorList(named(p), "hex"),
    },
    {
      id: "tailwind-config",
      labelKey: EXTRA_EXPORT_LABELS.tailwindConfig,
      language: "js",
      render: (p) => tailwindConfig("palette", named(p)),
    },
    {
      id: "tailwind-theme",
      labelKey: EXTRA_EXPORT_LABELS.tailwindTheme,
      language: "css",
      render: (p) => tailwindTheme("palette", named(p)),
    },
  ],
  imageInput: {
    derivedKeys: ["colors"],
    deriveOn: ["count"],
    maxEdge: IMAGE_PALETTE_MAX_EDGE,
    sample: sampleImagePixels,
    derive(pixels, p, rng) {
      const colors = extractPalette(pixels, { count: p.count, rng });
      // No opaque pixel: no patch, the editor reports that nothing was found.
      if (colors.length === 0) return {};
      return { colors: colors.map((c) => ({ color: c.color, share: roundTo(c.share, 4) })) };
    },
  },
});
