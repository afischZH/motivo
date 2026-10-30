/**
 * M3-AP12: Seamless Patterns (docs/TOOLS.md A2, pulled forward from M4).
 * One motif (built-in shape or the user's own SVG or picture) repeated in a
 * tile that wraps without seams, in four tiling modes.
 *
 * Uploads live in the `upload` param, which is a local param: never in
 * share links (reset to `null`, the design then shows the built-in shape).
 * SVG uploads are sanitised again before every use and only ever embedded
 * as images. The pass and the recoloured copies come from `svgAssetFor`
 * (../svg-asset.ts): the editor prepares them in its sanitize worker, so a
 * render only joins strings on the main thread.
 *
 * Motif sources (`motif`): a built-in shape or an upload (logo, own file),
 * a list of emoji (spread over the cells) or a short word or monogram. Emoji
 * and text use system fonts; the SVG embeds no font, so another app may draw
 * them with its own emoji set. Raster exports are made in the browser that
 * shows the preview and match it.
 */
import {
  SEAMLESS_ALTERNATES,
  SEAMLESS_SHAPES,
  SEAMLESS_TILINGS,
  tileShapeIds,
  randomPalette,
  seamlessLayout,
  seamlessPatternSvg,
  seamlessShapePath,
  seamlessTileSvg,
  svgBase64DataUri,
  type SeamlessLayout,
  type SeamlessMotif,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema, imageAssetSchema, visualParamsSchema, type ImageAsset } from "../common";
import { keepLocked } from "../randomize";
import { SEED_AND_COLOR_ANIMATION } from "../animation";
import {
  SHAPE_OPTION_LABEL_KEYS,
  shapePackGroups,
  shapePreview as libraryShapePreview,
} from "../shapes";
import { defineTool } from "../registry";
import { recolorSvgAsset, svgAssetFor } from "../svg-asset";
import type { Preset, RenderContext } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "seamless-patterns";

export const SEAMLESS_COLOR_MODES = ["single", "palette"] as const;
/** `shape` covers the built-in shapes and uploads (logos, own files). */
export const SEAMLESS_MOTIFS = ["shape", "emoji", "text"] as const;
export const SEAMLESS_TEXT_FONTS = ["sans", "serif", "mono", "rounded"] as const;
export type SeamlessTextFont = (typeof SEAMLESS_TEXT_FONTS)[number];

/** Most emoji spread over one pattern. */
export const SEAMLESS_MAX_EMOJI = 8;
export const SEAMLESS_TEXT_MAX = 24;

/** System font stacks (no web font: nothing to load, nothing embedded). */
const TEXT_FONTS: Record<SeamlessTextFont, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "ui-monospace, Menlo, Consolas, 'Liberation Mono', monospace",
  rounded: "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif",
};
const EMOJI_FONT = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
/** Average advance of a bold glyph in em, a safe guess for the motif box. */
const TEXT_ADVANCE = 0.68;
/** Emoji font size in the 100-unit box: emoji are slightly wider than 1 em in some fonts. */
const EMOJI_EM = 84;

const schema = visualParamsSchema.extend({
  motif: z.enum(SEAMLESS_MOTIFS),
  shape: z.enum(SEAMLESS_SHAPES),
  /** The user's own SVG or picture; `null` = the built-in shape. Local only. */
  upload: imageAssetSchema.nullable(),
  /** Uploads: keep their colours instead of painting them in the motif colour. */
  keepOriginalColors: z.boolean(),
  /** Emoji to repeat, mixed over the cells (up to `SEAMLESS_MAX_EMOJI`, spaces ignored). */
  emoji: z.string().max(96),
  /** Emoji: paint them in the motif colours instead of their own colours. */
  emojiTint: z.boolean(),
  /** Word, name or monogram to repeat. */
  text: z.string().max(SEAMLESS_TEXT_MAX),
  textFont: z.enum(SEAMLESS_TEXT_FONTS),
  tiling: z.enum(SEAMLESS_TILINGS),
  /** Turn every second row or checkerboard cell by 180° (logo walls). */
  alternate: z.enum(SEAMLESS_ALTERNATES),
  /** Element size in px (longer side of the motif). */
  size: z.int().min(8).max(400),
  spacingX: z.int().min(0).max(400),
  spacingY: z.int().min(0).max(400),
  /** Cells per tile side: more cells, more variation before the tile repeats. */
  cells: z.int().min(1).max(6),
  rotation: z.number().min(0).max(360),
  rotationJitter: z.number().min(0).max(180),
  sizeVariance: z.number().min(0).max(0.8),
  jitter: z.number().min(0).max(0.5),
  colorMode: z.enum(SEAMLESS_COLOR_MODES),
  color: colorSchema,
});

