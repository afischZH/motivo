/**
 * M4-AP05: CSS shadow generator (docs/TOOLS.md J1). Layered `box-shadow`
 * on a real CSS preview element (card or button) that sits on a Musterli
 * background. One render path: `render` returns the stage as `css` (preview
 * only) and the element as `CssOutput.element` (its declarations are the CSS
 * export); the SVG twin for SVG/PNG/WebP is drawn from the same layer list.
 */
import {
  SHADOW_EASINGS,
  SHADOW_LAYERS_MAX,
  SHADOW_LAYERS_MIN,
  SHADOW_SHAPES,
  SHADOW_STAGES,
  boxShadowEntries,
  boxShadowValue,
  dropShadowValue,
  formatNumber,
  shadowAutoColor,
  shadowElementBox,
  shadowLayers,
  shadowStage,
  shadowSvg,
  shadowTailwindClass,
  toCssName,
  type ShadowLayer,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { COLOR_ANIMATION } from "../animation";
import { defineTool } from "../registry";
import type { CanvasSize, Preset } from "../types";
import { NAME_DESCRIPTION, NAME_LABEL, cssNameSchema } from "./color-shared";
import { EXTRA_EXPORT_LABELS, optionLabels, roundTo } from "./shared";

const ID = "css-shadow";

const schema = z.object({
  layers: z.int().min(SHADOW_LAYERS_MIN).max(SHADOW_LAYERS_MAX),
  distance: z.number().min(0).max(120),
  blur: z.number().min(0).max(240),
  spread: z.number().min(-60).max(60),
  angle: z.number().min(0).max(360),
  opacity: z.number().min(0).max(100),
  autoColor: z.boolean(),
  color: colorSchema,
  easing: z.enum(SHADOW_EASINGS),
  inset: z.boolean(),
  shape: z.enum(SHADOW_SHAPES),
  radius: z.number().min(0).max(80),
  elementColor: colorSchema,
  stage: z.enum(SHADOW_STAGES),
  surface: colorSchema,
  name: cssNameSchema,
});

export type CssShadowParams = z.output<typeof schema>;

/** Shadows are absolute pixels: a moderate canvas keeps the preview near 1:1. */
const SHADOW_SIZE: CanvasSize = { width: 960, height: 640 };

const defaults: CssShadowParams = {
  layers: 5,
  distance: 24,
  blur: 48,
  spread: -4,
  angle: 0,
  opacity: 40,
  autoColor: true,
  color: "#0f172a",
  easing: "exponential",
  inset: false,
  shape: "card",
  radius: 16,
  elementColor: "#ffffff",
  stage: "gradient",
  surface: "#e8edf5",
  name: "soft",
};

const preset = (id: string, params: Partial<CssShadowParams>): Preset<CssShadowParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** The shadow colour actually used. */
export function shadowColorOf(p: CssShadowParams): string {
  return p.autoColor ? shadowAutoColor(p.surface) : p.color;
}

function layersOf(p: CssShadowParams): ShadowLayer[] {
  return shadowLayers({ ...p, opacity: p.opacity / 100 });
}

const px = (v: number): string => (v === 0 ? "0" : `${formatNumber(v, 1)}px`);

/** Element declarations: colour, radius and shadow. Exported as the tool's CSS. */
function elementCss(p: CssShadowParams, layers: readonly ShadowLayer[]): string {
  return [
    `background-color: ${p.elementColor};`,
    `border-radius: ${px(p.radius)};`,
    `box-shadow: ${boxShadowValue(layers, shadowColorOf(p), p.inset)};`,
  ].join("\n");
}

const nameOf = (p: CssShadowParams): string => toCssName(p.name, "soft");

export const cssShadowTool = defineTool({
  id: ID,
  version: 1,
  category: ["css-effects"],
  schema,
  defaults,
  defaultSize: SHADOW_SIZE,
  presets: [
    preset("soft", {}),
    preset("floating", {
      layers: 6,
      distance: 48,
      blur: 96,
      spread: -12,
      opacity: 45,
      stage: "dots",
      name: "floating",
    }),
    preset("crisp", {
      layers: 2,
      distance: 4,
      blur: 6,
      spread: 0,
      opacity: 30,
      easing: "linear",
      radius: 8,
      stage: "solid",
      surface: "#f4f4f5",
      name: "crisp",
    }),
    preset("deep", {
      layers: 8,
      distance: 80,
      blur: 160,
      spread: -16,
      opacity: 55,
      surface: "#d9d3c7",
      stage: "gradient",
      name: "deep",
    }),
    preset("inner", {
      layers: 3,
      distance: 6,
      blur: 16,
      spread: 0,
      opacity: 30,
      inset: true,
      easing: "linear",
      elementColor: "#eef1f6",
      surface: "#eef1f6",
      stage: "solid",
      name: "inner",
    }),
    preset("button", {
      layers: 3,
      distance: 6,
      blur: 12,
      spread: -1,
      opacity: 35,
      shape: "button",
      radius: 40,
      elementColor: "#4f46e5",
      surface: "#f5f3ff",
      stage: "grid",
      easing: "ease-out",
      name: "button",
    }),
    preset("sunset", {
      layers: 4,
      distance: 32,
      blur: 64,
      spread: -8,
      angle: 300,
      opacity: 35,
      autoColor: false,
      color: "#9a3412",
      elementColor: "#fff7ed",
      surface: "#fed7aa",
      stage: "gradient",
      name: "sunset",
    }),
    preset("hairline", {
      layers: 1,
      distance: 1,
      blur: 2,
      spread: 0,
      opacity: 35,
      easing: "linear",
      radius: 12,
      stage: "solid",
      surface: "#f1f5f9",
      name: "hairline",
    }),
    preset("glow", {
      layers: 4,
      distance: 0,
      blur: 60,
      spread: 4,
      opacity: 60,
      autoColor: false,
      color: "#8b5cf6",
      elementColor: "#1e1b4b",
      surface: "#0f0a24",
      stage: "dots",
      name: "glow",
    }),
    preset("pill", {
      layers: 4,
      distance: 12,
      blur: 24,
      spread: -6,
      opacity: 40,
      shape: "button",
      radius: 80,
      elementColor: "#f43f5e",
      surface: "#fff1f2",
      stage: "solid",
      easing: "exponential",
      name: "pill",
    }),
    preset("side-light", {
      layers: 5,
      distance: 40,
      blur: 72,
      spread: -10,
      angle: 60,
      opacity: 40,
      surface: "#e2e8f0",
      stage: "grid",
      name: "side-light",
    }),
  ],
  controls: {
    groups: [
      { id: "shadow", labelKey: `tools.${ID}.groups.shadow` },
      { id: "colors", labelKey: "tools.common.groups.colors" },
      { id: "element", labelKey: `tools.${ID}.groups.element` },
      { id: "code", labelKey: `tools.${ID}.groups.code`, collapsed: true },
    ],
    order: [
      "layers",
      "distance",
      "blur",
      "spread",
      "angle",
      "easing",
      "inset",
      "opacity",
      "autoColor",
      "color",
      "shape",
      "radius",
      "elementColor",
      "stage",
      "surface",
      "name",
    ],
    params: {
      layers: { group: "shadow" },
      distance: { group: "shadow", step: 1, unit: "px" },
      blur: { group: "shadow", step: 1, unit: "px" },
      spread: { group: "shadow", step: 1, unit: "px", advanced: true },
      angle: {
        group: "shadow",
        kind: "angle",
        step: 1,
        unit: "°",
        descriptionKey: `tools.${ID}.params.angle.description`,
      },
      easing: {
        group: "shadow",
        optionLabelKeys: optionLabels(ID, "easing", SHADOW_EASINGS),
        descriptionKey: `tools.${ID}.params.easing.description`,
      },
      inset: { group: "shadow" },
      opacity: { group: "colors", step: 1, unit: "%" },
      autoColor: {
        group: "colors",
        descriptionKey: `tools.${ID}.params.autoColor.description`,
        lockable: false,
      },
      color: { group: "colors", visibleWhen: (p) => !p.autoColor },
      shape: {
        group: "element",
        optionLabelKeys: optionLabels(ID, "shape", SHADOW_SHAPES),
        lockable: false,
      },
      radius: { group: "element", step: 1, unit: "px" },
      elementColor: { group: "element" },
      stage: {
        group: "element",
        optionLabelKeys: optionLabels(ID, "stage", SHADOW_STAGES),
        descriptionKey: `tools.${ID}.params.stage.description`,
      },
      surface: { group: "element" },
      name: {
        group: "code",
        kind: "text",
        labelKey: NAME_LABEL,
        descriptionKey: NAME_DESCRIPTION,
        lockable: false,
      },
    },
  },
  randomize(rng, current, locks) {
    // Space rolls light direction, size and easing; colours and element stay.
    const distance = rng.int(2, 24) * 4;
    const next: CssShadowParams = {
      ...current,
      angle: rng.bool(0.4) ? 0 : rng.int(0, 71) * 5,
      distance,
      blur: Math.min(240, roundTo(distance * rng.float(1.5, 2.5), 0)),
      spread: rng.int(-4, 0) * 2,
      layers: rng.int(3, 7),
      easing: rng.pick(SHADOW_EASINGS),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "css",
    render(p, { width, height }) {
      const layers = layersOf(p);
      const box = shadowElementBox(p.shape, width, height);
      const stage = shadowStage(p.stage, p.surface, width, height);
      return {
        css: stage.css,
        element: { ...box, css: elementCss(p, layers) },
        previewSvg: shadowSvg({
          width,
          height,
          layers,
          color: shadowColorOf(p),
          inset: p.inset,
          radius: p.radius,
          element: box,
          elementColor: p.elementColor,
          stageSvg: stage.svg,
        }),
      };
    },
  },
  exports: ["svg", "png", "webp"],
  animation: COLOR_ANIMATION,
  extraExports: [
    {
      id: "css",
      labelKey: EXTRA_EXPORT_LABELS.css,
      language: "css",
      render: (p) => `${elementCss(p, layersOf(p))}\n`,
    },
    {
      id: "tailwind",
      labelKey: EXTRA_EXPORT_LABELS.tailwind,
      language: "html",
      render(p) {
        const layers = layersOf(p);
        const classes = [
          `bg-[${p.elementColor}]`,
          `rounded-[${px(p.radius)}]`,
          shadowTailwindClass(layers, shadowColorOf(p), p.inset),
        ];
        return `<div class="${classes.join(" ")}"></div>\n`;
      },
    },
    {
      id: "tailwind-theme",
      labelKey: EXTRA_EXPORT_LABELS.tailwindTheme,
      language: "css",
      render(p) {
        const value = boxShadowEntries(layersOf(p), shadowColorOf(p), p.inset).join(",\n    ");
        const name = nameOf(p);
        return `@theme {\n  --shadow-${name}:\n    ${value};\n}\n\n/* Usage: class="shadow-${name}" */\n`;
      },
    },
    {
      id: "css-variable",
      labelKey: EXTRA_EXPORT_LABELS.cssVariables,
      language: "css",
      render(p) {
        const value = boxShadowEntries(layersOf(p), shadowColorOf(p), p.inset).join(",\n    ");
        const name = nameOf(p);
        return `:root {\n  --shadow-${name}:\n    ${value};\n}\n\n.card {\n  box-shadow: var(--shadow-${name});\n}\n`;
      },
    },
    {
      id: "drop-shadow",
      labelKey: EXTRA_EXPORT_LABELS.dropShadow,
      language: "css",
      render(p) {
        const note = p.inset
          ? "/* drop-shadow() has no inset: this is the outer version of the shadow. */\n"
          : "";
        const spread = p.spread !== 0 ? "/* drop-shadow() has no spread; it is left out. */\n" : "";
        return `${note}${spread}filter:\n    ${dropShadowValue(layersOf(p), shadowColorOf(p))};\n`;
      },
    },
  ],
});
