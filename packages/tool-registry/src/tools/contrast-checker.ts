/**
 * M4-AP05: Contrast checker (docs/TOOLS.md F6). Text and background colour,
 * WCAG 2 levels (AA/AAA for normal and large text, 3:1 for UI components),
 * colour vision deficiency simulation and, as one-click suggestions, the
 * nearest colours that reach AA or AAA by moving only OKLCH lightness.
 *
 * The EyeDropper comes with the generic colour control (feature-detected);
 * brand palettes use the generic mapping (text, background, then the pair
 * palette). APCA is deliberately not included (licence of the reference
 * implementation not yet checked).
 */
import {
  CONTRAST_SAMPLES,
  VISION_SIMULATIONS,
  contrastCheckerSvg,
  contrastRatio,
  contrastReport,
  cssVariables,
  formatRatio,
  nearestPassingColor,
  normalizeHex,
  oklchToHex,
  randomPalette,
  sampleTargets,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema, paletteSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { ParamSuggestion, Preset } from "../types";
import { COLOR_TOOL_SIZE } from "./color-shared";
import { COMMON_LABELS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "contrast-checker";

const schema = z.object({
  foreground: colorSchema,
  background: colorSchema,
  sample: z.enum(CONTRAST_SAMPLES),
  simulation: z.enum(VISION_SIMULATIONS),
  pairs: z.boolean(),
  palette: paletteSchema,
});

export type ContrastCheckerParams = z.output<typeof schema>;

const defaults: ContrastCheckerParams = {
  foreground: "#5b6b7f",
  background: "#ffffff",
  sample: "body",
  simulation: "none",
  pairs: false,
  palette: ["#f8f9fa", "#2a9d8f", "#264653", "#e9c46a", "#e76f51"],
};

const preset = (
  id: string,
  params: Partial<ContrastCheckerParams>,
): Preset<ContrastCheckerParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** i18n key of a suggestion label. */
const suggestionKey = (id: string): string => `tools.${ID}.suggestions.${id}`;

/** Suggestion ids, also the message keys under `tools.contrast-checker.suggestions`. */
export const CONTRAST_SUGGESTION_IDS = [
  "foreground-aa",
  "foreground-aaa",
  "background-aa",
  "background-aaa",
] as const;

/**
 * Nearest passing text and background colours for the sample's AA and AAA
 * targets. Empty when the pair already passes or in matrix mode.
 */
export function contrastSuggestions(
  p: ContrastCheckerParams,
): ParamSuggestion<ContrastCheckerParams>[] {
  if (p.pairs) return [];
  const fg = normalizeHex(p.foreground);
  const bg = normalizeHex(p.background);
  const ratio = contrastRatio(fg, bg);
  const targets = sampleTargets(p.sample);
  const out: ParamSuggestion<ContrastCheckerParams>[] = [];
  const levels = [
    { level: "aa", min: targets.aa },
    ...(targets.aaa === null ? [] : [{ level: "aaa", min: targets.aaa }]),
  ];
  for (const side of ["foreground", "background"] as const) {
    const seen = new Set<string>();
    for (const { level, min } of levels) {
      if (ratio >= min) continue;
      const color =
        side === "foreground" ? nearestPassingColor(fg, bg, min) : nearestPassingColor(bg, fg, min);
      if (color === null || seen.has(color)) continue;
      seen.add(color);
      const id = `${side}-${level}`;
      const newRatio = side === "foreground" ? contrastRatio(color, bg) : contrastRatio(fg, color);
      out.push({
        id,
        labelKey: suggestionKey(id),
        values: { color, ratio: formatRatio(newRatio) },
        swatch: color,
        patch: { [side]: color },
      });
    }
  }
  return out;
}

export const contrastCheckerTool = defineTool({
  id: ID,
  version: 1,
  category: ["colors"],
  schema,
  defaults,
  defaultSize: COLOR_TOOL_SIZE,
  presets: [
    preset("slate", {}),
    preset("night", { foreground: "#e2e8f0", background: "#0f172a", sample: "body" }),
    preset("signal", { foreground: "#ffffff", background: "#e4572e", sample: "heading" }),
    preset("mint", { foreground: "#7bc8a4", background: "#ffffff", sample: "ui" }),
    preset("traffic-light", {
      foreground: "#d62828",
      background: "#2a9d55",
      sample: "heading",
      simulation: "deuteranopia",
    }),
    preset("sky", { foreground: "#3a86ff", background: "#ffbe0b", simulation: "tritanopia" }),
    preset("grey-scale", {
      foreground: "#7a5cff",
      background: "#ff5c8a",
      simulation: "achromatopsia",
    }),
    preset("palette-pairs", { pairs: true }),
  ],
  controls: {
    groups: [
      { id: "colors", labelKey: "tools.common.groups.colors" },
      { id: "check", labelKey: `tools.${ID}.groups.check` },
      { id: "pairs", labelKey: `tools.${ID}.groups.pairs` },
    ],
    order: ["foreground", "background", "sample", "simulation", "pairs", "palette"],
    params: {
      foreground: { group: "colors" },
      background: { group: "colors" },
      sample: {
        group: "check",
        optionLabelKeys: optionLabels(ID, "sample", CONTRAST_SAMPLES),
        descriptionKey: `tools.${ID}.params.sample.description`,
        lockable: false,
      },
      simulation: {
        group: "check",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "simulation", VISION_SIMULATIONS),
        descriptionKey: `tools.${ID}.params.simulation.description`,
        lockable: false,
      },
      pairs: {
        group: "pairs",
        descriptionKey: `tools.${ID}.params.pairs.description`,
        lockable: false,
      },
      palette: {
        group: "pairs",
        labelKey: COMMON_LABELS.palette,
        visibleWhen: (p) => p.pairs,
      },
    },
  },
  randomize(rng, current, locks) {
    // A light or dark background with a text colour of clearly different lightness.
    const dark = rng.bool(0.35);
    const background = oklchToHex({
      l: dark ? rng.float(0.15, 0.3) : rng.float(0.88, 0.99),
      c: rng.float(0, 0.06),
      h: rng.float(0, 360),
    });
    const foreground = oklchToHex({
      l: dark ? rng.float(0.6, 0.95) : rng.float(0.2, 0.6),
      c: rng.float(0.02, 0.18),
      h: rng.float(0, 360),
    });
    const next: ContrastCheckerParams = {
      ...current,
      foreground,
      background,
      palette: randomPalette(rng, current.palette.length),
    };
    return keepLocked(next, current, locks);
  },
  suggestions: contrastSuggestions,
  render: {
    kind: "svg",
    render(p, { width, height }) {
      return contrastCheckerSvg({ ...p, width, height });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "css-variables",
      labelKey: EXTRA_EXPORT_LABELS.cssVariables,
      language: "css",
      render: (p) =>
        cssVariables("color", [
          { name: "text", color: p.foreground },
          { name: "background", color: p.background },
          ...(p.pairs ? p.palette.map((color, i) => ({ name: String(i + 1), color })) : []),
        ]),
    },
    {
      id: "report",
      labelKey: EXTRA_EXPORT_LABELS.report,
      language: "text",
      render: (p) => contrastReport(p),
    },
  ],
});
