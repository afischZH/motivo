/**
 * W3: Fluid type scale (docs/TOOLS.md M1). A modular type scale between two
 * viewport widths, exported as CSS variables with `clamp()`, utility
 * classes and a Tailwind v4 `@theme`. The preview is a type specimen at a
 * chosen viewport width; the specimen is also the image export.
 */
import {
  AVATAR_FONTS,
  FLUID_NAMINGS,
  FLUID_ZOOM_SAFE_FACTOR,
  TYPE_SCALE_RATIOS,
  TYPE_SCALE_RATIO_IDS,
  fluidClamp,
  fluidSpecimenSvg,
  fluidStepName,
  fluidTypeSteps,
  fluidZoomFactor,
  formatNumber,
  mixHex,
  toCssName,
  type FluidStep,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "fluid-type-scale";

export const FLUID_UNITS = ["rem", "px"] as const;
export const FLUID_SAMPLE_MAX = 80;

const viewport = z.int().min(240).max(3840);
const baseSize = z.number().min(8).max(40);
const ratio = z.enum(TYPE_SCALE_RATIO_IDS);

const schema = z.object({
  minViewport: viewport,
  maxViewport: viewport,
  minBase: baseSize,
  maxBase: baseSize,
  minRatio: ratio,
  maxRatio: ratio,
  stepsDown: z.int().min(0).max(3),
  stepsUp: z.int().min(1).max(8),
  unit: z.enum(FLUID_UNITS),
  naming: z.enum(FLUID_NAMINGS),
  /** Variable prefix, sanitised with `toCssName` at export time. */
  prefix: z.string().max(24),
  /** Viewport width of the specimen. */
  previewViewport: viewport,
  sample: z.string().max(FLUID_SAMPLE_MAX),
  font: z.enum(AVATAR_FONTS),
  fontWeight: z.int().min(100).max(900),
  background: colorSchema,
  ink: colorSchema,
  accent: colorSchema,
});

export type FluidTypeScaleParams = z.output<typeof schema>;

const defaults: FluidTypeScaleParams = {
  minViewport: 360,
  maxViewport: 1280,
  minBase: 16,
  maxBase: 18,
  minRatio: "minor-third",
  maxRatio: "major-third",
  stepsDown: 2,
  stepsUp: 5,
  unit: "rem",
  naming: "steps",
  prefix: "step",
  previewViewport: 1280,
  sample: "The quick brown fox jumps over the lazy dog",
  font: "sans",
  fontWeight: 600,
  background: "#ffffff",
  ink: "#111827",
  accent: "#4f46e5",
};

const preset = (
  id: string,
  params: Partial<FluidTypeScaleParams>,
): Preset<FluidTypeScaleParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export function fluidStepsOf(p: FluidTypeScaleParams): FluidStep[] {
  return fluidTypeSteps({
    minViewport: p.minViewport,
    maxViewport: p.maxViewport,
    minBase: p.minBase,
    maxBase: p.maxBase,
    minRatio: TYPE_SCALE_RATIOS[p.minRatio],
    maxRatio: TYPE_SCALE_RATIOS[p.maxRatio],
    stepsDown: p.stepsDown,
    stepsUp: p.stepsUp,
  });
}

/** The prefix of the variables, e.g. "step" for `--step-1`; "text" for t-shirt names in Tailwind. */
const prefixOf = (p: FluidTypeScaleParams): string =>
  toCssName(p.prefix, p.naming === "tshirt" ? "text" : "step");

/** Variable name of a step without the dashes, e.g. "step-1", "step--1", "text-lg". */
export function fluidVariable(p: FluidTypeScaleParams, step: number): string {
  return `${prefixOf(p)}-${fluidStepName(step, p.naming)}`;
}

const header = (p: FluidTypeScaleParams): string =>
  `/* Fluid type scale: ${Math.min(p.minViewport, p.maxViewport)}px to ${Math.max(p.minViewport, p.maxViewport)}px, ` +
  `${formatNumber(p.minBase, 2)}px × ${TYPE_SCALE_RATIOS[p.minRatio]} to ${formatNumber(p.maxBase, 2)}px × ${TYPE_SCALE_RATIOS[p.maxRatio]} */`;

export function fluidCssVariables(p: FluidTypeScaleParams): string {
  const lines = fluidStepsOf(p).map(
    (s) => `  --${fluidVariable(p, s.step)}: ${fluidClamp(s, p.unit)};`,
  );
  return `${header(p)}\n:root {\n${lines.join("\n")}\n}\n`;
}

function utilityClasses(p: FluidTypeScaleParams): string {
  const rules = fluidStepsOf(p).map((s) => {
    const name = fluidVariable(p, s.step);
    return `.${name} {\n  font-size: var(--${name});\n}`;
  });
  return `${fluidCssVariables(p)}\n${rules.join("\n\n")}\n`;
}

function tailwindTheme(p: FluidTypeScaleParams): string {
  // Tailwind v4 maps `--text-*` theme variables to `text-*` utilities.
  const steps = fluidStepsOf(p);
  const lines = steps.map(
    (s) => `  --text-${fluidStepName(s.step, p.naming)}: ${fluidClamp(s, p.unit)};`,
  );
  const example = fluidStepName(steps[steps.length - 1]?.step ?? 0, p.naming);
  return `${header(p)}\n@theme {\n${lines.join("\n")}\n}\n\n/* Usage: class="text-${example}" */\n`;
}

export const fluidTypeScaleTool = defineTool({
  id: ID,
  version: 1,
  category: ["css-effects"],
  schema,
  defaults,
  defaultSize: { width: 1280, height: 960 },
  contentParams: ["sample"],
  presets: [
    preset("balanced", {}),
    preset("compact", {
      minBase: 15,
      maxBase: 16,
      minRatio: "major-second",
      maxRatio: "minor-third",
      stepsUp: 4,
      font: "sans",
      fontWeight: 500,
    }),
    preset("editorial", {
      minBase: 18,
      maxBase: 21,
      minRatio: "major-third",
      maxRatio: "perfect-fourth",
      font: "serif",
      fontWeight: 600,
      background: "#fffbf5",
      ink: "#2b211a",
      accent: "#b45309",
    }),
    preset("bold-hero", {
      minBase: 16,
      maxBase: 20,
      minRatio: "minor-third",
      maxRatio: "perfect-fourth",
      stepsUp: 7,
      fontWeight: 800,
      background: "#0f172a",
      ink: "#f8fafc",
      accent: "#38bdf8",
    }),
    preset("app-ui", {
      minViewport: 320,
      maxViewport: 1024,
      minBase: 14,
      maxBase: 16,
      minRatio: "major-second",
      maxRatio: "major-second",
      stepsDown: 1,
      stepsUp: 4,
      unit: "px",
      naming: "tshirt",
      prefix: "text",
      previewViewport: 1024,
      fontWeight: 500,
    }),
    preset("tailwind", {
      naming: "tshirt",
      prefix: "text",
      stepsDown: 2,
      stepsUp: 7,
      accent: "#0ea5e9",
    }),
    preset("code", {
      minRatio: "major-second",
      maxRatio: "minor-third",
      stepsUp: 4,
      font: "mono",
      fontWeight: 500,
      background: "#111111",
      ink: "#e5e5e5",
      accent: "#a3e635",
    }),
    preset("playful", {
      minBase: 16,
      maxBase: 19,
      minRatio: "major-third",
      maxRatio: "perfect-fourth",
      font: "rounded",
      fontWeight: 700,
      background: "#fff7ed",
      ink: "#431407",
      accent: "#f97316",
    }),
    preset("golden", {
      minBase: 16,
      maxBase: 20,
      minRatio: "perfect-fourth",
      maxRatio: "golden-ratio",
      stepsDown: 1,
      stepsUp: 4,
      font: "serif",
      fontWeight: 700,
      background: "#1c1917",
      ink: "#fafaf9",
      accent: "#facc15",
    }),
    preset("docs", {
      minBase: 15,
      maxBase: 17,
      minRatio: "minor-second",
      maxRatio: "major-second",
      stepsDown: 1,
      stepsUp: 6,
      fontWeight: 600,
      background: "#f8fafc",
      ink: "#0f172a",
      accent: "#16a34a",
    }),
    preset("magazine", {
      minViewport: 400,
      maxViewport: 1440,
      minBase: 17,
      maxBase: 20,
      minRatio: "major-third",
      maxRatio: "perfect-fifth",
      stepsUp: 6,
      font: "serif",
      fontWeight: 400,
      previewViewport: 1440,
      background: "#fdf2f8",
      ink: "#500724",
      accent: "#be185d",
    }),
  ],
  controls: {
    groups: [
      { id: "viewport", labelKey: `tools.${ID}.groups.viewport` },
      { id: "scale", labelKey: `tools.${ID}.groups.scale` },
      { id: "code", labelKey: `tools.${ID}.groups.code` },
      { id: "preview", labelKey: `tools.${ID}.groups.preview` },
      COMMON_GROUPS.colors,
    ],
    order: [
      "minViewport",
      "maxViewport",
      "minBase",
      "maxBase",
      "minRatio",
      "maxRatio",
      "stepsDown",
      "stepsUp",
      "unit",
      "naming",
      "prefix",
      "previewViewport",
      "sample",
      "font",
      "fontWeight",
      "background",
      "ink",
      "accent",
    ],
    params: {
      minViewport: { group: "viewport", kind: "number", step: 1, unit: "px" },
      maxViewport: { group: "viewport", kind: "number", step: 1, unit: "px" },
      minBase: { group: "scale", step: 0.5, unit: "px" },
      maxBase: { group: "scale", step: 0.5, unit: "px" },
      minRatio: {
        group: "scale",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "ratio", TYPE_SCALE_RATIO_IDS),
      },
      maxRatio: {
        group: "scale",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "ratio", TYPE_SCALE_RATIO_IDS),
      },
      stepsDown: { group: "scale", step: 1 },
      stepsUp: { group: "scale", step: 1 },
      unit: {
        group: "code",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "unit", FLUID_UNITS),
      },
      naming: {
        group: "code",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "naming", FLUID_NAMINGS),
      },
      prefix: { group: "code", kind: "text", lockable: false },
      previewViewport: { group: "preview", step: 1, unit: "px" },
      sample: { group: "preview", kind: "text", lockable: false },
      font: {
        group: "preview",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "font", AVATAR_FONTS),
      },
      fontWeight: { group: "preview", step: 100 },
      background: { group: "colors" },
      ink: { group: "colors" },
      accent: { group: "colors" },
    },
  },
  randomize(rng, current, locks) {
    // New proportions; viewports, code settings and the look stay.
    const minIndex = rng.int(1, 4);
    const next: FluidTypeScaleParams = {
      ...current,
      minBase: rng.pick([14, 15, 16, 16, 17, 18]),
      maxBase: rng.pick([16, 17, 18, 19, 20, 22]),
      minRatio: TYPE_SCALE_RATIO_IDS[minIndex] as FluidTypeScaleParams["minRatio"],
      maxRatio: TYPE_SCALE_RATIO_IDS[
        Math.min(TYPE_SCALE_RATIO_IDS.length - 1, minIndex + rng.int(0, 2))
      ] as FluidTypeScaleParams["maxRatio"],
      stepsUp: rng.int(4, 7),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors, current) {
    // Only the accent: ink and background stay a readable pair.
    return { accent: colors[0] ?? current.accent };
  },
  advisories(p) {
    const factor = fluidZoomFactor(fluidStepsOf(p));
    if (factor <= FLUID_ZOOM_SAFE_FACTOR) return [];
    return [
      {
        id: "zoom",
        messageKey: `tools.${ID}.advisories.zoom`,
        values: { factor: formatNumber(factor, 1), limit: String(FLUID_ZOOM_SAFE_FACTOR) },
      },
    ];
  },
  render: {
    kind: "svg",
    render(p, { width, height }) {
      const steps = fluidStepsOf(p);
      return fluidSpecimenSvg({
        steps,
        names: steps.map((s) => `--${fluidVariable(p, s.step)}`),
        minViewport: p.minViewport,
        maxViewport: p.maxViewport,
        viewport: p.previewViewport,
        sample: p.sample,
        font: p.font,
        fontWeight: p.fontWeight,
        background: p.background,
        ink: p.ink,
        muted: mixHex(p.ink, p.background, 0.45, "oklab"),
        accent: p.accent,
        width,
        height,
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "css-variables",
      labelKey: EXTRA_EXPORT_LABELS.cssVariables,
      language: "css",
      render: (p) => fluidCssVariables(p),
    },
    {
      id: "utility-classes",
      labelKey: EXTRA_EXPORT_LABELS.utilityClasses,
      language: "css",
      render: (p) => utilityClasses(p),
    },
    {
      id: "tailwind-theme",
      labelKey: EXTRA_EXPORT_LABELS.tailwindTheme,
      language: "css",
      render: (p) => tailwindTheme(p),
    },
  ],
});