export type SeamlessPatternsParams = z.output<typeof schema>;

const defaults: SeamlessPatternsParams = {
  background: "#fefae0",
  palette: ["#bc6c25", "#606c38", "#dda15e"],
  motif: "shape",
  shape: "flower",
  upload: null,
  keepOriginalColors: false,
  emoji: "🌸🍋🌿",
  emojiTint: false,
  text: "Musterli",
  textFont: "sans",
  tiling: "brick",
  alternate: "none",
  size: 48,
  spacingX: 32,
  spacingY: 28,
  cells: 2,
  rotation: 0,
  rotationJitter: 20,
  sizeVariance: 0.15,
  jitter: 0.08,
  colorMode: "palette",
  color: "#283618",
};

const preset = (
  id: string,
  params: Partial<SeamlessPatternsParams>,
): Preset<SeamlessPatternsParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/**
 * Most bytes of recoloured SVG copies in one design. Monochrome SVG uploads
 * in palette mode need one recoloured copy per colour; a large upload uses
 * fewer colours rather than a huge document.
 */
const MAX_RECOLORED_BYTES = 2_000_000;

/** Data URIs of recoloured or sanitised SVG, per (svg, colour). */
const dataUris = new Map<string, string>();
const DATA_URI_ENTRIES = 24;

function dataUriOf(svg: string): string {
  let uri = dataUris.get(svg);
  if (uri === undefined) {
    uri = svgBase64DataUri(svg);
    if (dataUris.size >= DATA_URI_ENTRIES) {
      const oldest = dataUris.keys().next().value;
      if (oldest !== undefined) dataUris.delete(oldest);
    }
    dataUris.set(svg, uri);
  }
  return uri;
}

interface ResolvedMotif {
  motif: SeamlessMotif;
  colors: string[];
  aspect: number;
}

function shapeMotif(p: SeamlessPatternsParams): ResolvedMotif {
  return {
    motif: { kind: "path", d: seamlessShapePath(p.shape) },
    colors: p.colorMode === "palette" ? [...p.palette] : [p.color],
    aspect: 1,
  };
}

function uploadMotif(p: SeamlessPatternsParams, upload: ImageAsset): ResolvedMotif | null {
  const mono = !p.keepOriginalColors;
  const colors = mono ? (p.colorMode === "palette" ? [...p.palette] : [p.color]) : [p.color];
  if (upload.kind === "raster") {
    return {
      motif: { kind: "image", hrefs: [upload.href], tint: mono },
      colors,
      aspect: upload.width / upload.height,
    };
  }
  // Defence in depth: whatever arrives in params is sanitised again (prepared once).
  const clean = svgAssetFor(upload.svg);
  if (!clean) return null;
  const aspect = clean.width / clean.height;
  if (!mono)
    return { motif: { kind: "image", hrefs: [dataUriOf(clean.svg)], tint: false }, colors, aspect };
  const budget = Math.max(1, Math.floor(MAX_RECOLORED_BYTES / Math.max(1, clean.svg.length)));
  const used = colors.slice(0, budget);
  const hrefs: string[] = [];
  for (const color of used) {
    const recolored = recolorSvgAsset(clean, color);
    if (recolored === null) return null;
    hrefs.push(dataUriOf(recolored));
  }
  return { motif: { kind: "image", hrefs, tint: false }, colors: used, aspect };
}

/** Splits user text into graphemes (emoji with skin tones and ZWJ stay whole). */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/** The emoji list of the params: graphemes without whitespace, at most `SEAMLESS_MAX_EMOJI`. */
export function seamlessEmojiList(text: string): string[] {
  return graphemes(text)
    .filter((g) => g.trim() !== "")
    .slice(0, SEAMLESS_MAX_EMOJI);
}

function motifColors(p: SeamlessPatternsParams): string[] {
  return p.colorMode === "palette" ? [...p.palette] : [p.color];
}

