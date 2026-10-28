/**
 * M4c-AP01: Avatar generator (docs/TOOLS.md L1). Initials, identicons and
 * shape compositions in a circle, rounded square or square. Colour and motif
 * come from a hash of the name (same name, same avatar everywhere) or from
 * the seed. Text uses system font stacks only and is always escaped.
 *
 * Placeholder images are a separate tool (`placeholder-image`) on the same
 * engine: they need free sizes and a size label, avatars a square canvas.
 */
import {
  AVATAR_FILLS,
  AVATAR_FONTS,
  AVATAR_LETTERS_MAX,
  AVATAR_SHAPES,
  AVATAR_STYLES,
  IDENTICON_CELL_SHAPES,
  IDENTICON_GRID_MAX,
  IDENTICON_GRID_MIN,
  avatarColors,
  avatarHash,
  avatarInitials,
  avatarSvg,
  customInitials,
  deriveSeed,
  randomPalette,
} from "@musterli/engine";
import * as z from "zod";
import { TRANSPARENT, visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset, RenderContext, ToolSizePreset } from "../types";
import { PATTERN_GROUPS, PATTERN_LABELS, fillShape, patternThumbnail } from "./avatar-shared";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels } from "./shared";

const ID = "avatar";

/** Where colour and motif come from. */
export const AVATAR_SOURCES = ["name", "seed"] as const;

/** Longest name; enough for full names and e-mail addresses. */
export const AVATAR_NAME_MAX = 80;

const schema = visualParamsSchema.extend({
  style: z.enum(AVATAR_STYLES),
  /** Source of the initials and (with `source: "name"`) of colour and motif. */
  name: z.string().max(AVATAR_NAME_MAX),
  letters: z.int().min(1).max(AVATAR_LETTERS_MAX),
  /** Own initials (first three characters), empty = from the name. */
  initials: z.string().max(12),
  source: z.enum(AVATAR_SOURCES),
  shape: z.enum(AVATAR_SHAPES),
  /** Corner radius of the rounded square, percent of half the edge. */
  radius: z.number().min(0).max(50),
  ...fillShape,
  /** Pattern period, percent of the avatar edge. */
  patternScale: z.number().min(4).max(50),
  /** Font size, percent of the avatar edge. */
  fontSize: z.number().min(20).max(80),
  grid: z.int().min(IDENTICON_GRID_MIN).max(IDENTICON_GRID_MAX),
  cellShape: z.enum(IDENTICON_CELL_SHAPES),
  /** Gap between identicon cells, percent of a cell. */
  cellGap: z.number().min(0).max(40),
  /** Margin around identicon and shapes, percent of the edge. */
  inset: z.number().min(0).max(30),
});

export type AvatarParams = z.output<typeof schema>;

const defaults: AvatarParams = {
  background: TRANSPARENT,
  palette: ["#e07a5f", "#3d405b", "#81b29a", "#f2cc8f", "#6d597a", "#355070", "#b56576", "#2a9d8f"],
  style: "initials",
  name: "Ada Lovelace",
  letters: 2,
  initials: "",
  source: "name",
  shape: "circle",
  radius: 24,
  fill: "solid",
  gradientAngle: 135,
  pattern: "polka",
  patternScale: 14,
  patternOpacity: 30,
  font: "sans",
  fontWeight: 600,
  fontSize: 40,
  inkAuto: true,
  ink: "#ffffff",
  grid: 5,
  cellShape: "square",
  cellGap: 0,
  inset: 16,
};

const preset = (id: string, params: Partial<AvatarParams>): Preset<AvatarParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

const SIZES: readonly ToolSizePreset[] = [128, 256, 512, 1024].map((edge) => ({
  id: `avatar-${edge}`,
  width: edge,
  height: edge,
  nameKey: `tools.${ID}.sizes.s${edge}`,
}));

/** The hash behind colour and motif: of the name, or of the seed. */
export function avatarSourceHash(p: AvatarParams, seed: number): number {
  return p.source === "seed" ? deriveSeed(seed, "avatar") : avatarHash(p.name);
}

/** The letters an initials avatar shows. */
export function avatarText(p: AvatarParams): string {
  const own = customInitials(p.initials);
  return own !== "" ? own : avatarInitials(p.name, p.letters);
}

function render(p: AvatarParams, ctx: RenderContext): string {
  const edge = Math.min(ctx.width, ctx.height);
  return avatarSvg({
    style: p.style,
    text: avatarText(p),
    hash: avatarSourceHash(p, ctx.seed),
    palette: p.palette,
    shape: p.shape,
    radius: p.radius,
    fill: p.fill,
    gradientAngle: p.gradientAngle,
    pattern: p.pattern,
    patternSize: (p.patternScale / 100) * edge,
    patternOpacity: p.patternOpacity / 100,
    font: p.font,
    fontWeight: p.fontWeight,
    fontSize: p.fontSize,
    ink: p.inkAuto ? null : p.ink,
    grid: p.grid,
    cellShape: p.cellShape,
    cellGap: p.cellGap / 100,
    inset: p.inset / 100,
    background: p.background,
    width: ctx.width,
    height: ctx.height,
  });
}

const isStyle = (style: AvatarParams["style"]) => (p: AvatarParams) => p.style === style;
const notInitials = (p: AvatarParams) => p.style !== "initials";

