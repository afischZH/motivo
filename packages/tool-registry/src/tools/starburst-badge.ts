/**
 * Shapes and stickers: starburst badge (docs/TOOLS.md D7). A price tag,
 * seal or sticker with a spiky, scalloped, wavy or zigzag edge and up to two
 * lines of text. The GIF turns the edge by one point per loop.
 */
import {
  AVATAR_FONTS,
  STARBURST_POINTS_MAX,
  STARBURST_POINTS_MIN,
  STARBURST_RINGS,
  STARBURST_SHAPES,
  STARBURST_TEXT_MAX,
  contrastRatio,
  oklchToHex,
  starburstSvg,
} from "@musterli/engine";
import * as z from "zod";
import { backgroundSchema, colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels } from "./shared";

const ID = "starburst-badge";

const schema = z.object({
  shape: z.enum(STARBURST_SHAPES),
  points: z.int().min(STARBURST_POINTS_MIN).max(STARBURST_POINTS_MAX),
  /** Edge depth in percent of the radius. */
  depth: z.number().min(0).max(50),
  rotation: z.number().min(0).max(360),
  /** Tilt of the whole badge in degrees. */
  tilt: z.number().min(-45).max(45),
  /** Badge size in percent of the shorter edge. */
  size: z.number().min(10).max(100),
  line1: z.string().max(STARBURST_TEXT_MAX),
  line2: z.string().max(STARBURST_TEXT_MAX),
  font: z.enum(AVATAR_FONTS),
  fontWeight: z.int().min(100).max(900),
  /** Size of the first line in percent of the inner radius. */
  textSize: z.number().min(10).max(100),
  ring: z.enum(STARBURST_RINGS),
  fill: colorSchema,
  gradient: z.boolean(),
  fill2: colorSchema,
  ink: colorSchema,
  /** Die-cut border in percent of the radius. */
  border: z.number().min(0).max(20),
  borderColor: colorSchema,
  /** Hard shadow offset in percent of the radius. */
  shadow: z.number().min(0).max(20),
  shadowColor: colorSchema,
  background: backgroundSchema,
});

export type StarburstBadgeParams = z.output<typeof schema>;

const defaults: StarburstBadgeParams = {
  shape: "spiky",
  points: 18,
  depth: 16,
  rotation: 0,
  tilt: -12,
  size: 80,
  line1: "-20%",
  line2: "SALE",
  font: "sans",
  fontWeight: 900,
  textSize: 62,
  ring: "dashed",
  fill: "#ef4444",
  gradient: false,
  fill2: "#f97316",
  ink: "#ffffff",
  border: 0,
  borderColor: "#ffffff",
  shadow: 0,
  shadowColor: "#111111",
  background: "#fff7ed",
};

