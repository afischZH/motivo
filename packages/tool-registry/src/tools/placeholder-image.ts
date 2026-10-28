/**
 * M4c-AP01: Placeholder images (docs/TOOLS.md L1). A fill (solid, gradient
 * or library pattern) in any size with an optional "W × H" or custom label,
 * diagonal lines and a border, for wireframes, mockups and layouts. Shares
 * the engine of the avatar tool (fills, fonts, text fitting).
 */
import {
  AVATAR_FILLS,
  AVATAR_FONTS,
  autoInk,
  placeholderSizeLabel,
  placeholderSvg,
  randomPalette,
} from "@musterli/engine";
import * as z from "zod";
import { paletteSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset, RenderContext, ToolSizePreset } from "../types";
import { PATTERN_GROUPS, PATTERN_LABELS, fillShape, patternThumbnail } from "./avatar-shared";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels } from "./shared";

const ID = "placeholder-image";

export const PLACEHOLDER_LABELS = ["size", "custom", "none"] as const;
export const PLACEHOLDER_TEXT_MAX = 120;

const schema = z.object({
  /** Fill colours: solid uses the first, the gradient the first two. */
  palette: paletteSchema,
  ...fillShape,
  /** Pattern period in px. */
  patternScale: z.int().min(4).max(200),
  label: z.enum(PLACEHOLDER_LABELS),
  text: z.string().max(PLACEHOLDER_TEXT_MAX),
  /** Font size, percent of the geometric mean of the edges (shrinks to fit the width). */
  fontSize: z.number().min(2).max(40),
  /** Diagonal lines from corner to corner. */
  cross: z.boolean(),
  /** Inner border in px. */
  border: z.int().min(0).max(32),
});

export type PlaceholderImageParams = z.output<typeof schema>;

const defaults: PlaceholderImageParams = {
  palette: ["#cbd5e1", "#94a3b8"],
  fill: "solid",
  gradientAngle: 135,
  pattern: "grid-lines",
  patternScale: 40,
  patternOpacity: 25,
  font: "sans",
  fontWeight: 600,
  inkAuto: true,
  ink: "#334155",
  label: "size",
  text: "",
  fontSize: 8,
  cross: true,
  border: 0,
};

const preset = (
  id: string,
  params: Partial<PlaceholderImageParams>,
): Preset<PlaceholderImageParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

const size = (id: string, width: number, height: number): ToolSizePreset => ({
  id,
  width,
  height,
  nameKey: `tools.${ID}.sizes.${id}`,
});

/** The label a placeholder shows at a render size. */
export function placeholderLabel(p: PlaceholderImageParams, width: number, height: number): string {
  if (p.label === "none") return "";
  if (p.label === "custom") return p.text.trim();
  return placeholderSizeLabel(width, height);
}

function render(p: PlaceholderImageParams, ctx: RenderContext): string {
  return placeholderSvg({
    palette: p.palette,
    text: placeholderLabel(p, ctx.width, ctx.height),
    fill: p.fill,
    gradientAngle: p.gradientAngle,
    pattern: p.pattern,
    patternSize: p.patternScale,
    patternOpacity: p.patternOpacity / 100,
    font: p.font,
    fontWeight: p.fontWeight,
    fontSize: p.fontSize,
    ink: p.inkAuto ? null : p.ink,
    cross: p.cross,
    border: p.border,
    width: ctx.width,
    height: ctx.height,
  });
}

