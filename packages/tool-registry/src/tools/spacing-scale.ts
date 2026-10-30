/**
 * W3: Fluid spacing scale (docs/TOOLS.md M7). T-shirt sizes around a base
 * space that grows between two viewport widths, exported as CSS variables
 * with `clamp()`, utility classes and a Tailwind v4 `@theme`. The preview is
 * a specimen at a chosen viewport width, which is also the image export.
 */
import {
  SPACE_DOWN_MAX,
  SPACE_PAIRS,
  SPACE_SIZE_IDS,
  SPACE_UP_MAX,
  fluidClamp,
  formatNumber,
  mixHex,
  spacingSizes,
  spacingSpecimenSvg,
  toCssName,
  type SpaceSize,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { FLUID_UNITS } from "./fluid-type-scale";
import { COMMON_GROUPS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "spacing-scale";

const viewport = z.int().min(240).max(3840);
const base = z.number().min(4).max(64);
const sizeId = z.enum(SPACE_SIZE_IDS as [string, ...string[]]);

const schema = z.object({
  minViewport: viewport,
  maxViewport: viewport,
  minBase: base,
  maxBase: base,
  sizesDown: z.int().min(0).max(SPACE_DOWN_MAX),
  sizesUp: z.int().min(0).max(SPACE_UP_MAX),
  pairs: z.enum(SPACE_PAIRS),
  pairFrom: sizeId,
  pairTo: sizeId,
  unit: z.enum(FLUID_UNITS),
  /** Variable prefix, sanitised with `toCssName` at export time. */
  prefix: z.string().max(24),
  /** Viewport width of the specimen. */
  previewViewport: viewport,
  background: colorSchema,
  ink: colorSchema,
  accent: colorSchema,
});

export type SpacingScaleParams = z.output<typeof schema>;

const defaults: SpacingScaleParams = {
  minViewport: 360,
  maxViewport: 1280,
  minBase: 16,
  maxBase: 20,
  sizesDown: 3,
  sizesUp: 4,
  pairs: "none",
  pairFrom: "s",
  pairTo: "l",
  unit: "rem",
  prefix: "space",
  previewViewport: 1280,
  background: "#ffffff",
  ink: "#111827",
  accent: "#4f46e5",
};

const preset = (id: string, params: Partial<SpacingScaleParams>): Preset<SpacingScaleParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export function spacingSizesOf(p: SpacingScaleParams): SpaceSize[] {
  return spacingSizes(p);
}

const prefixOf = (p: SpacingScaleParams): string => toCssName(p.prefix, "space");

/** Variable name of a size without the dashes, e.g. "space-s" or "space-s-l". */
export function spacingVariable(p: SpacingScaleParams, size: SpaceSize): string {
  return `${prefixOf(p)}-${size.name}`;
}

const header = (p: SpacingScaleParams): string =>
  `/* Fluid spacing scale: ${Math.min(p.minViewport, p.maxViewport)}px to ${Math.max(p.minViewport, p.maxViewport)}px, ` +
  `base ${formatNumber(p.minBase, 2)}px to ${formatNumber(p.maxBase, 2)}px */`;

export function spacingCssVariables(p: SpacingScaleParams): string {
  const lines = spacingSizesOf(p).map(
    (s) => `  --${spacingVariable(p, s)}: ${fluidClamp(s, p.unit)};`,
  );
  return `${header(p)}\n:root {\n${lines.join("\n")}\n}\n`;
}

function utilityClasses(p: SpacingScaleParams): string {
  const rules = spacingSizesOf(p).flatMap((s) => {
    const name = spacingVariable(p, s);
    return [
      `.gap-${name} {\n  gap: var(--${name});\n}`,
      `.p-${name} {\n  padding: var(--${name});\n}`,
      `.flow-${name} > * + * {\n  margin-block-start: var(--${name});\n}`,
    ];
  });
  return `${spacingCssVariables(p)}\n${rules.join("\n\n")}\n`;
}

function tailwindTheme(p: SpacingScaleParams): string {
  // Tailwind v4 maps `--spacing-*` theme variables to p-*, m-*, gap-* and more.
  const sizes = spacingSizesOf(p);
  const lines = sizes.map((s) => `  --spacing-${s.name}: ${fluidClamp(s, p.unit)};`);
  return `${header(p)}\n@theme {\n${lines.join("\n")}\n}\n\n/* Usage: class="p-s gap-m mt-xl" */\n`;
}

export const spacingScaleTool = defineTool({
  id: ID,
  version: 1,
  category: ["css-effects"],
  schema,
  defaults,
  defaultSize: { width: 1280, height: 960 },
  presets: [
    preset("balanced", {}),
    preset("compact", {
      minBase: 12,
      maxBase: 16,
      sizesDown: 2,
      sizesUp: 3,
      accent: "#0ea5e9",
    }),
    preset("airy", {
      minBase: 18,
      maxBase: 28,
      sizesDown: 2,
      sizesUp: 5,
      background: "#fffbf5",
      ink: "#2b211a",
      accent: "#b45309",
    }),
    preset("pairs", {
      pairs: "one-up",
      sizesDown: 1,
      sizesUp: 3,
      background: "#0f172a",
      ink: "#f8fafc",
      accent: "#38bdf8",
    }),
    preset("hero-gap", {
      minBase: 16,
      maxBase: 24,
      pairs: "custom",
      pairFrom: "m",
      pairTo: "3xl",
      accent: "#db2777",
    }),
    preset("app-ui", {
      minViewport: 320,
      maxViewport: 1024,
      minBase: 12,
      maxBase: 14,
      sizesDown: 3,
      sizesUp: 3,
      unit: "px",
      previewViewport: 1024,
      accent: "#16a34a",
    }),
    preset("tailwind", {
      prefix: "spacing",
      sizesDown: 3,
      sizesUp: 5,
      accent: "#06b6d4",
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
      "sizesDown",
      "sizesUp",
      "pairs",
      "pairFrom",
      "pairTo",
      "unit",
      "prefix",
      "previewViewport",
      "background",
      "ink",
      "accent",
    ],
    params: {
      minViewport: { group: "viewport", kind: "number", step: 1, unit: "px" },
      maxViewport: { group: "viewport", kind: "number", step: 1, unit: "px" },
      minBase: { group: "scale", step: 0.5, unit: "px" },
      maxBase: { group: "scale", step: 0.5, unit: "px" },
      sizesDown: { group: "scale", step: 1 },
      sizesUp: { group: "scale", step: 1 },
      pairs: {
        group: "scale",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "pairs", SPACE_PAIRS),
      },
      pairFrom: {
        group: "scale",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "size", SPACE_SIZE_IDS),
        visibleWhen: (p) => p.pairs === "custom",
      },
      pairTo: {
        group: "scale",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "size", SPACE_SIZE_IDS),
        visibleWhen: (p) => p.pairs === "custom",
      },
      unit: {
        group: "code",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "unit", FLUID_UNITS),
      },
      prefix: { group: "code", kind: "text", lockable: false },
      previewViewport: { group: "preview", step: 1, unit: "px" },
      background: { group: "colors" },
      ink: { group: "colors" },
      accent: { group: "colors" },
    },
  },
  randomize(rng, current, locks) {
    // New proportions; viewports, code settings and the look stay.
    const minBase = rng.pick([12, 14, 16, 16, 18]);
    const next: SpacingScaleParams = {
      ...current,
      minBase,
      maxBase: minBase + rng.pick([2, 4, 4, 6, 8]),
      sizesDown: rng.int(1, SPACE_DOWN_MAX),
      sizesUp: rng.int(2, SPACE_UP_MAX),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors, current) {
    // Only the accent: ink and background stay a readable pair.
    return { accent: colors[0] ?? current.accent };
  },
  render: {
    kind: "svg",
    render(p, { width, height }) {
      const sizes = spacingSizesOf(p);
      return spacingSpecimenSvg({
        sizes,
        names: sizes.map((s) => `--${spacingVariable(p, s)}`),
        minViewport: p.minViewport,
        maxViewport: p.maxViewport,
        viewport: p.previewViewport,
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
      render: (p) => spacingCssVariables(p),
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