export const avatarTool = defineTool({
  id: ID,
  version: 1,
  category: ["social", "patterns"],
  schema,
  defaults,
  defaultSize: { width: 512, height: 512 },
  sizePresets: SIZES,
  presets: [
    preset("classic", {}),
    preset("pastel", {
      palette: ["#f4acb7", "#ffcad4", "#cdb4db", "#bde0fe", "#a2d2ff", "#caffbf", "#fdffb6"],
      shape: "rounded",
      font: "serif",
      fontWeight: 500,
      name: "Lena Brunner",
    }),
    preset("pattern", {
      fill: "pattern",
      pattern: "polka-staggered",
      patternScale: 12,
      patternOpacity: 25,
      name: "Noah Keller",
      fontWeight: 800,
    }),
    preset("gradient", {
      fill: "gradient",
      gradientAngle: 135,
      palette: ["#7f5af0", "#2cb67d", "#ff8906", "#e53170", "#3da9fc", "#ef4565"],
      font: "rounded",
      fontWeight: 700,
      name: "Mia Schmid",
    }),
    preset("identicon", {
      style: "identicon",
      shape: "rounded",
      radius: 18,
      name: "musterli",
      inset: 14,
    }),
    preset("pixel", {
      style: "identicon",
      shape: "square",
      grid: 7,
      cellShape: "dot",
      cellGap: 12,
      inset: 10,
      name: "pixel-friend",
      palette: ["#0f172a", "#1e293b", "#312e81", "#134e4a", "#4c0519"],
    }),
    preset("bauhaus", {
      background: "#f1e9da",
      style: "shapes",
      shape: "square",
      inset: 0,
      name: "Bauhaus",
      palette: ["#f1e9da", "#e63946", "#1d3557", "#f4a261", "#2a9d8f"],
      inkAuto: false,
      ink: "#111827",
    }),
  ],
  controls: {
    groups: [
      { id: "content", labelKey: `tools.${ID}.groups.content` },
      COMMON_GROUPS.shape,
      COMMON_GROUPS.colors,
      { id: "type", labelKey: `tools.${ID}.groups.type` },
    ],
    order: [
      "style",
      "name",
      "letters",
      "initials",
      "source",
      "grid",
      "cellShape",
      "cellGap",
      "inset",
      "shape",
      "radius",
      "palette",
      "fill",
      "gradientAngle",
      "pattern",
      "patternScale",
      "patternOpacity",
      "inkAuto",
      "ink",
      "background",
      "font",
      "fontWeight",
      "fontSize",
    ],
    params: {
      style: {
        group: "content",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "style", AVATAR_STYLES),
      },
      name: { group: "content", descriptionKey: `tools.${ID}.params.name.description` },
      letters: { group: "content", step: 1, visibleWhen: isStyle("initials") },
      initials: {
        group: "content",
        descriptionKey: `tools.${ID}.params.initials.description`,
        visibleWhen: isStyle("initials"),
      },
      source: {
        group: "content",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "source", AVATAR_SOURCES),
        descriptionKey: `tools.${ID}.params.source.description`,
      },
      grid: { group: "content", step: 1, visibleWhen: isStyle("identicon") },
      cellShape: {
        group: "content",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "cellShape", IDENTICON_CELL_SHAPES),
        visibleWhen: isStyle("identicon"),
      },
      cellGap: { group: "content", step: 1, unit: "%", visibleWhen: isStyle("identicon") },
      inset: { group: "content", step: 1, unit: "%", visibleWhen: notInitials },
      shape: {
        group: "shape",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "shape", AVATAR_SHAPES),
      },
      radius: { group: "shape", step: 1, unit: "%", visibleWhen: (p) => p.shape === "rounded" },
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
          const colors = avatarColors(p.palette, avatarHash(p.name), p.inkAuto ? null : p.ink);
          return patternThumbnail(value, colors.base, colors.ink);
        },
        visibleWhen: (p) => p.fill === "pattern",
      },
      patternScale: {
        group: "colors",
        step: 1,
        unit: "%",
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
      background: {
        group: "colors",
        labelKey: `tools.${ID}.params.background.label`,
        descriptionKey: `tools.${ID}.params.background.description`,
      },
      font: {
        group: "type",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "font", AVATAR_FONTS),
        visibleWhen: isStyle("initials"),
      },
      fontWeight: { group: "type", step: 100, visibleWhen: isStyle("initials") },
      fontSize: { group: "type", step: 1, unit: "%", visibleWhen: isStyle("initials") },
    },
  },
  randomize(rng, current, locks) {
    const fill = rng.pick(AVATAR_FILLS);
    const next: AvatarParams = {
      ...current,
      palette: randomPalette(rng, rng.int(5, 8)),
      fill,
      gradientAngle: rng.int(0, 7) * 45,
      pattern: rng.pick(PATTERN_GROUPS.flatMap((g) => g.values.map(String))),
      patternScale: rng.int(8, 20),
      patternOpacity: rng.int(20, 45),
      font: rng.pick(AVATAR_FONTS),
      fontWeight: rng.int(4, 8) * 100,
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors) {
    // The foreground follows each base colour, so it stays readable.
    return { palette: colors.slice(), inkAuto: true };
  },
  render: { kind: "svg", render },
  exports: ["svg", "png", "jpg", "webp"],
});
