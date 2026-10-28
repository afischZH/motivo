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
 */
import {
  SEAMLESS_SHAPES,
  SEAMLESS_TILINGS,
  randomPalette,
  seamlessLayout,
  seamlessPatternSvg,
  seamlessShapePath,
  seamlessTileSvg,
  svgBase64DataUri,
  type SeamlessLayout,
  type SeamlessMotif,
} from "@motivo/engine";
import * as z from "zod";
import { colorSchema, imageAssetSchema, visualParamsSchema, type ImageAsset } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import { recolorSvgAsset, svgAssetFor } from "../svg-asset";
import type { Preset, RenderContext } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "seamless-patterns";

export const SEAMLESS_COLOR_MODES = ["single", "palette"] as const;

const schema = visualParamsSchema.extend({
  shape: z.enum(SEAMLESS_SHAPES),
  /** The user's own SVG or picture; `null` = the built-in shape. Local only. */
  upload: imageAssetSchema.nullable(),
  /** Uploads: keep their colours instead of painting them in the motif colour. */
  keepOriginalColors: z.boolean(),
  tiling: z.enum(SEAMLESS_TILINGS),
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
  shape: "flower",
  upload: null,
  keepOriginalColors: false,
  tiling: "brick",
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

function resolve(p: SeamlessPatternsParams): ResolvedMotif {
  return (p.upload && uploadMotif(p, p.upload)) ?? shapeMotif(p);
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
    rng: ctx.rng,
  });
}

const escapeAttr = (v: string): string => v.replace(/[^#0-9a-zA-Z]/g, "");

/** Small preview of one built-in shape in the current colours (thumbnail picker). */
function shapePreview(value: string | number, p: SeamlessPatternsParams): { svg: string } {
  const shape = (SEAMLESS_SHAPES as readonly string[]).includes(String(value))
    ? (value as SeamlessPatternsParams["shape"])
    : "circle";
  const fill = escapeAttr(p.colorMode === "palette" ? (p.palette[0] ?? p.color) : p.color);
  const bg =
    p.background === "transparent"
      ? ""
      : `<rect x="-60" y="-60" width="120" height="120" fill="${escapeAttr(p.background)}"/>`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="-60 -60 120 120">${bg}<path d="${seamlessShapePath(shape)}" fill="${fill}"/></svg>`,
  };
}

const hasUpload = (p: SeamlessPatternsParams): boolean => p.upload !== null;
const usesColors = (p: SeamlessPatternsParams): boolean => !(hasUpload(p) && p.keepOriginalColors);

export const seamlessPatternsTool = defineTool({
  id: ID,
  version: 1,
  category: ["patterns", "backgrounds"],
  schema,
  defaults,
  localParams: ["upload"],
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
  ],
  controls: {
    groups: [COMMON_GROUPS.shape, COMMON_GROUPS.layout, COMMON_GROUPS.colors],
    order: [
      "upload",
      "shape",
      "keepOriginalColors",
      "tiling",
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
      upload: { group: "shape", kind: "image", lockable: false },
      shape: {
        group: "shape",
        kind: "thumbnails",
        optionLabelKeys: optionLabels(ID, "shape", SEAMLESS_SHAPES),
        optionPreview: shapePreview,
        visibleWhen: (p) => !hasUpload(p),
      },
      keepOriginalColors: { group: "shape", visibleWhen: hasUpload },
      tiling: { group: "layout", optionLabelKeys: optionLabels(ID, "tiling", SEAMLESS_TILINGS) },
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
      shape: rng.pick(SEAMLESS_SHAPES),
      // The user's own file is never replaced by a random value.
      upload: current.upload,
      keepOriginalColors: current.keepOriginalColors,
      tiling: rng.pick(SEAMLESS_TILINGS),
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
});