function emojiMotif(p: SeamlessPatternsParams): ResolvedMotif | null {
  const glyphs = seamlessEmojiList(p.emoji);
  if (glyphs.length === 0) return null;
  return {
    motif: {
      kind: "glyphs",
      glyphs,
      fontFamily: EMOJI_FONT,
      fontWeight: 400,
      em: EMOJI_EM,
      paint: p.emojiTint ? "tint" : "original",
    },
    colors: p.emojiTint ? motifColors(p) : [p.color],
    aspect: 1,
  };
}

function textMotif(p: SeamlessPatternsParams): ResolvedMotif | null {
  const text = p.text.trim();
  if (text === "") return null;
  const width = Math.max(0.6, graphemes(text).length * TEXT_ADVANCE);
  return {
    motif: {
      kind: "glyphs",
      glyphs: [text],
      fontFamily: TEXT_FONTS[p.textFont],
      fontWeight: 700,
      // Longer side = 100 units: the width for words, the line height for one letter.
      em: width >= 1 ? 100 / width : 100,
      paint: "fill",
    },
    colors: motifColors(p),
    aspect: width,
  };
}

function resolve(p: SeamlessPatternsParams): ResolvedMotif {
  if (p.motif === "emoji") return emojiMotif(p) ?? shapeMotif(p);
  if (p.motif === "text") return textMotif(p) ?? shapeMotif(p);
  return (p.upload && uploadMotif(p, p.upload)) ?? shapeMotif(p);
}

/** Number of motifs to spread over the cells (only emoji lists have several). */
function motifCount(m: ResolvedMotif): number {
  return m.motif.kind === "glyphs" ? m.motif.glyphs.length : 1;
}

function layoutFor(
  p: SeamlessPatternsParams,
  m: ResolvedMotif,
  ctx: RenderContext,
): SeamlessLayout {
  return seamlessLayout({
    tiling: p.tiling,
    size: p.size,
    spacingX: p.spacingX,
    spacingY: p.spacingY,
    cells: p.cells,
    rotation: p.rotation,
    rotationJitter: p.rotationJitter,
    sizeVariance: p.sizeVariance,
    jitter: p.jitter,
    colorCount: m.colors.length,
    aspect: m.aspect,
    alternate: p.alternate,
    // Words are wide: flat cells keep the rows close (shapes and uploads keep square cells).
    cellFromBox: p.motif === "text",
    motifCount: motifCount(m),
    rng: ctx.rng,
  });
}

/** Small preview of one library shape in the current colours (thumbnail picker). */
function shapePreview(value: string | number, p: SeamlessPatternsParams): { readonly svg: string } {
  const fill = p.colorMode === "palette" ? (p.palette[0] ?? p.color) : p.color;
  return libraryShapePreview(value, fill, p.background);
}

/** Shapes the space bar picks from: all but the edge-filling tile shapes. */
const TILE_SHAPES: ReadonlySet<string> = new Set(tileShapeIds());
const RANDOM_SHAPES = SEAMLESS_SHAPES.filter((s) => !TILE_SHAPES.has(s));

const isShape = (p: SeamlessPatternsParams): boolean => p.motif === "shape";
const hasUpload = (p: SeamlessPatternsParams): boolean => isShape(p) && p.upload !== null;
const usesColors = (p: SeamlessPatternsParams): boolean =>
  p.motif === "emoji" ? p.emojiTint : !(hasUpload(p) && p.keepOriginalColors);

