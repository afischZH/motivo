/**
 * M2-AP05: Tailwind Palette (docs/TOOLS.md F3). An 11-step scale (50 to 950)
 * with the base colour exactly at 500, exported for Tailwind v3
 * (`tailwind.config.js`) and v4 (`@theme`), as OKLCH and as HEX.
 */
import {
  colorList,
  cssVariables,
  swatchesSvg,
  tailwindConfig,
  tailwindScale,
  tailwindTheme,
  toCssName,
  type NamedColor,
} from "@motivo/engine";
import * as z from "zod";
import { colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
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
import { EXTRA_EXPORT_LABELS } from "./shared";

const ID = "tailwind-palette";

const schema = z.object({
  base: colorSchema,
  name: cssNameSchema,
  lightest: z.number().min(0.85).max(0.99),
  darkest: z.number().min(0.15).max(0.45),
  chromaFalloff: z.number().min(0).max(1),
  hueShift: z.number().min(-30).max(30),
  ...swatchDisplayShape,
});

export type TailwindPaletteParams = z.output<typeof schema>;

function steps(p: TailwindPaletteParams): NamedColor[] {
  return tailwindScale({
    base: p.base,
    lightest: p.lightest,
    darkest: p.darkest,
    chromaFalloff: p.chromaFalloff,
    hueShift: p.hueShift,
  }).map((s) => ({ name: String(s.step), color: s.color }));
}

const name = (p: TailwindPaletteParams): string => toCssName(p.name, "brand");

const defaults: TailwindPaletteParams = {
  base: "#3b82f6",
  name: "brand",
  lightest: 0.975,
  darkest: 0.27,
  chromaFalloff: 0.35,
  hueShift: 0,
  labels: "hex",
  contrast: true,
};

const preset = (
  id: string,
  params: Partial<TailwindPaletteParams>,
): Preset<TailwindPaletteParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const tailwindPaletteTool = defineTool({
  id: ID,
  version: 1,
  category: ["colors"],
  schema,
  defaults,
  defaultSize: COLOR_TOOL_SIZE,
  presets: [
    preset("ocean", {}),
    preset("coral", { base: "#f2545b", name: "coral", hueShift: 8 }),
    preset("emerald", { base: "#10a36f", name: "emerald", chromaFalloff: 0.5 }),
    preset("amber", { base: "#f59e0b", name: "amber", hueShift: -12, darkest: 0.3 }),
    preset("grape", { base: "#8b5cf6", name: "grape", labels: "oklch" }),
    preset("stone", { base: "#78716c", name: "stone", chromaFalloff: 0.6, lightest: 0.985 }),
    preset("rose", { base: "#e11d74", name: "rose", hueShift: 6, darkest: 0.25 }),
  ],
  controls: {
    groups: [{ id: "scale", labelKey: `tools.${ID}.groups.scale` }, DISPLAY_GROUP],
    order: [
      "base",
      "name",
      "lightest",
      "darkest",
      "chromaFalloff",
      "hueShift",
      "labels",
      "contrast",
    ],
    params: {
      base: { group: "scale", descriptionKey: `tools.${ID}.params.base.description` },
      name: {
        group: "scale",
        labelKey: NAME_LABEL,
        descriptionKey: NAME_DESCRIPTION,
        lockable: false,
      },
      lightest: { group: "scale", step: 0.005, advanced: true, lockable: false },
      darkest: { group: "scale", step: 0.005, advanced: true, lockable: false },
      chromaFalloff: { group: "scale", step: 0.01, advanced: true, lockable: false },
      hueShift: { group: "scale", step: 1, unit: "°", advanced: true, lockable: false },
      ...displayHints<TailwindPaletteParams>(),
    },
  },
  randomize(rng, current, locks) {
    // Only the colour changes: the curve and the name are the user's setup.
    return keepLocked({ ...current, base: randomBaseColor(rng) }, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width, height }) {
      return swatchesSvg({
        width,
        height,
        swatches: steps(p).map((s) => ({
          color: s.color,
          title: s.name,
          marked: s.name === "500",
        })),
        label: p.labels,
        contrast: p.contrast,
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "tailwind-config",
      labelKey: EXTRA_EXPORT_LABELS.tailwindConfig,
      language: "js",
      render: (p) => tailwindConfig(name(p), steps(p)),
    },
    {
      id: "tailwind-theme",
      labelKey: EXTRA_EXPORT_LABELS.tailwindTheme,
      language: "css",
      render: (p) => tailwindTheme(name(p), steps(p)),
    },
    {
      id: "css-variables-oklch",
      labelKey: EXTRA_EXPORT_LABELS.cssVariablesOklch,
      language: "css",
      render: (p) => cssVariables(name(p), steps(p), "oklch"),
    },
    {
      id: "css-variables",
      labelKey: EXTRA_EXPORT_LABELS.cssVariables,
      language: "css",
      render: (p) => cssVariables(name(p), steps(p), "hex"),
    },
    {
      id: "hex-list",
      labelKey: EXTRA_EXPORT_LABELS.hexList,
      language: "text",
      render: (p) => colorList(steps(p), "hex"),
    },
  ],
});