const preset = (
  id: string,
  params: Partial<StarburstBadgeParams>,
): Preset<StarburstBadgeParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const starburstBadgeTool = defineTool({
  id: ID,
  version: 1,
  category: ["icons", "social"],
  schema,
  defaults,
  defaultSize: { width: 1080, height: 1080 },
  contentParams: ["line1", "line2"],
  presets: [
    preset("sale", {}),
    preset("new", {
      shape: "scallop",
      points: 14,
      depth: 10,
      tilt: 8,
      line1: "NEW",
      line2: "",
      font: "rounded",
      fill: "#facc15",
      ink: "#1c1917",
      ring: "none",
      background: "#1c1917",
    }),
    preset("seal", {
      shape: "zigzag",
      points: 30,
      depth: 12,
      tilt: 0,
      line1: "100%",
      line2: "ORGANIC",
      font: "serif",
      fontWeight: 700,
      fill: "#15803d",
      ring: "solid",
      background: "#f0fdf4",
    }),
    preset("sticker", {
      shape: "wavy",
      points: 10,
      depth: 12,
      tilt: -8,
      line1: "Hello!",
      line2: "",
      font: "rounded",
      fill: "#8b5cf6",
      gradient: true,
      fill2: "#ec4899",
      ring: "none",
      border: 8,
      shadow: 6,
      shadowColor: "#1e1b4b",
      background: "#e0e7ff",
    }),
    preset("price", {
      shape: "spiky",
      points: 24,
      depth: 10,
      tilt: 10,
      line1: "9.90",
      line2: "ONLY",
      fill: "#2563eb",
      ring: "dotted",
      background: "#eff6ff",
    }),
    preset("retro", {
      shape: "circle",
      tilt: 0,
      line1: "EST.",
      line2: "2026",
      font: "serif",
      fontWeight: 700,
      textSize: 40,
      fill: "#c2410c",
      ink: "#fff7ed",
      ring: "dotted",
      border: 6,
      borderColor: "#fff7ed",
      shadow: 5,
      shadowColor: "#7c2d12",
      background: "#fde68a",
    }),
    preset("burst", {
      shape: "spiky",
      points: 40,
      depth: 22,
      tilt: -6,
      line1: "WOW",
      line2: "",
      fill: "#fde047",
      gradient: true,
      fill2: "#f97316",
      ink: "#7f1d1d",
      ring: "none",
      background: "#0ea5e9",
    }),
    preset("quality", {
      shape: "scallop",
      points: 20,
      depth: 8,
      tilt: 0,
      line1: "TOP",
      line2: "QUALITY",
      font: "serif",
      fontWeight: 800,
      fill: "#eab308",
      gradient: true,
      fill2: "#a16207",
      ink: "#ffffff",
      ring: "solid",
      background: "transparent",
    }),
  ],
  controls: {
    groups: [
      COMMON_GROUPS.shape,
      { id: "text", labelKey: `tools.${ID}.groups.text` },
      { id: "sticker", labelKey: `tools.${ID}.groups.sticker` },
      COMMON_GROUPS.colors,
    ],
    order: [
      "shape",
      "points",
      "depth",
      "rotation",
      "tilt",
      "size",
      "line1",
      "line2",
      "font",
      "fontWeight",
      "textSize",
      "ring",
      "border",
      "borderColor",
      "shadow",
      "shadowColor",
      "fill",
      "gradient",
      "fill2",
      "ink",
      "background",
    ],
    params: {
      shape: {
        group: "shape",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "shape", STARBURST_SHAPES),
      },
      points: { group: "shape", step: 1, visibleWhen: (p) => p.shape !== "circle" },
      depth: { group: "shape", step: 1, unit: "%", visibleWhen: (p) => p.shape !== "circle" },
      rotation: { group: "shape", step: 1, unit: "°", visibleWhen: (p) => p.shape !== "circle" },
      tilt: { group: "shape", step: 1, unit: "°" },
      size: { group: "shape", step: 1, unit: "%" },
      line1: { group: "text", kind: "text", lockable: false },
      line2: { group: "text", kind: "text", lockable: false },
      font: {
        group: "text",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "font", AVATAR_FONTS),
      },
      fontWeight: { group: "text", step: 100 },
      textSize: { group: "text", step: 1, unit: "%" },
      ring: {
        group: "sticker",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "ring", STARBURST_RINGS),
      },
      border: { group: "sticker", step: 0.5, unit: "%" },
      borderColor: { group: "sticker", visibleWhen: (p) => p.border > 0 },
      shadow: { group: "sticker", step: 0.5, unit: "%" },
      shadowColor: { group: "sticker", visibleWhen: (p) => p.shadow > 0 },
      fill: { group: "colors" },
      gradient: { group: "colors" },
      fill2: { group: "colors", visibleWhen: (p) => p.gradient },
      ink: { group: "colors" },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    // New edge and colours; text, type and sticker settings stay.
    const h = rng.float(0, 360);
    const fill = oklchToHex({ l: rng.float(0.55, 0.85), c: 0.18, h });
    const fill2 = oklchToHex({ l: rng.float(0.55, 0.8), c: 0.2, h: (h + rng.float(20, 60)) % 360 });
    const light = "#ffffff";
    const dark = "#111111";
    const next: StarburstBadgeParams = {
      ...current,
      shape: rng.pick(["spiky", "spiky", "scallop", "wavy", "zigzag"] as const),
      points: rng.int(8, 36),
      depth: rng.int(6, 26),
      rotation: rng.int(0, 359),
      tilt: rng.int(-20, 20),
      fill,
      fill2,
      ink: contrastRatio(light, fill) >= contrastRatio(dark, fill) ? light : dark,
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors, current) {
    return { fill: colors[0] ?? current.fill, fill2: colors[1] ?? current.fill2 };
  },
  render: {
    kind: "svg",
    render(p, { width, height, t }) {
      return starburstSvg({
        width,
        height,
        background: p.background,
        shape: p.shape,
        points: p.points,
        depth: p.depth / 100,
        rotation: p.rotation,
        tilt: p.tilt,
        size: p.size / 100,
        fill: p.fill,
        ...(p.gradient ? { fill2: p.fill2 } : {}),
        ink: p.ink,
        ring: p.ring,
        border: p.border / 100,
        borderColor: p.borderColor,
        shadow: p.shadow / 100,
        shadowColor: p.shadowColor,
        line1: p.line1,
        line2: p.line2,
        font: p.font,
        fontWeight: p.fontWeight,
        textSize: p.textSize / 100,
        ...(t !== undefined ? { t } : {}),
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  animation: { sources: ["time", "colors"] },
});