export const seamlessPatternsTool = defineTool({
  id: ID,
  version: 1,
  category: ["patterns", "backgrounds"],
  schema,
  defaults,
  localParams: ["upload"],
  migrateParams(raw) {
    // Before emoji and text (2026-10-30): no motif source, no alternation.
    if ("motif" in raw) return raw;
    return {
      ...raw,
      motif: "shape",
      emoji: defaults.emoji,
      emojiTint: defaults.emojiTint,
      text: defaults.text,
      textFont: defaults.textFont,
      alternate: defaults.alternate,
    };
  },
  presets: [
    preset("meadow", {}),
    preset("sweethearts", {
      background: "#fff0f3",
      palette: ["#ff4d6d", "#c9184a", "#ff8fa3"],
      shape: "heart",
      tiling: "brick",
      size: 36,
      spacingX: 28,
      spacingY: 24,
      rotationJitter: 25,
      sizeVariance: 0.2,
    }),
    preset("terrazzo", {
      background: "#f2ede4",
      palette: ["#e07a5f", "#3d405b", "#81b29a", "#f2cc8f"],
      shape: "pebble",
      tiling: "grid",
      cells: 5,
      size: 26,
      spacingX: 22,
      spacingY: 22,
      rotationJitter: 180,
      sizeVariance: 0.6,
      jitter: 0.4,
    }),
    preset("starlight", {
      background: "#14213d",
      shape: "sparkle",
      tiling: "halfDrop",
      colorMode: "single",
      color: "#fca311",
      size: 30,
      spacingX: 50,
      spacingY: 40,
      cells: 3,
      rotationJitter: 0,
      sizeVariance: 0.5,
      jitter: 0.3,
    }),
    preset("botanical", {
      background: "#f1faee",
      palette: ["#2d6a4f", "#52b788", "#95d5b2"],
      shape: "leaf",
      tiling: "mirror",
      size: 54,
      spacingX: 14,
      spacingY: 14,
      cells: 2,
      rotation: 30,
      rotationJitter: 30,
      sizeVariance: 0.2,
      jitter: 0.12,
    }),
    preset("bauhaus", {
      background: "#f4f1de",
      palette: ["#e63946", "#1d3557", "#f4a261", "#2a9d8f"],
      shape: "semicircle",
      tiling: "grid",
      cells: 4,
      size: 44,
      spacingX: 8,
      spacingY: 8,
      rotationJitter: 180,
      sizeVariance: 0,
      jitter: 0,
    }),
    preset("waves", {
      background: "#caf0f8",
      shape: "wave",
      tiling: "brick",
      colorMode: "single",
      color: "#0077b6",
      size: 56,
      spacingX: 12,
      spacingY: 20,
      cells: 1,
      rotationJitter: 0,
      sizeVariance: 0,
      jitter: 0,
    }),
    preset("fruit-salad", {
      background: "#fff8e7",
      motif: "emoji",
      emoji: "🍋🍓🍊🥝🍑",
      tiling: "halfDrop",
      size: 44,
      spacingX: 36,
      spacingY: 30,
      cells: 3,
      rotationJitter: 25,
      sizeVariance: 0.2,
      jitter: 0.15,
    }),
    preset("party-night", {
      background: "#1b1340",
      palette: ["#ff5d8f", "#ffd166", "#06d6a0", "#4cc9f0"],
      motif: "emoji",
      emoji: "🎉⭐🎈💖",
      emojiTint: true,
      tiling: "brick",
      size: 34,
      spacingX: 40,
      spacingY: 30,
      cells: 3,
      rotationJitter: 30,
      sizeVariance: 0.25,
      jitter: 0.2,
    }),
    preset("wordmark", {
      background: "#0f172a",
      motif: "text",
      text: "Musterli",
      textFont: "sans",
      colorMode: "single",
      color: "#38bdf8",
      tiling: "brick",
      alternate: "rows",
      size: 120,
      spacingX: 40,
      spacingY: 36,
      cells: 1,
      rotationJitter: 0,
      sizeVariance: 0,
      jitter: 0,
    }),
    preset("monogram", {
      background: "#f5efe6",
      palette: ["#7f5539", "#b08968"],
      motif: "text",
      text: "AM",
      textFont: "serif",
      tiling: "grid",
      alternate: "checker",
      size: 56,
      spacingX: 30,
      spacingY: 30,
      cells: 2,
      rotation: 0,
      rotationJitter: 0,
      sizeVariance: 0,
      jitter: 0,
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.shape, COMMON_GROUPS.layout, COMMON_GROUPS.colors],
    order: [
      "motif",
      "upload",
      "shape",
      "keepOriginalColors",
      "emoji",
      "emojiTint",
      "text",
      "textFont",
      "tiling",
      "alternate",
      "size",
      "spacingX",
      "spacingY",
      "cells",
      "rotation",
      "rotationJitter",
      "sizeVariance",
      "jitter",
      "colorMode",
      "color",
      "palette",
      "background",
    ],
    params: {
      motif: {
        group: "shape",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "motif", SEAMLESS_MOTIFS),
        lockable: false,
      },
      upload: { group: "shape", kind: "image", lockable: false, visibleWhen: isShape },
      shape: {
        group: "shape",
        kind: "thumbnails",
        optionLabelKeys: SHAPE_OPTION_LABEL_KEYS,
        optionPreview: shapePreview,
        optionGroups: shapePackGroups(),
        brandShapesParam: "upload",
        visibleWhen: (p) => isShape(p) && !hasUpload(p),
      },
      keepOriginalColors: { group: "shape", visibleWhen: hasUpload },
      emoji: {
        group: "shape",
        kind: "text",
        lockable: false,
        visibleWhen: (p) => p.motif === "emoji",
      },
      emojiTint: { group: "shape", visibleWhen: (p) => p.motif === "emoji" },
      text: {
        group: "shape",
        kind: "text",
        lockable: false,
        visibleWhen: (p) => p.motif === "text",
      },
      textFont: {
        group: "shape",
        optionLabelKeys: optionLabels(ID, "textFont", SEAMLESS_TEXT_FONTS),
        visibleWhen: (p) => p.motif === "text",
      },
      tiling: { group: "layout", optionLabelKeys: optionLabels(ID, "tiling", SEAMLESS_TILINGS) },
      alternate: {
        group: "layout",
        optionLabelKeys: optionLabels(ID, "alternate", SEAMLESS_ALTERNATES),
      },
      size: { group: "layout", step: 1, unit: "px" },
      spacingX: { group: "layout", step: 1, unit: "px" },
      spacingY: { group: "layout", step: 1, unit: "px" },
      cells: { group: "layout", step: 1 },
      rotation: { group: "layout", kind: "angle", step: 1, unit: "°" },
      rotationJitter: { group: "layout", step: 1, unit: "°" },
      sizeVariance: { group: "layout", step: 0.01, advanced: true },
      jitter: { group: "layout", step: 0.01, advanced: true },
      colorMode: {
        group: "colors",
        optionLabelKeys: optionLabels(ID, "colorMode", SEAMLESS_COLOR_MODES),
        visibleWhen: usesColors,
      },
      color: { group: "colors", visibleWhen: (p) => usesColors(p) && p.colorMode === "single" },
      palette: {
        group: "colors",
        labelKey: COMMON_LABELS.palette,
        visibleWhen: (p) => usesColors(p) && p.colorMode === "palette",
      },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const colors = randomPalette(rng, rng.int(3, 5));
    const background = colors.pop() ?? current.background;
    const size = rng.int(24, 72);
    const next: SeamlessPatternsParams = {
      background: rng.bool(0.5) ? current.background : background,
      palette: colors.length >= 2 ? colors : randomPalette(rng, 3),
      // The motif source and the user's own content (file, emoji, text) stay.
      motif: current.motif,
      shape: rng.pick(RANDOM_SHAPES),
      upload: current.upload,
      keepOriginalColors: current.keepOriginalColors,
      emoji: current.emoji,
      emojiTint: current.emojiTint,
      text: current.text,
      textFont: current.textFont,
      tiling: rng.pick(SEAMLESS_TILINGS),
      alternate: current.alternate,
      size,
      spacingX: rng.int(Math.round(size * 0.1), Math.round(size * 1.2)),
      spacingY: rng.int(Math.round(size * 0.1), Math.round(size * 1.2)),
      cells: rng.int(1, 4),
      rotation: rng.bool(0.6) ? 0 : rng.int(0, 359),
      rotationJitter: rng.bool(0.4) ? 0 : rng.pick([15, 30, 45, 90, 180]),
      sizeVariance: roundTo(rng.float(0, 0.5), 2),
      jitter: roundTo(rng.float(0, 0.3), 2),
      colorMode: rng.bool(0.7) ? "palette" : "single",
      color: colors[0] ?? current.color,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, ctx) {
      const m = resolve(p);
      return seamlessPatternSvg({
        layout: layoutFor(p, m, ctx),
        motif: m.motif,
        colors: m.colors,
        background: p.background,
        width: ctx.width,
        height: ctx.height,
      });
    },
  },
  tile: {
    render(p, ctx) {
      const m = resolve(p);
      const layout = layoutFor(p, m, ctx);
      return {
        svg: seamlessTileSvg({
          layout,
          motif: m.motif,
          colors: m.colors,
          background: p.background,
        }),
        width: layout.tileWidth,
        height: layout.tileHeight,
      };
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
  animation: SEED_AND_COLOR_ANIMATION,
});
