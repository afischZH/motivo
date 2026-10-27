/**
 * M2-AP05: Tints & Shades (docs/TOOLS.md F2). Lighter and darker steps of a
 * base colour, as an OKLCH lightness ramp or a mix with white and black.
 */
import {
  SCALE_METHODS,
  colorList,
  cssVariables,
  swatchesSvg,
  tintsAndShades,
  toCssName,
  type ColorFormat,
  type NamedColor,
  type ScaleColor,
} from "@motivo/engine";
import * as z from "zod";
import { colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { ExtraExport, Preset } from "../types";
import {
  COLOR_TOOL_SIZE,
  DISPLAY_GROUP,
  NAME_DESCRIPTION,
  NAME_LABEL,
  cssNameSchema,
  displayHints,
  randomBaseColor,
  swatchDisplayShape,
} from "./color-shared";
import { EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "tints-shades";

const schema = z.object({
  base: colorSchema,
  name: cssNameSchema,
  tints: z.int().min(0).max(10),
  shades: z.int().min(0).max(10),
  range: z.number().min(0.1).max(1),
  method: z.enum(SCALE_METHODS),
  ...swatchDisplayShape,
});

export type TintsShadesParams = z.output<typeof schema>;

const scale = (p: TintsShadesParams): ScaleColor[] =>
  tintsAndShades({
    base: p.base,
    tints: p.tints,
    shades: p.shades,
    range: p.range,
    method: p.method,
  });

/** `tint-2`, "" for the base, `shade-1`: variable suffixes. */
function named(p: TintsShadesParams): NamedColor[] {
  return scale(p).map((s) => ({
    name: s.role === "base" ? "" : `${s.role}-${s.index}`,
    color: s.color,
  }));
}

const defaults: TintsShadesParams = {
  base: "#2a9d8f",
  name: "primary",
  tints: 4,
  shades: 4,
  range: 0.9,
  method: "oklch",
  labels: "hex",
  contrast: true,
};

const preset = (id: string, params: Partial<TintsShadesParams>): Preset<TintsShadesParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

const list = (
  id: string,
  labelKey: string,
  format: ColorFormat,
): ExtraExport<TintsShadesParams> => ({
  id,
  labelKey,
  language: "text",
  render: (p) => colorList(named(p), format),
});

export const tintsShadesTool = defineTool({
  id: ID,
  version: 1,
  category: ["colors"],
  schema,
  defaults,
  defaultSize: COLOR_TOOL_SIZE,
  presets: [
    preset("lagoon", {}),
    preset("tomato", { base: "#e63946", name: "danger", method: "oklab" }),
    preset("indigo", { base: "#4f46e5", name: "accent", tints: 5, shades: 5, range: 0.95 }),
    preset("sand", { base: "#d4a373", name: "sand", tints: 6, shades: 2, method: "srgb" }),
    preset("forest", { base: "#2d6a4f", name: "forest", tints: 3, shades: 3, range: 0.7 }),
    preset("slate", { base: "#64748b", name: "neutral", tints: 5, shades: 5, labels: "hsl" }),
    preset("sunflower", {
      base: "#ffb703",
      name: "warning",
      tints: 2,
      shades: 6,
      method: "oklab",
      labels: "rgb",
    }),
  ],
  controls: {
    groups: [{ id: "scale", labelKey: `tools.${ID}.groups.scale` }, DISPLAY_GROUP],
    order: ["base", "tints", "shades", "range", "method", "name", "labels", "contrast"],
    params: {
      base: { group: "scale" },
      tints: { group: "scale", lockable: false },
      shades: { group: "scale", lockable: false },
      range: { group: "scale", step: 0.01, lockable: false },
      method: {
        group: "scale",
        // A select: the option labels are too long for a segmented control on phones.
        kind: "select",
        optionLabelKeys: optionLabels(ID, "method", SCALE_METHODS),
        descriptionKey: `tools.${ID}.params.method.description`,
        lockable: false,
      },
      name: {
        group: "scale",
        labelKey: NAME_LABEL,
        descriptionKey: NAME_DESCRIPTION,
        lockable: false,
      },
      ...displayHints<TintsShadesParams>(),
    },
  },
  randomize(rng, current, locks) {
    // Only the colour changes: steps, method and display are the user's setup.
    return keepLocked({ ...current, base: randomBaseColor(rng) }, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width, height }) {
      return swatchesSvg({
        width,
        height,
        swatches: scale(p).map((s) => ({ color: s.color, marked: s.role === "base" })),
        label: p.labels,
        contrast: p.contrast,
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "css-variables",
      labelKey: EXTRA_EXPORT_LABELS.cssVariables,
      language: "css",
      render: (p) => cssVariables(toCssName(p.name, "color"), named(p)),
    },
    list("hex-list", EXTRA_EXPORT_LABELS.hexList, "hex"),
    list("rgb-list", EXTRA_EXPORT_LABELS.rgbList, "rgb"),
    list("hsl-list", EXTRA_EXPORT_LABELS.hslList, "hsl"),
  ],
  gating: {},
});