export const placeholderImageTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1200, height: 630 },
  sizePresets: [
    size("medium-rectangle", 300, 250),
    size("leaderboard", 728, 90),
    size("skyscraper", 160, 600),
    size("vga", 640, 480),
    size("svga", 800, 600),
  ],
  presets: [
    preset("gray", {}),
    preset("light", {
      palette: ["#f8fafc", "#e2e8f0"],
      cross: false,
      border: 2,
      fontWeight: 500,
    }),
    preset("dark", {
      palette: ["#1e293b", "#0f172a"],
      cross: false,
      fontWeight: 700,
      font: "mono",
    }),
    preset("gradient", {
      palette: ["#a78bfa", "#f472b6"],
      fill: "gradient",
      gradientAngle: 120,
      cross: false,
      font: "rounded",
      fontWeight: 700,
    }),
    preset("pattern", {
      palette: ["#fde68a", "#f59e0b"],
      fill: "pattern",
      pattern: "stripes",
      patternScale: 24,
      patternOpacity: 18,
      cross: false,
    }),
    preset("blueprint", {
      palette: ["#1d4ed8", "#93c5fd"],
      fill: "pattern",
      pattern: "graph-paper",
      patternScale: 60,
      patternOpacity: 30,
      font: "mono",
      fontWeight: 500,
      cross: false,
      border: 4,
    }),
    preset("banner", {
      palette: ["#0f766e", "#14b8a6"],
      fill: "gradient",
      gradientAngle: 90,
      label: "custom",
      text: "Your banner here",
      fontSize: 12,
      fontWeight: 800,
      cross: false,
    }),
  ],
  controls: {
    groups: [
      { id: "label", labelKey: `tools.${ID}.groups.label` },
      COMMON_GROUPS.colors,
      { id: "lines", labelKey: `tools.${ID}.groups.lines` },
    ],
    order: [
      "label",
      "text",
      "font",
      "fontWeight",
      "fontSize",
      "palette",
      "fill",
      "gradientAngle",
      "pattern",
      "patternScale",
      "patternOpacity",
      "inkAuto",
      "ink",
      "cross",
      "border",
    ],
    params: {
      label: {
        group: "label",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "label", PLACEHOLDER_LABELS),
      },
      text: { group: "label", visibleWhen: (p) => p.label === "custom" },
      font: {
        group: "label",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "font", AVATAR_FONTS),
        visibleWhen: (p) => p.label !== "none",
      },
      fontWeight: { group: "label", step: 100, visibleWhen: (p) => p.label !== "none" },
      fontSize: { group: "label", step: 1, unit: "%", visibleWhen: (p) => p.label !== "none" },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      fill: {
        group: "colors",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "fill", AVATAR_FILLS),
      },
      gradientAngle: {
        group: "colors",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: (p) => p.fill === "gradient",
      },
      pattern: {
        group: "colors",
        kind: "thumbnails",
        optionLabelKeys: PATTERN_LABELS,
        optionGroups: PATTERN_GROUPS,
        optionPreview(value, p) {
          const base = p.palette[0] ?? "#cbd5e1";
          return patternThumbnail(value, base, p.inkAuto ? autoInk(base) : p.ink);
        },
        visibleWhen: (p) => p.fill === "pattern",
      },
      patternScale: {
        group: "colors",
        step: 1,
        unit: "px",
        visibleWhen: (p) => p.fill === "pattern",
      },
      patternOpacity: {
        group: "colors",
        step: 1,
        unit: "%",
        visibleWhen: (p) => p.fill === "pattern",
      },
      inkAuto: { group: "colors" },
      ink: { group: "colors", visibleWhen: (p) => !p.inkAuto },
      cross: { group: "lines" },
      border: { group: "lines", step: 1, unit: "px" },
    },
  },
  randomize(rng, current, locks) {
    const next: PlaceholderImageParams = {
      ...current,
      palette: randomPalette(rng, 2),
      fill: rng.pick(AVATAR_FILLS),
      gradientAngle: rng.int(0, 7) * 45,
      pattern: rng.pick(PATTERN_GROUPS.flatMap((g) => g.values.map(String))),
      patternScale: rng.int(16, 64),
      patternOpacity: rng.int(15, 40),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors) {
    return { palette: colors.slice(), inkAuto: true };
  },
  render: { kind: "svg", render },
  exports: ["svg", "png", "jpg", "webp"],
});
